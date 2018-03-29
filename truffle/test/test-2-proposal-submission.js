import {States} from '../../dms/src/utils/contract-api'

import {web3,
  getAddresses,
  assert,
  assertTxSucceeds,
  assertTxFails,
  acceptKeepersAndActivate} from './helpers'

import {keeperPublicKeys} from './data'


const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')


contract('CryptoLegacy, proposal submission:', (accounts) => {

  const addr = getAddresses(accounts)
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
  })

  it(`allows first Keeper to submit a proposal`, async () => {
    const keepingFee = 100
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      keepingFee,
      {from: addr.keeper[0]}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 1)
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    const keepingFee = 50
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[1],
      keepingFee,
      {from: addr.keeper[1]}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 2)
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    const keepingFee = 200
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[2],
      keepingFee,
      {from: addr.keeper[2]}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 3)
  })

  it(`doesn't allow to submit two proposals with same public key`, async () => {
    await assertTxFails(contract.submitKeeperProposal(
      keeperPublicKeys[1],
      100, // keeping fee
      {from: addr.keeper[3]})
    )
  })

  it(`doesn't allow the same Keeper to submit a proposal twice`, async () => {
    await assertTxFails(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      100, // keeping fee
      {from: addr.keeper[0]}), 'same key')
    await assertTxFails(contract.submitKeeperProposal(
      '0x123456',
      100, // keeping fee
      {from: addr.keeper[0]}), 'different key')
  })

  it(`doesn't allow owner to submit a proposal`, async () => {
    await assertTxFails(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      100, // keeping fee
      {from: addr.Alice}),
    'same key')

    await assertTxFails(contract.submitKeeperProposal(
      '0x123456',
      100, // keeping fee
      {from: addr.Alice}),
    'different key')
  })

  it(`doesn't allow to submit a proposal with public key longer than 128 bytes`, async () => {
    let longPubKey = '0x'
    for (let i = 0; i < 129; ++i) {
      longPubKey += 'ab'
    }
    await assertTxFails(contract.submitKeeperProposal(
      longPubKey,
      150, // keeping fee
      {from: addr.keeper[3]})
    )
  })

  it(`doesn't allow submitting proposals after contract has been activated`, async () => {

    await acceptKeepersAndActivate(contract, {
      selectedProposalIndices: [1, 2],
      keyPartHashes: ['0x1234567890', '0xfffeeefffe'].map(part => web3.utils.soliditySha3(part)),
      encryptedKeyParts: '0xaaabbbaaabbbaaabbb',
      shareLength: 42,
      encryptedLegacyData: '0xaaabbbaaabbbaaabbb',
      legacyDataHash: '0x112311231123112311',
      aesCounter: 42,
    }, {from: addr.Alice, value: 200 + 50})

    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active, `contract state`)

    await assertTxFails(contract.submitKeeperProposal(
      '0x42424242',
      100,
      {from: addr.keeper[3]}),
      `attempting to submit proposal`
    )
  })

  it(`doesn't allow submitting proposals when contract is in CallForKeys state`, async () => {
    await assertTxSucceeds(contract.increaseTimeBy(checkInIntervalSec + 1), `increasing time`)
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[2]}), `keeper check-in`)

    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeys, `contract state`)

    await assertTxFails(contract.submitKeeperProposal(
      '0x42424243',
      100,
      {from: addr.keeper[3]}),
      `attempting to submit proposal`
    )
  })

})
