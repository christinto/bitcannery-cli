const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')

const {web3, assertTxSucceeds, assertTxFails} = require('./helpers')
const {keeperPublicKeys} = require('./data')

const {States} = require('../utils/contract-api')


contract('CryptoLegacy, proposal submission:', (accounts) => {

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
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 1)
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPublicKeys[1], {from: addr.keeper_2}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 2)
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPublicKeys[2], {from: addr.keeper_3}))
    const numProposals = await contract.getNumProposals()
    assert.equal(numProposals.toNumber(), 3)
  })

  it(`doesn't allow to submit two proposals with same public key`, async () => {
    await assertTxFails(contract.submitKeeperProposal(keeperPublicKeys[1], {from: addr.keeper_4}))
  })

  it(`doesn't allow the same Keeper to submit a proposal twice`, async () => {
    await assertTxFails(contract.submitKeeperProposal(keeperPublicKeys[0],
      {from: addr.keeper_1}), 'same key')
    await assertTxFails(contract.submitKeeperProposal('0x123456',
      {from: addr.keeper_1}), 'different key')
  })

  it(`doesn't allow owner to submit a proposal`, async () => {
    await assertTxFails(contract.submitKeeperProposal(keeperPublicKeys[0],
      {from: addr.Alice}), 'same key')
    await assertTxFails(contract.submitKeeperProposal('0x123456',
      {from: addr.Alice}), 'different key')
  })

  it(`doesn't allow to submit a proposal with public key longer than 128 bytes`, async () => {
    let longPubKey = '0x'
    for (let i = 0; i < 129; ++i) {
      longPubKey += 'ab'
    }
    await assertTxFails(contract.submitKeeperProposal(longPubKey, {from: addr.keeper_4}))
  })

  it(`doesn't allow submitting proposals after contract has been activated`, async () => {

    const selectedProposalIndices = [1, 2]
    const selectedKeyParts = ['0x1234567890', '0xfffeeefffe']
    const selectedKeyPartHashes = selectedKeyParts.map(part => web3.utils.soliditySha3(part))

    await assertTxSucceeds(contract.acceptKeepers(
      selectedProposalIndices, // selectedProposalIndices
      selectedKeyPartHashes, // keyPartHashes
      '0xaaabbbaaabbbaaabbb', // encryptedKeyParts
      '0xaaabbbaaabbbaaabbb', // _encryptedData
      '0x112311231123112311', // dataHash
      42, // aesCounter
      {from: addr.Alice, value: selectedProposalIndices.length * finalReward}
    ))

    const state = await contract.state()
    assert.equal(state.toNumber(), States.Active)

    await assertTxFails(contract.submitKeeperProposal('0x42424242', {from: addr.keeper_4}))
  })

  it(`doesn't allow submitting proposals when contract is in CallForKeys state`, async () => {
    await assertTxSucceeds(contract.increaseTimeBy(checkInIntervalSec + 1))
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_3}))

    const state = await contract.state()
    assert.equal(state.toNumber(), States.CallForKeys)

    await assertTxFails(contract.submitKeeperProposal('0x42424243', {from: addr.keeper_4}))
  })

})
