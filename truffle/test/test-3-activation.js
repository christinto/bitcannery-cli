import {States, assembleKeeperStruct} from '../../dms/src/utils/contract-api'

import {assert, getAddresses, assertTxSucceeds, assertTxReverts, assertTxFails} from './helpers'
import {keeperPublicKeys} from './data'

const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')


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


contract('CryptoLegacy, chunked activation:', (accounts) => {

  const addr = getAddresses(accounts)
  const keepingFees = [100, 150, 200]
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})

    await assertTxSucceeds(
      contract.submitKeeperProposal(keeperPublicKeys[0], keepingFees[0], {from: addr.keeper[0]}),
      `submitting first proposal`)

    await assertTxSucceeds(
      contract.submitKeeperProposal(keeperPublicKeys[1], keepingFees[1], {from: addr.keeper[1]}),
      `submitting second proposal`)

    await assertTxSucceeds(
      contract.submitKeeperProposal(keeperPublicKeys[2], keepingFees[2], {from: addr.keeper[2]}),
      `submitting third proposal`)
  })

  it(`doesn't allow owner to accept zero keepers`, async () => {
    await assertTxReverts(contract.acceptKeepers(
      [], // selected proposal indices
      [], // hashes of keepers' key parts
      '0xaabbcc', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ))
  })

  const keyPartHashes = [
    '0x1122330000000000000000000000000000000000000000000000000000000000',
    '0x4455660000000000000000000000000000000000000000000000000000000000',
    '0x7788990000000000000000000000000000000000000000000000000000000000',
  ]

  it(`doesn't allow to pass different number of accepted indices and key part hashes while ` +
     `accepting keepers`, async () => {

    await assertTxReverts(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      [keyPartHashes[0]], // key part hashes
      '0xaabbcc', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ))
  })

  it(`doesn't allow to pass empty byte array for packed key parts while accepting keepers`,
    async () => {

    await assertTxReverts(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      [keyPartHashes[0], keyPartHashes[2]], // key part hashes
      '0x', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ))
  })

  it(`allows owner to accept first chunk of keepers`, async () => {
    await assertTxSucceeds(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      [keyPartHashes[0], keyPartHashes[2]], // key part hashes
      '0xaabbcc', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ))
  })

  it(`accepting first chunk of keepers updates total keeping fee`, async () => {
    const totalKeepingFee = await contract.totalKeepingFee()
    assert.bignumEqual(totalKeepingFee, keepingFees[0] + keepingFees[2])
  })

  it(`doesn't allow anybody from Alice to accept second chunk of keepers`, async () => {
    await assertTxReverts(contract.acceptKeepers(
      [1], // selected proposal indices
      [keyPartHashes[1]], // key part hashes
      '0xddeeff', // encrypted key parts, packed into byte array,
      {from: addr.Bob},
    ), `Bob`)
    await assertTxReverts(contract.acceptKeepers(
      [1], // selected proposal indices
      [keyPartHashes[1]], // key part hashes
      '0xddeeff', // encrypted key parts, packed into byte array,
      {from: addr.keeper[0]},
    ), `a keeper`)
  })

  it(`allows owner to accept second chunk of keepers`, async () => {
    await assertTxSucceeds(contract.acceptKeepers(
      [1], // selected proposal indices
      [keyPartHashes[1]], // key part hashes
      '0xddeeff', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ))
  })

  it(`accepting second chunk of keepers updates total keeping fee`, async () => {
    const totalKeepingFee = await contract.totalKeepingFee()
    assert.bignumEqual(totalKeepingFee, keepingFees[0] + keepingFees[1] + keepingFees[2])
  })

  it(`doesn't allow owner to accept already accepted keepers`, async () => {
    await assertTxReverts(contract.acceptKeepers(
      [2], // selected proposal indices
      [keyPartHashes[2]], // key part hashes
      '0xddeeff', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ), `keeper 3`)
    await assertTxReverts(contract.acceptKeepers(
      [0, 1], // selected proposal indices
      [keyPartHashes[0, 1]], // key part hashes
      '0xddeeff', // encrypted key parts, packed into byte array,
      {from: addr.Alice},
    ), `keepers 1, 2`)
  })

  it(`accepting keepers adds them to active keepers`, async () => {
    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 3, `number of keepers`)

    const firstKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[0]))
    assert.equal(firstKeeper.publicKey, keeperPublicKeys[0], `first Keeper's public key`)
    assert.equal(firstKeeper.keyPartHash, keyPartHashes[0], `first Keeper's key part hash`)

    const secondKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[1]))
    assert.equal(secondKeeper.publicKey, keeperPublicKeys[1], `second Keeper's public key`)
    assert.equal(secondKeeper.keyPartHash, keyPartHashes[1], `second Keeper's key part hash`)

    const thirdKeeper = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))
    assert.equal(thirdKeeper.publicKey, keeperPublicKeys[2], `third Keeper's public key`)
    assert.equal(thirdKeeper.keyPartHash, keyPartHashes[2], `third Keeper's key part hash`)
  })

  it(`doesn't allow owner to activate the contract supplying insufficient funds`, async () => {
    const activationPrepayFee = keepingFees[0] + keepingFees[1] + keepingFees[2]
    await assertTxReverts(contract.activate(
      42, // keeper key part length
      '0xabcdef', // encrypted data
      '0x0000110000000000000000000000000000000000000000000000000000000000', // original data hash
      43, // counter value for AES CTR mode
      {from: addr.Alice, value: activationPrepayFee - 1}
    ))
  })

  it(`allows owner to activate the contract`, async () => {
    const activationPrepayFee = keepingFees[0] + keepingFees[1] + keepingFees[2]
    await assertTxSucceeds(contract.activate(
      42, // keeper key part length
      '0xabcdef', // encrypted data
      '0x0000110000000000000000000000000000000000000000000000000000000000', // original data hash
      43, // counter value for AES CTR mode
      {from: addr.Alice, value: activationPrepayFee}
    ))
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active, `contract state`)
  })

  it(`after activating the contract, active keepers stay the same`, async () => {
    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), 3, `number of keepers`)

    const [firstKeeper, secondKeeper, thirdKeeper] = await Promise.all([
      contract.activeKeepers(addr.keeper[0]),
      contract.activeKeepers(addr.keeper[1]),
      contract.activeKeepers(addr.keeper[2]),
    ].map(p => p.then(x => assembleKeeperStruct(x))))

    assert.equal(firstKeeper.publicKey, keeperPublicKeys[0], `first Keeper's public key`)
    assert.equal(secondKeeper.publicKey, keeperPublicKeys[1], `second Keeper's public key`)
    assert.equal(thirdKeeper.publicKey, keeperPublicKeys[2], `third Keeper's public key`)
  })

})
