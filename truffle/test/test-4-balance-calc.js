const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')
const BigNumber = require('bignumber.js')

const {States,
  assembleKeeperStruct,
  getActiveKeeperAddresses,
  getActiveKeepers} = require('../utils/contract-api')

const {web3,
  assertTxSucceeds,
  assertTxFails,
  getAccountBalance,
  getAccountBalances,
  getActiveKeepersBalances,
  stringify,
  bigSum} = require('./helpers')


contract('CryptoLegacy, balance calculations:', (accounts) => {

  function getAddresses() {
    const [_, Alice, Bob, ...keeper] = accounts
    return {Alice, Bob, keeper}
  }

  const addr = getAddresses()

  const keeperPubKeys = ['0xaabbcc', '0xbbccdd', '0xccddee']

  const selectedKeeperIndices = [1, 2]
  const selectedKeyParts = ['0x1234567890', '0xfffeeefffe']
  const selectedKeyPartHashes = selectedKeyParts.map(part => web3.utils.soliditySha3(part))

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours
  const keepingFee = 100
  const finalReward = 1000


  before(async () => {
    contract = await CryptoLegacy.new(
      checkInIntervalSec,
      keepingFee,
      finalReward,
      {from: addr.Alice}
    )

    await assertTxSucceeds(contract.submitKeeperProposal(keeperPubKeys[0], {from: addr.keeper[0]}))
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPubKeys[1], {from: addr.keeper[1]}))
    await assertTxSucceeds(contract.submitKeeperProposal(keeperPubKeys[2], {from: addr.keeper[2]}))
  })


  it(`when accepting Keepers, requires Alice to provide funds enough to pay ` +
     `final rewards to all selected Keepers`, async () => {

    const totalFinalReward = selectedKeeperIndices.length * finalReward

    const acceptKeepersArgs = [
      selectedKeeperIndices, // selectedProposalIndices
      selectedKeyPartHashes, // keyPartHashes
      '0xaaabbbaaabbbaaabbb', // encryptedKeyParts
      '0xaaabbbaaabbbaaabbb', // _encryptedData
      42, // aesCounter
      '0x112311231123112311', // dataHash
    ]

    await assertTxFails(contract.acceptKeepers(
      ...acceptKeepersArgs,
      {from: addr.Alice, value: totalFinalReward - 1}
    ))

    await assertTxSucceeds(contract.acceptKeepers(
      ...acceptKeepersArgs,
      {from: addr.Alice, value: totalFinalReward}
    ))

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), selectedKeeperIndices.length)
  })


  it(`initializes all Keepers' balances with zero`, async () => {
    const keeper1 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[1]))
    assert.equal(keeper1.balance, 0, 'first Keeper')

    const keeper2 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))
    assert.equal(keeper2.balance, 0, 'second Keeper')
  })


  it(`when Alice checks in, credits all Keepers with keepeing fee and requires Alice to provide ` +
     `enough funds to pay all Keepers their current balances and final rewards`, async () => {

    const checkInIntervalFraction = 1/2
    const timePassedSinceContractActive = Math.floor(checkInIntervalSec * checkInIntervalFraction)

    await assertTxSucceeds(contract.increaseTimeBy(timePassedSinceContractActive),
      `increasing time`)

    const expectedKeepersBalance = [
      Math.floor(keepingFee * checkInIntervalFraction),
      Math.floor(keepingFee * checkInIntervalFraction),
    ]

    const expectedKeepersTotalBalance = expectedKeepersBalance.reduce((s, i) => s + i, 0)

    // doesn't Allow Alice to check in if she provdes less funds than expected

    await assertTxFails(
      contract.ownerCheckIn({from: addr.Alice, value: 0}),
      `supplying zero funds`)

    await assertTxFails(
      contract.ownerCheckIn({from: addr.Alice, value: expectedKeepersTotalBalance - 1}),
      `not supplying enough funds`)

    // Allows Alice to check in if she provides enough funds

    const [preCheckInWalletBalanceAlice, preCheckInBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    const {txPriceWei} = await assertTxSucceeds(
      contract.ownerCheckIn({from: addr.Alice, value: expectedKeepersTotalBalance}),
      `supplying enough funds`)

    const [postCheckInWalletBalanceAlice, postCheckInBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    // check how much is credited to Keepers

    const keeper1 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[1]))
    const keeper2 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))

    assert.equal(keeper1.balance, expectedKeepersBalance[0], `keeper 1 balance`)
    assert.equal(keeper2.balance, expectedKeepersBalance[1], `keeper 2 balance`)

    // check how much is taken from Alice's wallet

    const expectedPostCheckInWalletBalanceAlice =
      preCheckInWalletBalanceAlice.minus(expectedKeepersTotalBalance).minus(txPriceWei)

    assert.equal(
      postCheckInWalletBalanceAlice.toString(),
      expectedPostCheckInWalletBalanceAlice.toString(),
      `expected amount is taken from Alice's wallet`)

    // check how much is sent to contract's address

    const expectedPostCheckInBalanceContract =
      preCheckInBalanceContract.plus(expectedKeepersTotalBalance)

    assert.equal(
      postCheckInBalanceContract.toString(),
      expectedPostCheckInBalanceContract.toString(),
      `expected amount is sent to contract's address`)
  })


  it(`if, during check-in, Alice provides too much funds, sends excess funds ` +
     `back to her wallet`, async () => {

    // getting current Keeper balances and calculating expected Keeper balances after check-in

    const preCheckInKeeperBalances = await getActiveKeepersBalances(addr.keeper[1], addr.keeper[2])
    const preCheckInKeepersTotalBalance = bigSum(preCheckInKeeperBalances)

    const checkInIntervalFraction = 1/4
    const timePassedSinceLastCheckIn = Math.floor(checkInIntervalSec * checkInIntervalFraction)

    const expectedPostCheckInKeeperBalances = preCheckInKeeperBalances.map(
      bal => bal.plus(Math.floor(keepingFee * checkInIntervalFraction)))

    const expectedPostCheckInKeepersTotalBalance = bigSum(expectedPostCheckInKeeperBalances)

    const expectedKeepersTotalBalanceIncrease =
      expectedPostCheckInKeepersTotalBalance - preCheckInKeepersTotalBalance

    // increasing time

    await assertTxSucceeds(contract.increaseTimeBy(timePassedSinceLastCheckIn),
      `increasing time`)

    // checking in

    const [preCheckInWalletBalanceAlice, preCheckInBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    // sending more than needed
    const fundsSent = expectedKeepersTotalBalanceIncrease + 10000

    const {txPriceWei} = await assertTxSucceeds(
      contract.ownerCheckIn({from: addr.Alice, value: fundsSent}),
      `checking in`)

    const [postCheckInWalletBalanceAlice, postCheckInBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    const postCheckInKeeperBalances = await getActiveKeepersBalances(addr.keeper[1], addr.keeper[2])
    const postCheckInKeepersTotalBalance = bigSum(postCheckInKeeperBalances)

    // checking balance differences

    assert.deepEqual(
      postCheckInKeeperBalances.map(stringify),
      expectedPostCheckInKeeperBalances.map(stringify),
      `keeper balances`)

    const expectedPostCheckInWalletBalanceAlice =
      preCheckInWalletBalanceAlice.minus(expectedKeepersTotalBalanceIncrease).minus(txPriceWei)

    const expectedPostCheckInBalanceContract =
      preCheckInBalanceContract.plus(expectedKeepersTotalBalanceIncrease)

    assert.equal(
      postCheckInWalletBalanceAlice.toString(),
      expectedPostCheckInWalletBalanceAlice.toString(),
      `Alice's balance`)

    assert.equal(
      postCheckInBalanceContract.toString(),
      expectedPostCheckInBalanceContract.toString(),
      `contract's balance`)
  })


  it(`when a Keeper checks in, contract sends him his current balance`, async () => {

    const preCheckInKeeperBalances = await getActiveKeepersBalances(addr.keeper[1], addr.keeper[2])
    const preCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const preCheckInContractBalance = await getAccountBalance(contract.address)

    const {txPriceWei} = await assertTxSucceeds(
      contract.keeperCheckIn({from: addr.keeper[1]}),
      `first Keeper check-in`
    )

    const postCheckInKeeperBalances = await getActiveKeepersBalances(addr.keeper[1], addr.keeper[2])
    const postCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const postCheckInContractBalance = await getAccountBalance(contract.address)

    assert.equal(
      postCheckInKeeperBalances[0].toString(),
      '0',
      `first Keeper balance`)

    assert.equal(
      postCheckInKeeperBalances[1].toString(),
      preCheckInKeeperBalances[1].toString(),
      `second Keeper balance`)

    const expectedPostCheckInKeeperWalletBalances = [
      preCheckInKeeperWalletBalances[0].plus(preCheckInKeeperBalances[0]).minus(txPriceWei),
      preCheckInKeeperWalletBalances[1]
    ]

    assert.equal(
      postCheckInKeeperWalletBalances[0].toString(),
      expectedPostCheckInKeeperWalletBalances[0].toString(),
      `first Keeper wallet balance`)

    assert.equal(
      postCheckInKeeperWalletBalances[1].toString(),
      expectedPostCheckInKeeperWalletBalances[1].toString(),
      `second Keeper wallet balance`)
  })

})