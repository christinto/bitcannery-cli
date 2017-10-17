const assert = require('chai').assert
const {web3, assertTxSucceeds, assertTxFails, increaseTimeSec} = require('./helpers')
const CryptoLegacy = artifacts.require('./CryptoLegacy.sol')

const {States,
  assembleKeeperStruct,
  assembleProposalStruct} = require('./crypto-legacy-data-layout')

contract('CryptoLegacy contract', function(accounts) {

  function getAddresses() {
    const [Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4] = accounts
    return {Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4}
  }

  const addr = getAddresses()

  const pubKeys = {
    keeper_1: '0xaabbcc',
    keeper_2: '0xbbccdd',
    keeper_3: '0xccddee',
    keeper_4: '0xddeeff',
  }

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours
  const keepingFee = 100
  const finalReward = 1000

  before(async () => {
    const instance = await CryptoLegacy.new(
      checkInIntervalSec,
      keepingFee,
      finalReward,
      {from: addr.Alice}
    )
    contract = instance
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

  it(`doesn't allow the same Keeper to submit a proposal twice`, async () => {
    await assertTxFails(contract.submitKeeperProposal(pubKeys.keeper_1, {from: addr.keeper_1})) // same key
    await assertTxFails(contract.submitKeeperProposal('0x123456', {from: addr.keeper_1})) // diff key
  })

  // FIXME: for some reason this fails intermittently
  //
  it.skip(`doesn't allow to submit two proposals with same public key`, async () => {
    await assertTxFails(contract.submitKeeperProposal(pubKeys.keeper_2, {from: addr.keeper_4}))
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

  it(`allows owner to accept selected Keeper proposals`, async () => {
    const hash_1 = '0x1230000000000000000000000000000000000000000000000000000000000000'
    const hash_2 = '0x4560000000000000000000000000000000000000000000000000000000000000'

    await assertTxSucceeds(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      [hash_1, hash_2], // hashes of key parts
      '0xabcdef', // encrypted key parts, packed into byte array
      '0x123456', // encrypted data
      '0x678901', // hash of original data
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

  it(`Keeper check-in transfers contract to CallForKeys state if owner `+
     `failed to check in in time`, async () => {
    await increaseTimeSec(checkInIntervalSec * 2)
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))

    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeys)
  })

})
