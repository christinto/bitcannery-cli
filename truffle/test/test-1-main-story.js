const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')

const {assertTxSucceeds,
  assertTxFails,
  getAccountBalance,
  getActiveKeepersBalances,
  prepareLegacyData,
  decryptLegacy,
  decryptKeyPart} = require('./helpers')

const {keeperPublicKeys} = require('./data')
const {States, assembleKeeperStruct, assembleEncryptedDataStruct} = require('../utils/contract-api')


// TODO: cleanup main story by extracting some of the tests to different files.
//
contract('CryptoLegacy', (accounts) => {

  function getAddresses() {
    const [_, Alice, Bob, keeper_1, keeper_2, keeper_3] = accounts
    return {Alice, Bob, keeper_1, keeper_2, keeper_3}
  }

  const addr = getAddresses()

  const legacyText = 'So long and thanks for all the fish'
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  const keepingFees = {
    keeper_1: 100,
    keeper_2: 150,
    keeper_3: 200,
  }

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
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
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[0], keepingFees.keeper_1, {from: addr.keeper_1}))
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[1], keepingFees.keeper_2, {from: addr.keeper_2}))
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[2], keepingFees.keeper_3, {from: addr.keeper_3}))
  })

  async function getAcceptKeepersParams() {
    const selectedIndices = [0, 2]
    const aesCounter = 42

    const {encryptedKeyParts, keyPartHashes, legacyDataHash, encryptedLegacyData} =
      await prepareLegacyData(legacyText, selectedIndices, aesCounter)

    return [
      selectedIndices, // selected proposal indices
      keyPartHashes, // hashes of key parts
      encryptedKeyParts, // encrypted key parts, packed into byte array
      encryptedLegacyData, // encrypted data
      legacyDataHash, // hash of original data
      aesCounter, // counter value for AES CTR mode
    ]
  }

  it(`owner couldn't check-in before Keepers are accepted`, async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.Alice}))
  })

  it(`allows owner to accept selected Keeper proposals`, async () => {

    const callParams = await getAcceptKeepersParams()

    const [_ , [hash_1, hash_2]] = callParams

    await assertTxSucceeds(contract.acceptKeepers(...callParams, {
      from: addr.Alice,
      value: keepingFees.keeper_1 + keepingFees.keeper_3
    }))

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 2)

    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active)

    const firstKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_1))
    assert.equal(firstKeeper.publicKey, keeperPublicKeys[0])
    assert.equal(firstKeeper.keyPartHash, hash_1)

    const secondKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_3))
    assert.equal(secondKeeper.publicKey, keeperPublicKeys[2])
    assert.equal(secondKeeper.keyPartHash, hash_2)
  })

  it(`Keeper couldn't check-in for contract owner`, async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.keeper_1}))
  })

  it(`owner could check-in in Active state`, async () => {
    await assertTxFails(contract.ownerCheckIn({from: addr.keeper_1}))
  })

  it(`non-accepted Keeper couldn't check in`, async () => {
    await assertTxFails(contract.keeperCheckIn({from: addr.keeper_2}))
  })

  it(`accepted Keeper could check in`, async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))
  })

  it(`keeper could send key only after Termination event`, async () => {
    await assertTxFails(contract.supplyKey(''), {from: addr.keeper_1})
  })

  it(`Keeper check-in transfers contract to CallForKeys state if owner `+
     `failed to check in in time`, async () => {

    await assertTxSucceeds(contract.increaseTimeBy(checkInIntervalSec + 1))
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))

    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeys)
  })

  it(`non-accepted keeper couldn't send key`, async () => {
    await assertTxFails(contract.supplyKey('arara', {from: addr.keeper_2}))
  })

  it(`accepted keeper couldn't send not valid key part`, async () => {
    await assertTxFails(contract.supplyKey('ururu', {from: addr.keeper_1}))
  })

  it(`accepted keeper could send valid key part and receive their keeping fee`, async () => {
    const keeperToGetReward = addr.keeper_1

    const keeperAcctBalanceBefore = await getAccountBalance(keeperToGetReward)
    const [keeperBalanceBefore] = await getActiveKeepersBalances(contract, [keeperToGetReward])

    const {encryptedKeyParts} = assembleEncryptedDataStruct(await contract.encryptedData())
    const decryptedKeyPart = await decryptKeyPart(encryptedKeyParts, 0, 0)

    const {txPriceWei} = await assertTxSucceeds(contract.supplyKey(decryptedKeyPart,
      {from: keeperToGetReward}))

    const expectedKeeperAcctBalanceAfter = keeperAcctBalanceBefore
      .plus(keeperBalanceBefore)
      .minus(txPriceWei)

    const keeperAcctBalanceAfter = await getAccountBalance(keeperToGetReward)
    const [keeperBalanceAfter] = await getActiveKeepersBalances(contract, [keeperToGetReward])

    assert.equal(keeperAcctBalanceAfter.toString(), expectedKeeperAcctBalanceAfter.toString(),
      `keeper account balance`)

    assert.equal(keeperBalanceAfter.toString(), '0',
      `keeper balance should become zero`)
  })

  it(`second accepted keeper could send valid key part and receive their keeping fee`, async () => {
    const keeperToGetReward = addr.keeper_3

    const keeperAcctBalanceBefore = await getAccountBalance(keeperToGetReward)
    const [keeperBalanceBefore] = await getActiveKeepersBalances(contract, [keeperToGetReward])

    const {encryptedKeyParts} = assembleEncryptedDataStruct(await contract.encryptedData())
    const decryptedKeyPart = await decryptKeyPart(encryptedKeyParts, 1, 2)

    const {txPriceWei} = await assertTxSucceeds(contract.supplyKey(decryptedKeyPart,
      {from: keeperToGetReward}))

    const expectedKeeperAcctBalanceAfter = keeperAcctBalanceBefore
      .plus(keeperBalanceBefore)
      .minus(txPriceWei)

    const keeperAcctBalanceAfter = await getAccountBalance(keeperToGetReward)
    const [keeperBalanceAfter] = await getActiveKeepersBalances(contract, [keeperToGetReward])

    assert.equal(keeperAcctBalanceAfter.toString(), expectedKeeperAcctBalanceAfter.toString(),
      `keeper account balance`)

    assert.equal(keeperBalanceAfter.toString(), '0',
      `keeper balance should become zero`)
  })

  it(`recipient could decrypt legacy data`, async () => {
    const {encryptedData, aesCounter, dataHash} = assembleEncryptedDataStruct(
      await contract.encryptedData())
    const suppliedKeyParts = await Promise.all(
      [contract.getSuppliedKeyPart(0), contract.getSuppliedKeyPart(1)])
    const decryptedLegacy = await decryptLegacy(
      encryptedData, dataHash, suppliedKeyParts, aesCounter)
    assert.equal(decryptedLegacy, legacyText, 'should decrypt legacy')
  })

})
