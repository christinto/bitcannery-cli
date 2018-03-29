import {assembleKeeperStruct} from '../../dms/src/utils/contract-api'

import {web3,
  getAddresses,
  assert,
  assertTxSucceeds,
  assertTxReverts,
  getAccountBalance,
  getAccountBalances,
  getActiveKeepersBalances,
  stringify,
  ceil,
  sum,
  bigSum} from './helpers'

const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')


contract('CryptoLegacy, balance calculations:', (accounts) => {

  const addr = getAddresses(accounts)
  const keepingFees = [100, 150, 200]
  const keeperPubKeys = ['0xaabbcc', '0xbbccdd', '0xccddee']

  const selectedKeeperIndices = [1, 2]
  const selectedKeyParts = ['0x1234567890', '0xfffeeefffe']
  const selectedKeyPartHashes = selectedKeyParts.map(part => web3.utils.soliditySha3(part))

  const onePeriodTotalKeepingFee = selectedKeeperIndices.reduce(
    (acc, keeperIndex) => acc + keepingFees[keeperIndex],
  0)

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract


  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[0], keepingFees[0], {from: addr.keeper[0]}), `submitting first proposal`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[1], keepingFees[1], {from: addr.keeper[1]}), `submitting second proposal`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPubKeys[2], keepingFees[2], {from: addr.keeper[2]}), `submitting third proposal`)

    await assertTxSucceeds(contract.acceptKeepers(
      selectedKeeperIndices, // selectedProposalIndices
      selectedKeyPartHashes, // keyPartHashes
      '0xaaabbbaaabbbaaabbb', // encryptedKeyParts
      {from: addr.Alice}),
      `accepting keepers`)
  })


  it(`in order to activate the contract, requires Alice to provide enough funds ` +
     `to pay one keeping period to all selected Keepers`, async () => {

    const activateArgs = [
      42, // keeper key part length
      '0xaaabbbaaabbbaaabbb', // encrypted data
      '0x112311231123112311', // hash of original data
      43, // counter value for AES CTR mode
    ]

    await assertTxReverts(contract.activate(
      ...activateArgs,
      {from: addr.Alice, value: onePeriodTotalKeepingFee - 1}),
      `attempting to activate without providing enough funds`)

    await assertTxSucceeds(contract.activate(
      ...activateArgs,
      {from: addr.Alice, value: onePeriodTotalKeepingFee}),
      `activating by providing enough funds`)

    const numKeepers = await contract.getNumKeepers()
    assert.equal(numKeepers.toNumber(), selectedKeeperIndices.length, `number of keeeprs`)
  })


  it(`initializes all Keepers' balances with zero`, async () => {
    const keeper1 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[1]))
    assert.equal(keeper1.balance, 0, 'first Keeper')

    const keeper2 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))
    assert.equal(keeper2.balance, 0, 'second Keeper')
  })


  it(`when Alice checks in, credits all Keepers with keepeing fee and requires Alice to provide ` +
     `enough funds to pay all Keepers their current balances and keeping fee for the next ` +
     `check-in interval`, async () => {

    const timePassedSinceContractActive = 55 * 60
    const checkInIntervalFraction = ceil(timePassedSinceContractActive, 600) / checkInIntervalSec

    await assertTxSucceeds(contract.increaseTimeBy(timePassedSinceContractActive),
      `increasing time`)

    const expectedKeepersBalance = [
      Math.floor(keepingFees[1] * checkInIntervalFraction),
      Math.floor(keepingFees[2] * checkInIntervalFraction),
    ]

    const expectedKeepersTotalBalance = sum(expectedKeepersBalance)
    const requiredBalanceContract = expectedKeepersTotalBalance + onePeriodTotalKeepingFee
    const preCheckInBalanceContract = await getAccountBalance(contract.address)
    const requiredContractBalanceIncrease = requiredBalanceContract - preCheckInBalanceContract

    // this is a pre-condition for this test, not contract logic check
    assert(requiredContractBalanceIncrease > 0,
      `expected required contract balance increase to be positive`)

    // doesn't allow Alice to check in if she provdes less funds than expected

    await assertTxReverts(
      contract.ownerCheckIn({from: addr.Alice, value: 0}),
      `supplying zero funds`)

    await assertTxReverts(
      contract.ownerCheckIn({from: addr.Alice, value: requiredContractBalanceIncrease - 1}),
      `not supplying enough funds`)

    // Allows Alice to check in if she provides enough funds

    const preCheckInWalletBalanceAlice = await getAccountBalance(addr.Alice)

    const {txPriceWei} = await assertTxSucceeds(
      contract.ownerCheckIn({from: addr.Alice, value: requiredContractBalanceIncrease}),
      `supplying enough funds`)

    const [postCheckInWalletBalanceAlice, postCheckInBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    // check how much is credited to Keepers

    const keeper1 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[1]))
    const keeper2 = assembleKeeperStruct(await contract.activeKeepers(addr.keeper[2]))

    assert.bignumEqual(keeper1.balance, expectedKeepersBalance[0], `keeper 1 balance`)
    assert.bignumEqual(keeper2.balance, expectedKeepersBalance[1], `keeper 2 balance`)

    // check how much is taken from Alice's wallet

    const expectedPostCheckInWalletBalanceAlice =
      preCheckInWalletBalanceAlice.minus(requiredContractBalanceIncrease).minus(txPriceWei)

    assert.bignumEqual(postCheckInWalletBalanceAlice, expectedPostCheckInWalletBalanceAlice,
      `expected amount is taken from Alice's wallet`)

    // check how much is sent to contract's address

    const expectedPostCheckInBalanceContract =
      preCheckInBalanceContract.plus(requiredContractBalanceIncrease)

    assert.bignumEqual(postCheckInBalanceContract, expectedPostCheckInBalanceContract,
      `expected amount is sent to contract's address`)
  })


  it(`if, during check-in, Alice provides too much funds, sends excess funds ` +
     `back to her wallet`, async () => {

    // getting current Keeper balances and calculating expected Keeper balances after check-in

    const preCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const preCheckInKeepersTotalBalance = bigSum(preCheckInKeeperBalances)

    const timePassedSinceLastCheckIn = 23 * 60
    const checkInIntervalFraction = ceil(timePassedSinceLastCheckIn, 600) / checkInIntervalSec

    const expectedPostCheckInKeeperBalances = [
      preCheckInKeeperBalances[0].plus(Math.floor(keepingFees[1] * checkInIntervalFraction)),
      preCheckInKeeperBalances[1].plus(Math.floor(keepingFees[2] * checkInIntervalFraction)),
    ]

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

    const postCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

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

    assert.bignumEqual(postCheckInWalletBalanceAlice, expectedPostCheckInWalletBalanceAlice,
      `Alice's balance`)

    assert.bignumEqual(postCheckInBalanceContract, expectedPostCheckInBalanceContract,
      `contract's balance`)
  })


  it(`when a Keeper checks in, contract sends him his current balance`, async () => {

    const preCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const preCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const preCheckInContractBalance = await getAccountBalance(contract.address)

    const {txPriceWei} = await assertTxSucceeds(
      contract.keeperCheckIn({from: addr.keeper[1]}),
      `first Keeper check-in`
    )

    const postCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const postCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const postCheckInContractBalance = await getAccountBalance(contract.address)

    assert.bignumEqual(
      postCheckInKeeperBalances[0],
      0,
      `first Keeper balance`)

    assert.bignumEqual(
      postCheckInKeeperBalances[1],
      preCheckInKeeperBalances[1],
      `second Keeper balance`)

    assert.bignumEqual(
      postCheckInKeeperWalletBalances[0],
      preCheckInKeeperWalletBalances[0].plus(preCheckInKeeperBalances[0]).minus(txPriceWei),
      `first Keeper wallet balance`)

    assert.bignumEqual(
      postCheckInKeeperWalletBalances[1],
      preCheckInKeeperWalletBalances[1],
      `second Keeper wallet balance`)

    assert.bignumEqual(
      postCheckInContractBalance,
      preCheckInContractBalance.minus(preCheckInKeeperBalances[0]),
      `contract balance`)
  })


  it(`cancelling a contract credits all Keepers as if it was a check-in, and sends all ` +
     `excess funds left in the contract's wallet to Alice`, async () => {

    const timePassedSinceLastCheckIn = 51 * 60
    const checkInIntervalFraction = ceil(timePassedSinceLastCheckIn, 600) / checkInIntervalSec

    const expectedKeeperBalanceIncreases = [
      Math.floor(checkInIntervalFraction * keepingFees[1]),
      Math.floor(checkInIntervalFraction * keepingFees[2]),
    ]

    // obtaining pre-cancel balances

    const preCancelKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const expectedPostCancelKeeperBalances = preCancelKeeperBalances.map(
      (bal, i) => bal.add(expectedKeeperBalanceIncreases[i])
    )

    const expectedPostCancelKeepersTotalBalance = bigSum(expectedPostCancelKeeperBalances)

    const [preCancelWalletBalanceAlice, preCancelBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    // this is a pre-condition for this test, not contract logic check
    assert(preCancelBalanceContract.greaterThan(expectedPostCancelKeepersTotalBalance),
      `contract balance precondition`)

    // cancelling contract after some time since last check-in passes

    await assertTxSucceeds(contract.increaseTimeBy(timePassedSinceLastCheckIn),
      `increasing time`)

    const {txPriceWei} = await assertTxSucceeds(contract.cancel(
      {from: addr.Alice, value: 0}),
      `cancelling the contract`)

    // obtaining post-cancel balances

    const postCancelKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const [postCancelWalletBalanceAlice, postCancelBalanceContract] =
      await getAccountBalances(addr.Alice, contract.address)

    // checks

    assert.deepEqual(
      postCancelKeeperBalances.map(stringify),
      expectedPostCancelKeeperBalances.map(stringify),
      `keeper balances`)

    assert.bignumEqual(postCancelBalanceContract, expectedPostCancelKeepersTotalBalance,
      `contract's balance`)

    const expectedPostCancelWalletBalanceAlice = preCancelWalletBalanceAlice
      .plus(preCancelBalanceContract)
      .minus(expectedPostCancelKeepersTotalBalance)
      .minus(txPriceWei)

    assert.bignumEqual(postCancelWalletBalanceAlice, expectedPostCancelWalletBalanceAlice,
      `Alice's wallet balance`)
  })


  it(`Keeper can withdraw his balance after cancellation`, async () => {
    const preCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const preCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const preCheckInContractBalance = await getAccountBalance(contract.address)

    const {txPriceWei} = await assertTxSucceeds(
      contract.keeperCheckIn({from: addr.keeper[2]}),
      `Keeper check-in`
    )

    const postCheckInKeeperBalances = await getActiveKeepersBalances(contract,
      [addr.keeper[1], addr.keeper[2]])

    const postCheckInKeeperWalletBalances = await getAccountBalances(addr.keeper[1], addr.keeper[2])
    const postCheckInContractBalance = await getAccountBalance(contract.address)

    assert.bignumEqual(postCheckInKeeperBalances[1], 0,
      `second Keeper balance`)

    assert.bignumEqual(postCheckInKeeperBalances[0], preCheckInKeeperBalances[0],
      `first Keeper balance`)

    assert.bignumEqual(postCheckInKeeperWalletBalances[1],
      preCheckInKeeperWalletBalances[1].plus(preCheckInKeeperBalances[1]).minus(txPriceWei),
      `second Keeper wallet balance`)

    assert.bignumEqual(postCheckInKeeperWalletBalances[0], preCheckInKeeperWalletBalances[0],
      `first Keeper wallet balance`)

    assert.bignumEqual(postCheckInContractBalance,
      preCheckInContractBalance.minus(preCheckInKeeperBalances[1]),
      `contract balance`)
  })

})
