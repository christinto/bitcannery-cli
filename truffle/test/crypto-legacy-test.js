const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')
const BigNumber = require('bignumber.js')

const {web3,
  assertTxSucceeds,
  assertTxFails,
  getAccountBalance} = require('./helpers')

const {States,
  assembleKeeperStruct,
  assembleProposalStruct} = require('./crypto-legacy-data-layout')

contract('CryptoLegacy contract', (accounts) => {

  function getAddresses() {
    const [_, Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4, keeper_5, keeper_6] = accounts
    return {Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4, keeper_5, keeper_6}
  }

  const addr = getAddresses()

  const pubKeys = {
    keeper_1: '0xaabbcc',
    keeper_2: '0xbbccdd',
    keeper_3: '0xccddee',
    keeper_4: '0xddeeff',
  }

  const keyParts = {
    keeper_1: '0x1234567890',
    keeper_3: '0xababccddef',
  }

  const keyPartHashes = {
    keeper_1: web3.utils.soliditySha3(keyParts.keeper_1),
    keeper_3: web3.utils.soliditySha3(keyParts.keeper_3),
  }

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours
  const keepingFee = 100
  const finalReward = 1000

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(
      checkInIntervalSec,
      keepingFee,
      finalReward,
      {from: addr.Alice}
    )
  })

  it(`starts with owner set to the creator of the contract`, async () => {
    const owner = await contract.owner()
    assert.equal(owner.toString(), addr.Alice)
  })

  it(`should be started in CallForKeepers state`, async () => {
    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeepers)
  })

  it(`allows first Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_1, {from: addr.keeper_1}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 1)
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_2, {from: addr.keeper_2}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 2)
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_3, {from: addr.keeper_3}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 3)
  })

  it(`doesn't allow to submit two proposals with same public key`, async () => {
    await assertTxFails(contract.submitKeeperProposal(pubKeys.keeper_2, {from: addr.keeper_4}))
  })

  it(`doesn't allow the same Keeper to submit a proposal twice`, async () => {
    await assertTxFails(contract.submitKeeperProposal(pubKeys.keeper_1, {from: addr.keeper_1})) // same key
    await assertTxFails(contract.submitKeeperProposal('0x123456', {from: addr.keeper_1})) // diff key
  })

  it(`doesn't allow owner to submit a proposal`, async () => {
    await assertTxFails(contract.submitKeeperProposal(pubKeys.keeper_1, {from: addr.Alice})) // same key
    await assertTxFails(contract.submitKeeperProposal('0x123456', {from: addr.Alice})) // diff key
  })

  it(`doesn't allow to submit a proposal with public key longer than 128 bytes`, async () => {
    let longPubKey = '0x'
    for (let i = 0; i < 129; ++i) {
      longPubKey += 'ab'
    }
    await assertTxFails(contract.submitKeeperProposal(longPubKey, {from: addr.keeper_4}))
  })

  function getAcceptKeepersParams() {
    return [
      [0, 2], // selected proposal indices
      [keyPartHashes.keeper_1, keyPartHashes.keeper_3], // hashes of key parts
      '0xabcdef', // encrypted key parts, packed into byte array
      '0x123456', // encrypted data
      '0x678901', // hash of original data
    ]
  }

  it('Keepers couldn\'t accept Keepers', async () => {
    await assertTxFails(contract.acceptKeepers(...getAcceptKeepersParams(),
      {from: addr.keeper_1, value: 2 * finalReward}))
  })

  it('owner couldn\'t check-in before Keepers are accepted', async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.Alice}))
  })

  it(`owner couldn\'t accept not proposed Keepers`, async () => {

    const callParams = getAcceptKeepersParams()

    const [acceptinIndices , [hash_1, hash_2], ...other] = callParams

    await assertTxFails(contract.acceptKeepers(
      [acceptinIndices[0], 10],
      [hash_1, hash_2],
      ...other,
      {from: addr.Alice, value: 2 * finalReward}
    ))
  })

  it(`allows owner to accept selected Keeper proposals`, async () => {

    const callParams = getAcceptKeepersParams()

    const [_ , [hash_1, hash_2]] = callParams

    await assertTxSucceeds(contract.acceptKeepers(...callParams,
      {from: addr.Alice, value: 2 * finalReward}
    ))

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 2)

    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active)

    const firstKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_1))
    assert.equal(firstKeeper.publicKey, pubKeys.keeper_1)
    assert.equal(firstKeeper.keyPartHash, hash_1)

    const secondKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_3))
    assert.equal(secondKeeper.publicKey, pubKeys.keeper_3)
    assert.equal(secondKeeper.keyPartHash, hash_2)
  })

  it('Keeper couldn\'t check-in for contract owner', async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.keeper_1}))
  })

  it('owner could check-in in Active state', async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.keeper_1}))
  })

  it('not accepted Keeper couldn\'t check in', async () => {
    await assertTxFails(contract.keeperCheckIn({from: addr.keeper_2}))
  })

  it.skip('accepted Keeper could check in', async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))
  })

  it('keeper could send key only after Termination event', async () => {
    await assertTxFails(contract.supplyKey(keyParts.keeper_1), {from: addr.keeper_1})
  })

  it('accepted Keeper check-in sends right keeping fee to Keeper\'s account', async () => {
    const keeperToCheckIn = addr.keeper_3
    const timeElapsedMultiplier = 0.5
    // const fee = keepingFee * timeElapsedMultiplier
    // const balanceBefore = await getAccountBalance(keeperToCheckIn)
    // await increaseTimeSec(checkInIntervalSec * timeElapsedMultiplier)
    await assertTxSucceeds(contract.keeperCheckIn({from: keeperToCheckIn}))
    // const balanceAfter = await getAccountBalance(keeperToCheckIn)
    // assert.equal(balanceAfter, balanceBefore + fee, 'should have sent keeping fee')
  })

  it(`Keeper check-in transfers contract to CallForKeys state if owner `+
     `failed to check in in time`, async () => {

    await assertTxSucceeds(contract.increaseTimeBy(checkInIntervalSec * 2))
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))

    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeys)
  })

  it('not accepted keeper couldn\'t send key', async () => {
    await assertTxFails(contract.supplyKey('arara', {from: addr.keeper_2}))
  })

  it('accepted keeper couldn\'t send not valid key part', async () => {
    await assertTxFails(contract.supplyKey('ururu', {from: addr.keeper_1}))
  })

  it('accepted keeper could send valid key part and receive final reward', async () => {
    const balanceBefore = await getAccountBalance(addr.keeper_1)
    const {txPriceWei} = await assertTxSucceeds(contract.supplyKey(keyParts.keeper_1, {from: addr.keeper_1}))
    const balanceAfter = await getAccountBalance(addr.keeper_1)
    const expectedBalance = balanceBefore.plus(finalReward).minus(txPriceWei)
    assert.equal(balanceAfter.toString(), expectedBalance.toString())
  })

  it('second accepted keeper could send valid key part and receive final reward', async () => {
    const balanceBefore = await getAccountBalance(addr.keeper_3)
    const {txPriceWei} = await assertTxSucceeds(contract.supplyKey(keyParts.keeper_3, {from: addr.keeper_3}))
    const balanceAfter = await getAccountBalance(addr.keeper_3)
    const expectedBalance = balanceBefore.plus(finalReward).minus(txPriceWei)
    assert.equal(balanceAfter.toString(), expectedBalance.toString())
  })

})
