const assert = require('chai').assert
const {web3, assertTxSucceeds, assertTxFails, increaseTimeSec, getAccountBalance}
        = require('./helpers')
const CryptoLegacy = artifacts.require('./CryptoLegacy.sol')

const {States,
  assembleKeeperStruct,
  assembleProposalStruct} = require('./crypto-legacy-data-layout')

function getAcceptKeepersParams() {
  const hash_1 = '0x1230000000000000000000000000000000000000000000000000000000000000'
  const hash_2 = '0x4560000000000000000000000000000000000000000000000000000000000000'
  return [
    [0, 2], // selected proposal indices
    [hash_1, hash_2], // hashes of key parts
    '0xabcdef', // encrypted key parts, packed into byte array
    '0x123456', // encrypted data
    '0x678901', // hash of original data
  ]
}

contract('CryptoLegacy cancelling contract', function(accounts) {

  function getAddresses() {
    const [Alice, Bob, ...keepers] = accounts
    return keepers.reduce((res, keeper, index) => {
      res[`keeper_${index+1}`] = keeper
      return res
    }, {Alice, Bob})
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

  let contract

  before(async () => {
    contract = await CryptoLegacy.new(
      checkInIntervalSec,
      keepingFee,
      finalReward,
      {from: addr.Alice}
    )
  })

  it('keepers couldn\'t cancel contract', async () => {
    await assertTxFails(contract.cancel({from: addr.keeper_1}))
  })

  it('owner couldn\'t cancel contract while calling for keepers', async () => {
    await assertTxFails(contract.cancel({from: addr.Alice}))
  })

  it('owner could accept keepers', async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_1, {from: addr.keeper_1}))
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_2, {from: addr.keeper_2}))
    await assertTxSucceeds(contract.submitKeeperProposal(pubKeys.keeper_3, {from: addr.keeper_3}))
    await assertTxSucceeds(contract.acceptKeepers(...getAcceptKeepersParams(),
      {from: addr.Alice, value: 2 * finalReward}
    ))
  })

  it('keeper couldn\'t cancel contract in active state', async () => {
    await assertTxFails(contract.cancel({from: addr.keeper_1}))
  })

  it('bob couldn\'t cancel contract in active state', async () => {
    await assertTxFails(contract.cancel({from: addr.Bob}))
  })

  it('keeper could check in to active contract', async () => {
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper_1}))
  })

  it('owner could cancel contract in active state', async () => {
    await assertTxSucceeds(contract.cancel({from: addr.Alice}))
    const state = await contract.state()
    assert.equal(state.toNumber(), States.Cancelled)
  })

  it('keeper couldn\'t check in while contract is cancelled', async () => {
    await assertTxFails(contract.keeperCheckIn({from: addr.keeper_1}))
  })

  it('keeper couldn\'t supply key part while contract is cancelled', async () => {
    await assertTxFails(contract.supplyKey('ururu', {from: addr.keeper_1}))
  })

})
