const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacy.sol')

const {web3, assertTxSucceeds, assertTxFails, sum} = require('./helpers')
const {States} = require('../utils/contract-api')


contract('CryptoLegacy, cancellation:', (accounts) => {

  function getAddresses() {
    const [Alice, Bob, ...keeper] = accounts
    return {Alice, Bob, keeper}
  }

  const addr = getAddresses()
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

  function getAddresses() {
    const [Alice, Bob, ...keeper] = accounts
    return {Alice, Bob, keeper}
  }

  const addr = getAddresses()

  const keeperPubKeys = ['0xaabbcc', '0xbbccdd', '0xccddee']
  const keepingFees = [100, 150, 200]

  const selectedKeyParts = ['0x4242424242', '0xabcabcabca']
  const selectedKeyPartHashes = selectedKeyParts.map(part => web3.utils.soliditySha3(part))

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
  })

  it(`keepers couldn't cancel contract`, async () => {
    await assertTxFails(contract.cancel({from: addr.keeper[0]}))
  })

  it(`owner could accept keepers`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[0], keepingFees[0], {from: addr.keeper[0]}))

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[1], keepingFees[1], {from: addr.keeper[1]}))

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[2], keepingFees[2], {from: addr.keeper[2]}))

    await assertTxSucceeds(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      selectedKeyPartHashes, // hashes of key parts
      '0xabcdef', // encrypted key parts, packed into byte array
      '0x123456', // encrypted data
      '0x678901', // hash of original data
      42, // counter value for AES CTR mode
      {
        from: addr.Alice,
        value: keepingFees[0] + keepingFees[2]
      }
    ))
  })

  it(`keeper couldn't cancel contract in active state`, async () => {
    await assertTxFails(contract.cancel({from: addr.keeper[0]}))
  })

  it(`bob couldn't cancel contract in active state`, async () => {
    await assertTxFails(contract.cancel({from: addr.Bob}))
  })

  it(`keeper could check in to active contract`, async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[0]}))
  })

  it(`owner could cancel contract in active state`, async () => {
    // we didn't increase time since contract activation, so Alice isn't required to pay anything
    await assertTxSucceeds(contract.cancel({from: addr.Alice}))
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Cancelled)
  })

  it(`keeper could check in while contract is cancelled`, async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[0]}))
  })

  it(`keeper couldn't supply key part while contract is cancelled`, async () => {
    await assertTxFails(contract.supplyKey(selectedKeyParts[0], {from: addr.keeper[0]}))
  })

})
