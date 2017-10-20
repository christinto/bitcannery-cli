const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')

const {assertTxSucceeds, assertTxFails} = require('./helpers')
const {States, assembleKeeperStruct} = require('../utils/contract-api')
const {keeperPublicKeys} = require('./data')


contract('CryptoLegacy, activation:', (accounts) => {

  function getAddresses() {
    const [_, Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4, keeper_5, keeper_6] = accounts
    return {Alice, Bob, keeper_1, keeper_2, keeper_3, keeper_4, keeper_5, keeper_6}
  }

  const addr = getAddresses()

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours
  const keepingFee = 100
  const finalReward = 1000000000000000000

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(
      checkInIntervalSec,
      keepingFee,
      finalReward,
      {from: addr.Alice}
    )
  })

  it(`allows first Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPublicKeys[0], {from: addr.keeper_1}))
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPublicKeys[1], {from: addr.keeper_2}))
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPublicKeys[2], {from: addr.keeper_3}))
  })

  const acceptKeepersParams = [
    [0, 2], // selected proposal indices
    ['0x1122330000000000000000000000000000000000000000000000000000000000', // hashes of key parts
     '0x4455660000000000000000000000000000000000000000000000000000000000'],
    '0xaabbcc', // encrypted key parts, packed into byte array
    '0xabcdef', // encrypted data
    '0x0000110000000000000000000000000000000000000000000000000000000000', // hash of original data
    42, // counter value for AES CTR mode
  ]

  it(`doesn't allow Keepers to accept themselves`, async () => {
    await assertTxFails(contract.acceptKeepers(...acceptKeepersParams,
      {from: addr.keeper_1, value: 2 * finalReward}))
  })

  it(`doesn't allow Keepers to accept other Keepers`, async () => {
    await assertTxFails(contract.acceptKeepers(...acceptKeepersParams,
      {from: addr.keeper_2, value: 2 * finalReward}))
  })

  it(`doesn't allow owner to accept non-proposed Keepers`, async () => {
    const [acceptedIndices , [hash_1, hash_2], ...other] = acceptKeepersParams

    await assertTxFails(contract.acceptKeepers(
      [acceptedIndices[0], 10],
      [hash_1, hash_2],
      ...other,
      {from: addr.Alice, value: 2 * finalReward}
    ))
  })

  it(`allows owner to accept selected Keeper proposals and activate the contract`, async () => {
    const [_ , [hash_1, hash_2]] = acceptKeepersParams

    await assertTxSucceeds(contract.acceptKeepers(...acceptKeepersParams,
      {from: addr.Alice, value: 2 * finalReward}
    ))

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 2)

    const firstKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_1))
    assert.equal(firstKeeper.publicKey, keeperPublicKeys[0], `first Keeper's public key`)
    assert.equal(firstKeeper.keyPartHash, hash_1, `first Keeper's key part hash`)

    const secondKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper_3))
    assert.equal(secondKeeper.publicKey, keeperPublicKeys[2], `second Keeper's public key`)
    assert.equal(secondKeeper.keyPartHash, hash_2, `second Keeper's key part hash`)
  })

  it(`accepting Keepers transfers contract to Active state`, async () => {
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active)
  })

  it(`doesn't allow owner to activate already activated contract`, async () => {
    await assertTxFails(contract.acceptKeepers(...acceptKeepersParams,
      {from: addr.Alice, value: 2 * finalReward}
    ))
  })

})
