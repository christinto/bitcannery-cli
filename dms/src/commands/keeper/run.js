export const command = ['run', '$0']

export const desc = 'Run Keeper node'

export const builder = {}

// Implementation

import BigNumber from 'bignumber.js'
import assert from 'assert'
import {EventEmitter} from 'events'

import {
  States,
  assembleKeeperStruct,
  assembleEncryptedDataStruct,
  fetchEncryptedKeyPartsChunks,
} from '../../utils/contract-api'

import getContractAPIs from '../../utils/get-contract-apis'
import {getLatestBlock, addressIsZero} from '../../utils/web3'
import {formatWei} from '../../utils/format'
import {printWelcomeAndUnlockAccount} from '../../contract-utils/common'
import {isAccountLocked} from '../../utils/accounts/unlock-account'
import {contractTx} from '../../utils/tx'
import encryptionUtils from '../../utils/encryption'
import delay from '../../utils/delay'
import runCommand from '../../utils/run-command'
import toNumber from '../../utils/to-number'
import runInChunks from '../../utils/run-in-chunks'
import throttle from '../../utils/throttle'
import AsyncSerialQueue from '../../utils/async-serial-queue'
import {config, updateConfig} from '../../config'

import contractsStore from './utils/contracts-store'

export async function handler(argv) {
  await runCommand(() => runKeeper())
}

const SECONDS_IN_MONTH = 60 * 60 * 24 * 30

// TODO: move these to config.
//
const NUM_CONTRACTS_TO_CHECK_ON_FIRST_RUN = 100
const MAX_CONTRACTS_TO_CHECK_SINCE_LAST_RUN = 100
const PROCESS_N_CONTRACTS_IN_PARALLEL = 10

// TODO: currently, if you set account index in config (e.g. using set-client-options command)
// while keeper node is running, the node will still use the old account until restarted.

// Don't call updateConfig more often than once in five seconds.
const updateConfigThrottled = throttle(5000, updateConfig)

const addressesWithProposalsSentSinceStart = {}
const txQueue = new AsyncSerialQueue()

async function runKeeper() {
  console.error(`Node.js version:`, process.version)

  EventEmitter.defaultMaxListeners = 100;

  const [{LegacyContract, registry}, account] = [
    await getContractAPIs(),
    await printWelcomeAndUnlockAccount(),
  ]
  const api = {LegacyContract, registry, account}

  console.error(`Keeper config:`, sanitizeKeeperConfig(config.keeper))
  console.error(`Using account with index ${config.accountIndex}: ${account}`)

  await watchCurrentContracts(api)
  await watchForNewContracts(api)
  //
  // FIXME: RACE CONDITION HERE!!!!!!
  //
  await delay(3000) // give some time for event watcher to start
  await checkNewContractsSinceLastStart(api)
}

async function watchCurrentContracts(api) {
  contractsStore.forEachContract(address => watchContractWithAddress(address, api))
}

async function watchContractWithAddress(address, api) {
  try {
    const instance = await api.LegacyContract.at(address).then(x => x)
    return watchContract(instance, api)
  } catch (err) {
    handleContractObtainingError(err, address)
  }
}

async function watchContract(instance, api) {
  console.error(`Started wathing contract with address ${instance.address}`)
  // TODO: use events here instead of polling
  while (contractsStore.hasContract(instance.address)) {
    await runCommand(() => checkContract(instance, api), false)
    await delay(1000)
  }
}

async function watchForNewContracts(api) {
  const latestBlock = await getLatestBlock()

  api.registry.allEvents({fromBlock: latestBlock.number}, (err, log) => {
    if (err) {
      // TODO: re-initialize filter?
      console.error(`WARN error while watching registry events: ${err.message}`)
    } else {
      handleRegistryEvent(log, api).catch(err => {
        console.error(`WARN error while handling registry event: ${err.stack}`)
      })
    }
  })

  console.error(`Started watching for new contracts.`)
}

function handleRegistryEvent(log, api) {
  switch (log.event) {
    case 'NewContract': {
      return handleNewContractEvent(log.args, api)
    }
    default: {
      console.error(`WARN unexpected registry event "${log.event}"`)
    }
  }
}

async function handleNewContractEvent({id, addr: address, totalContracts}, api) {
  console.error(`==> Detected new contract "${id}" at address ${address}`)
  contractsStore.setLastCheckedContractIndex(totalContracts.toNumber() - 1)
  updateConfigThrottled()
  return checkNewContractWithAddress(address, api)
}

async function checkNewContractsSinceLastStart(api) {
  console.error(`==> Checking new contracts since last start...`)

  const totalContracts = await toNumber(api.registry.getNumContracts())

  let lastIndex = contractsStore.getLastCheckedContractIndex()

  if (lastIndex >= totalContracts) {
    console.error(`WARN seems you switched to a different network.`)
    lastIndex = -1
    contractsStore.setLastCheckedContractIndex(lastIndex)
  }

  if (lastIndex == null || lastIndex == -1) {
    lastIndex = Math.max(-1, totalContracts - NUM_CONTRACTS_TO_CHECK_ON_FIRST_RUN - 1)
  }

  let numContractsToCheck = totalContracts - 1 - lastIndex

  if (numContractsToCheck > MAX_CONTRACTS_TO_CHECK_SINCE_LAST_RUN) {
    numContractsToCheck = MAX_CONTRACTS_TO_CHECK_SINCE_LAST_RUN
    lastIndex = totalContracts - 1 - numContractsToCheck
  }

  if (numContractsToCheck === 0) {
    console.error(`No new contracts since last start.`)
    return
  }

  console.error(`Total ${numContractsToCheck} new contracts since last start.`)

  await runInChunks({
    chunkSize: PROCESS_N_CONTRACTS_IN_PARALLEL,
    dataLength: numContractsToCheck,
    fn: async i => {
      try {
        const id = await api.registry.contracts(lastIndex + 1 + i)
        const address = await api.registry.getContractAddress(id)
        await checkNewContractWithAddress(address, api)
      } catch (err) {
        console.error(`ERROR failed to check new contract appeared since last start: ${err.stack}`)
      }
    },
  })

  contractsStore.setLastCheckedContractIndex(totalContracts - 1)

  console.error(`==> Done checking new contracts since last start!`)
}

async function checkNewContractWithAddress(address, api) {
  try {
    const instance = await api.LegacyContract.at(address).then(x => x)
    return checkNewContract(instance, api)
  } catch (err) {
    handleContractObtainingError(err, address)
  }
}

async function checkNewContract(contract, api) {
  const state = await contract.state()
  return state.toNumber() === States.CallForKeepers
    ? handleCallForKeepersState(contract, api)
    : null
}

async function checkContract(contract, api) {
  const state = await contract.state()
  // console.error(`Contract ${contract.address} state: ${States.stringify(state)}`)
  switch (state.toNumber()) {
    case States.CallForKeepers: {
      return handleCallForKeepersState(contract, api)
    }
    case States.Active: {
      return handleActiveState(contract, api)
    }
    case States.CallForKeys: {
      return handleCallForKeysState(contract, api)
    }
    case States.Cancelled: {
      return handleCancelledState(contract, api)
    }
    default: {
      throw new Error(`unexpected contract state: ${state}`)
    }
  }
}

//
// State: CallForKeepers
//

async function handleCallForKeepersState(contract, api) {
  // We need to remember contract addresses we already decided to send proposals to since last
  // start, as `handleCallForKeepersState` may be called multiple times in parallel with the same
  // contract. This may happen because 1) there may be multiple entries of the same contract id
  // into the `Registry.contracts` array, as keepers rotation adds the same id one more time;
  // 2) when continuation contract is announced, both `Contract.continuationContractAddress` is set
  // and a new entry is added to `Registry.contracts` array, and Keeper client handles both events.
  // Since we're not serializing `Contract.didSendProposal` checks with transactions, the client
  // will attempt to send two proposals to the same contract, which will result in the second
  // transaction failing.
  //
  if (!addressesWithProposalsSentSinceStart[contract.address]) {
    addressesWithProposalsSentSinceStart[contract.address] = true
  } else {
    return
  }
  if (await contract.didSendProposal(api.account)) {
    return
  }
  const checkResult = await checkContractEligibility(contract)
  if (!checkResult.isContractEligible) {
    console.error(`Skipping contract ${contract.address}: ${checkResult.comment}`)
    return
  }

  contractsStore.addContract(contract.address)

  try {
    await sendProposal(contract, api.account)
  } catch (err) {
    console.error(`Failed to send proposal to contract ${contract.address}: ${err.stack}`)
    contractsStore.removeContract(contract.address)
    return
  }

  watchContract(contract, api)
}

async function checkContractEligibility(contract) {
  const checkInInterval = await contract.checkInInterval()
  const {maxCheckInIntervalSec} = config.keeper
  if (checkInInterval.toNumber() > maxCheckInIntervalSec) {
    return {
      isContractEligible: false,
      comment: `check-in interval ${checkInInterval} is larger than max ${maxCheckInIntervalSec}`,
    }
  }
  return {isContractEligible: true}
}

async function sendProposal(contract, account) {
  console.error(`==> Will send proposal for contract ${contract.address}`)

  const keepingFee = await calculateKeepingFee(contract)
  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await txQueue.enqueueAndWait(async () => {
    console.error(
      `Sending proposal for contract ${contract.address}, fee per owner ` +
        `check-in: ${formatWei(keepingFee)}...`,
    )
    return contractTx(
      contract,
      'submitKeeperProposal',
      config.keeper.keypair.publicKey,
      keepingFee,
      {
        from: account,
      },
    )
  })

  console.error(
    `Done sending proposal for contract ${contract.address}, transaction hash: ${txHash}\n` +
      `Paid for transaction: ${formatWei(txPriceWei)}`,
  )
}

async function calculateKeepingFee(contract) {
  const checkInInterval = await contract.checkInInterval()
  return new BigNumber(checkInInterval)
    .div(SECONDS_IN_MONTH)
    .mul(config.keeper.keepingFeePerContractMonth)
    .round(BigNumber.ROUND_UP)
}

//
// State: Active
//

async function handleActiveState(contract, api) {
  const {account} = api
  const isActiveKeeper = await contract.isActiveKeeper(account)

  if (!isActiveKeeper) {
    console.error(`Account ${account} is not an active Keeper for contract ${contract.address}`)
    contractsStore.removeContract(contract.address)
    return
  }

  const {checkInNeeded, availableBalance} = await inspectActiveContract(contract, api)
  if (checkInNeeded) {
    await performCheckIn(contract, availableBalance, api)
  }
}

async function inspectActiveContract(contract, {account}) {
  const [keeper, checkInInterval, lastOwnerCheckInAt] = [
    assembleKeeperStruct(await contract.activeKeepers(account)),
    (await contract.checkInInterval()).toNumber(),
    (await contract.lastOwnerCheckInAt()).toNumber(),
  ]

  const now = Math.floor(Date.now() / 1000)
  // const now = (await contract.debugTimestamp()).toNumber() + 60

  const passedSinceOwnerCheckIn = now - lastOwnerCheckInAt

  const checkInNeeded =
    passedSinceOwnerCheckIn > checkInInterval || keeper.lastCheckInAt < lastOwnerCheckInAt

  return {checkInNeeded, availableBalance: keeper.balance}
}

async function performCheckIn(contract, availableBalance, api) {
  console.error(`==> Performing check-in for contract ${contract.address}...`)

  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise

  await ensureUnlocked(api.account)

  const {txHash, txPriceWei} = await txQueue.enqueueAndWait(() =>
    contractTx(contract, 'keeperCheckIn', {from: api.account}),
  )

  printTx(
    `performing check-in for contract ${contract.address}`,
    txHash,
    availableBalance,
    txPriceWei,
  )

  const state = (await contract.state()).toNumber()

  if (state === States.CallForKeys) {
    console.error(`==> Owner disappeared, started keys collection`)
    await handleCallForKeysState(contract, api)
  } else {
    await handleContinuationContractIfAny(contract, api)
  }
}

async function handleContinuationContractIfAny(contract, api) {
  const continuationContract = await getContinuationContract(contract, api)
  if (continuationContract) {
    await checkNewContract(continuationContract, api)
  }
}

async function getContinuationContract(contract, api) {
  let currentContract = contract
  let continuationAddress

  do {
    continuationAddress = validAddressOrNull(await currentContract.continuationContractAddress())
    if (continuationAddress) {
      currentContract = await api.LegacyContract.at(continuationAddress).then(x => x)
    }
  } while (continuationAddress)

  return currentContract === contract ? null : currentContract
}

function validAddressOrNull(address) {
  return addressIsZero(address) ? null : address
}

//
// State: CallForKeys
//

async function handleCallForKeysState(contract, {account}) {
  const keeper = assembleKeeperStruct(await contract.activeKeepers(account))
  if (keeper.keyPartSupplied) {
    contractsStore.removeContract(contract.address)
    return
  }

  console.error(`==> Supplying key part for contract ${contract.address}...`)

  const [numKeepers, encryptedKeyPartsChunks] = [
    +await contract.getNumKeepers(),
    await fetchEncryptedKeyPartsChunks(contract),
  ]

  const activeKeepersAddresses = await Promise.all(
    new Array(numKeepers).fill(0).map((_, i) => contract.activeKeepersAddresses(i)),
  )

  const myIndex = activeKeepersAddresses.indexOf(account)
  assert(myIndex >= 0, `active keeper's address should be in keeper addresses list`)

  updateConfigThrottled()

  const keyPart = await encryptionUtils.decryptKeeperShare(
    encryptedKeyPartsChunks,
    myIndex,
    config.keeper.keypair.privateKey,
    keeper.keyPartHash,
  )

  console.error(`Decrypted key part: ${keyPart}`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await txQueue.enqueueAndWait(() =>
    contractTx(contract, 'supplyKey', keyPart, {from: account}),
  )

  const received = keeper.balance.plus(keeper.keepingFee)
  printTx(`supplying key part for contract ${contract.address}`, txHash, received, txPriceWei)

  contractsStore.removeContract(contract.address)
}

//
// State: Cancelled
//

async function handleCancelledState(contract, api) {
  const {account} = api
  const keeper = assembleKeeperStruct(await contract.activeKeepers(account))

  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise
  if (keeper.balance.isZero()) {
    return
  }

  console.error(`==> Performing final check-in for contract ${contract.address}...`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await txQueue.enqueueAndWait(() =>
    contractTx(contract, 'keeperCheckIn', {from: account}),
  )

  printTx(
    `performing final check-in for contract ${contract.address}`,
    txHash,
    keeper.balance,
    txPriceWei,
  )

  contractsStore.removeContract(contract.address)

  await handleContinuationContractIfAny(contract, api)
}

//
// Utils
//

async function ensureUnlocked(account) {
  if (await isAccountLocked(account)) {
    await unlockAccount(true)
    console.error(`Account unlocked, resuming`)
  }
}

function printTx(desc, txHash, received, txPrice) {
  console.error(
    `Done ${desc}! Transaction hash: ${txHash}\n` +
      `Received ${formatWei(received)}, ` +
      `transaction fee ${formatWei(txPrice)}, ` +
      `balance change ${formatWei(received.minus(txPrice))}`,
  )
}

function sanitizeKeeperConfig(keeperConfig) {
  return {
    ...keeperConfig,
    keypair: {
      publicKey: keeperConfig.keypair.publicKey,
      privateKey: '<stripped for logs>',
    },
    contracts: ['<stripped for logs>'],
  }
}

function handleContractObtainingError(err, address) {
  if (/ no code at address /.test(err.message)) {
    console.error(`WARN contract with address ${address} is not found`)
    contractsStore.removeContract(address)
  } else {
    console.error(err.stack)
  }
}
