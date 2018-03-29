import {States, assembleKeeperStruct} from '../../dms/src/utils/contract-api'

import {getAddresses, assertTxSucceeds, assertTxReverts, assertTxFails} from './helpers'
import {keeperPublicKeys} from './data'

const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')

// TODO: test accepting multiple chunks of keepers by calling acceptKeepers() multiple times

contract('CryptoLegacy, activation:', (accounts) => {

  const addr = getAddresses(accounts)
  const keepingFees = [100, 150, 200]
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
  })

  it(`allows first Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      keepingFees[0],
      {from: addr.keeper[0]})
    )
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[1],
      keepingFees[1],
      {from: addr.keeper[1]})
    )
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[2],
      keepingFees[2],
      {from: addr.keeper[2]})
    )
  })

  // Parameters to acceptKeepers() contract function call
  //
  const acceptKeepersParams = [
    [0, 2], // selected proposal indices
    ['0x1122330000000000000000000000000000000000000000000000000000000000', // hashes of key parts
     '0x4455660000000000000000000000000000000000000000000000000000000000'],
    '0xaabbcc', // encrypted key parts, packed into byte array
  ]

  // Parameters to activate() contract function call
  //
  const activationParams = [
    42, // keeper key part length
    '0xabcdef', // encrypted data
    '0x0000110000000000000000000000000000000000000000000000000000000000', // hash of original data
    43, // counter value for AES CTR mode
  ]

  // Alice will need to hold this amount of Ether in contract to activate it.
  // It will be used to pay selected keepers as the time goes.
  //
  const activationPrepayFee = keepingFees[0] + keepingFees[2]

  it(`doesn't allow owner to activate contract before accepting at least one keeper`, async () => {
    await assertTxReverts(contract.activate(
      ...activationParams,
      {from: addr.Alice, value: activationPrepayFee}
    ))
  })

  it(`doesn't allow anonymous to activate contract before accepting at least one keeper`,
    async () => {
    await assertTxReverts(contract.activate(
      ...activationParams,
      {from: addr.keeper[3], value: activationPrepayFee}
    ))
  })

  it(`doesn't allow Keepers to accept themselves`, async () => {
    await assertTxReverts(contract.acceptKeepers(...acceptKeepersParams, {from: addr.keeper[0]}))
  })

  it(`doesn't allow Keepers to accept other Keepers`, async () => {
    await assertTxReverts(contract.acceptKeepers(...acceptKeepersParams, {from: addr.keeper[1]}))
  })

  it(`doesn't allow owner to accept non-proposed Keepers`, async () => {
    const [acceptedIndices, [hash_1, hash_2], encryptedKeyParts] = acceptKeepersParams

    await assertTxFails(contract.acceptKeepers(
      [acceptedIndices[0], 10],
      [hash_1, hash_2],
      encryptedKeyParts,
      {from: addr.Alice}
    ))
  })

  it(`allows owner to accept selected Keeper proposals`, async () => {
    const [_ , [hash_1, hash_2]] = acceptKeepersParams

    await assertTxSucceeds(contract.acceptKeepers(...acceptKeepersParams, {from: addr.Alice}))

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 2, `number of keepers`)

    const firstKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[0]))
    assert.equal(firstKeeper.publicKey, keeperPublicKeys[0], `first Keeper's public key`)
    assert.equal(firstKeeper.keyPartHash, hash_1, `first Keeper's key part hash`)

    const secondKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))
    assert.equal(secondKeeper.publicKey, keeperPublicKeys[2], `second Keeper's public key`)
    assert.equal(secondKeeper.keyPartHash, hash_2, `second Keeper's key part hash`)
  })

  it(`accepting keepers leaves contract in CallForKeepers state`, async () => {
    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeepers)
  })

  it(`doesn't allow owner to accept already accepted keepers`, async () => {
    const [acceptedIndices, keyPartHashes] = acceptKeepersParams

    await assertTxReverts(contract.acceptKeepers(
      [acceptedIndices[1]],
      [keyPartHashes[1]],
      '0xddeeff',
      {from: addr.Alice}
    ))
  })

  it(`allows owner to activate the contract`, async () => {
    await assertTxSucceeds(contract.activate(
      ...activationParams,
      {from: addr.Alice, value: activationPrepayFee}
    ))
  })

  it(`activating contract transfers it to Active state`, async () => {
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active)
  })

  it(`doesn't allow owner to activate already activated contract`, async () => {
    await assertTxReverts(contract.activate(
      ...activationParams,
      {from: addr.Alice, value: activationPrepayFee}
    ))
  })

  it(`doesn't allow owner to accept Keepers on an already activated contract`, async () => {
    const acceptedIndices = [1]
    const keyPartHashes = ['0x7788990000000000000000000000000000000000000000000000000000000000']
    const encryptedKeyParts = '0xddeeff'

    await assertTxReverts(contract.acceptKeepers(
      acceptedIndices,
      keyPartHashes,
      encryptedKeyParts,
      {from: addr.Alice}
    ))
  })

})
