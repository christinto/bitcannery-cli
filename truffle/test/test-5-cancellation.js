import {States} from '../../dms/src/utils/contract-api'

import {web3,
  getAddresses,
  assert,
  assertTxSucceeds,
  assertTxReverts,
  acceptKeepersAndActivate,
  sum} from './helpers'

const CryptoLegacy = artifacts.require('./CryptoLegacy.sol')


contract('CryptoLegacy, cancellation:', (accounts) => {

  const addr = getAddresses(accounts)
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours
  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
  })

  it(`allows to submit a keeping proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal('0xabcdef', 100, {from: addr.keeper[0]}))
  })

  it(`allows owner to cancel the contract while waiting for keeping proposals`, async () => {
    await assertTxSucceeds(contract.cancel({from: addr.Alice, value: 0}))
  })

  it(`cancelling a contract transfers it to Cancelled state`, async () => {
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Cancelled)
  })
})


contract('CryptoLegacy, cancellation:', (accounts) => {

  const addr = getAddresses(accounts)

  const keeperPubKeys = ['0xaabbcc', '0xbbccdd', '0xccddee']
  const keepingFees = [100, 150, 200]

  const selectedKeyParts = ['0x4242424242', '0xabcabcabca']
  const selectedKeyPartHashes = selectedKeyParts.map(part => web3.utils.soliditySha3(part))

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
  })

  it(`doesn't allow keepers to cancel contract waiting for keeping proposals`, async () => {
    await assertTxReverts(contract.cancel({from: addr.keeper[0]}))
  })

  it(`owner can accept keepers and activate the contract`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[0], keepingFees[0], {from: addr.keeper[0]}),
      `submitting first keeper proposal`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[1], keepingFees[1], {from: addr.keeper[1]}),
      `submitting second keeper proposal`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[2], keepingFees[2], {from: addr.keeper[2]}),
      `submitting third keeper proposal`)

    await acceptKeepersAndActivate(contract, {
      selectedProposalIndices: [0, 2],
      keyPartHashes: selectedKeyPartHashes,
      encryptedKeyParts: '0xabcdef',
      shareLength: 42,
      encryptedLegacyData: '0x123456',
      legacyDataHash: '0x678901',
      aesCounter: 43
    }, {
      from: addr.Alice,
      value: keepingFees[0] + keepingFees[2]
    })
  })

  it(`doesn't allow keeper to cancel contract in active state`, async () => {
    await assertTxReverts(contract.cancel({from: addr.keeper[0]}))
  })

  it(`doesn't allow Bob to cancel contract in active state`, async () => {
    await assertTxReverts(contract.cancel({from: addr.Bob}))
  })

  it(`allows keeper to check in to active contract`, async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[0]}))
  })

  it(`allows owner to cancel contract in active state`, async () => {
    await assertTxSucceeds(contract.cancel({from: addr.Alice}))
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Cancelled, `contract state`)
  })

  it(`allows keeper to check in to cancelled contract`, async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[0]}))
  })

  it(`doesn't allow keeper to supply key part to cancelled contract`, async () => {
    await assertTxReverts(contract.supplyKey(selectedKeyParts[0], {from: addr.keeper[0]}))
  })

})
