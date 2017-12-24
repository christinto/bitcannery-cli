import BigNumber from 'bignumber.js'
import assert from 'assert'

import {States, assembleKeeperStruct, assembleEncryptedDataStruct} from '../utils/contract-api'
import getContractAPIs from '../utils/get-contract-apis'
import {getLatestBlock} from '../utils/web3'
import {formatWei} from '../utils/format'
import unlockAccount, {isAccountLocked} from '../utils/unlock-account'
import {contractTx} from '../utils/tx'
import encryptionUtils from '../utils/encryption'
import delay from '../utils/delay'
import runCommand from '../utils/run-command'
import toNumber from '../utils/to-number'
import runInChunks from '../utils/run-in-chunks'
import throttle from '../utils/throttle'
import {config, updateConfig} from '../config'

import contractsStore from './keeper/contracts-store'

export const description = 'Run Keeper node'

export function yargsBuilder(yargs) {
  return yargs.example('$0 keeper', 'Run keeper node')
}

const SECONDS_IN_MONTH = 60 * 60 * 24 * 30

// TODO: move these to config.
//
const NUM_CONTRACTS_TO_CHECK_ON_FIRST_RUN = 100
const MAX_CONTRACTS_TO_CHECK_SINCE_LAST_RUN = 100
const PROCESS_N_CONTRACTS_IN_PARALLEL = 10

export async function handler(argv) {
  await runCommand(() => runKeeper())
}

// TODO: currently, if you set account index in config (e.g. using set-client-options command)
// while keeper node is running, the node will still use the old account until restarted.

// Don't call updateConfig more often than once in five seconds.
const updateConfigThrottled = throttle(5000, updateConfig)

async function runKeeper() {
  console.error(`Keeper config:`, sanitizeKeeperConfig(config.keeper))

  const [{LegacyContract, registry}, account] = [await getContractAPIs(), await unlockAccount(true)]
  const api = {LegacyContract, registry, account}

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
  const instance = await api.LegacyContract.at(address)
  return watchContract(instance, api)
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
  return checkContractWithAddress(address, api)
}

async function checkNewContractsSinceLastStart(api) {
  console.error(`==> Checking new contracts since last start...`)

  const totalContracts = await toNumber(api.registry.getNumContracts())

  let lastIndex = contractsStore.getLastCheckedContractIndex()
  if (lastIndex == null || lastIndex == -1) {
    lastIndex = Math.max(-1, totalContracts - NUM_CONTRACTS_TO_CHECK_ON_FIRST_RUN - 1)
  } else if (lastIndex >= totalContracts) {
    console.error(`WARN seems you switched to a different network.`)
    lastIndex = totalContracts - 1
    contractsStore.setLastCheckedContractIndex(lastIndex)
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
      const id = await api.registry.contracts(lastIndex + 1 + i)
      const address = await api.registry.getContractAddress(id)
      return checkContractWithAddress(address, api)
    },
  })

  contractsStore.setLastCheckedContractIndex(totalContracts - 1)

  console.error(`==> Done checking new contracts since last start!`)
}

async function checkContractWithAddress(address, api) {
  const instance = await api.LegacyContract.at(address)
  return await checkContract(instance, api)
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
  const didSendProposal = await contract.didSendProposal(api.account)
  if (didSendProposal) {
    return
  }
  const checkResult = await checkContractEligibility(contract)
  if (!checkResult.isContractEligible) {
    console.error(`Skipping contract ${contract.address}: ${checkResult.comment}`)
    return
  }

  contractsStore.addContract(contract.address)
  await sendProposal(contract, api.account)
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
  console.error(`==> Sending proposal for contract ${contract.address}...`)

  const keepingFee = await calculateKeepingFee(contract)
  console.error(`Keeping fee per owner check-in: ${formatWei(keepingFee)}`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await contractTx(
    contract,
    'submitKeeperProposal',
    config.keeper.keypair.publicKey,
    keepingFee,
    {from: account},
  )

  console.error(`Done! Transaction hash: ${txHash}`)
  console.error(`Paid for transaction: ${formatWei(txPriceWei)}`)
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

  const [keeper, checkInInterval, lastOwnerCheckInAt] = [
    assembleKeeperStruct(await contract.activeKeepers(account)),
    (await contract.checkInInterval()).toNumber(),
    (await contract.lastOwnerCheckInAt()).toNumber(),
  ]

  const now = Math.floor(Date.now() / 1000)
  // const now = (await contract.debugTimestamp()).toNumber() + 60
  const passedSinceOwnerCheckIn = now - lastOwnerCheckInAt

  if (passedSinceOwnerCheckIn <= checkInInterval && keeper.lastCheckInAt >= lastOwnerCheckInAt) {
    return
  }

  console.error(`==> Performing check-in for contract ${contract.address}...`)

  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise

  await ensureUnlocked(account)
  const {txHash, txPriceWei} = await contractTx(contract, 'keeperCheckIn', {from: account})

  printTx(txHash, keeper.balance, txPriceWei)

  const state = (await contract.state()).toNumber()

  if (state === States.CallForKeys) {
    console.error(`==> Owner disappeared, started keys collection`)
    await handleCallForKeysState(contract, api)
  } else {
    // TODO: check for continuation contract
  }
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

  const [numKeepers, encryptedData] = [
    (await contract.getNumKeepers()).toNumber(),
    assembleEncryptedDataStruct(await contract.encryptedData()),
  ]

  const activeKeepersAddresses = await Promise.all(
    new Array(numKeepers).fill(0).map((_, i) => contract.activeKeepersAddresses(i)),
  )

  const myIndex = activeKeepersAddresses.indexOf(account)
  assert(myIndex >= 0, `active keeper's address should be in keeper addresses list`)

  updateConfigThrottled()

  const keyPart = await encryptionUtils.decryptKeeperShare(
    encryptedData.encryptedKeyParts,
    numKeepers,
    myIndex,
    config.keeper.keypair.privateKey,
    keeper.keyPartHash,
  )

  console.error(`Decrypted key part: ${keyPart}`)

  await ensureUnlocked(account)
  const {txHash, txPriceWei} = await contractTx(contract, 'supplyKey', keyPart, {from: account})

  const received = keeper.balance.plus(keeper.keepingFee)
  printTx(txHash, received, txPriceWei)

  contractsStore.removeContract(contract.address)
}

//
// State: Cancelled
//

async function handleCancelledState(contract, {account}) {
  const keeper = assembleKeeperStruct(await contract.activeKeepers(account))
  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise
  if (keeper.balance.isZero()) {
    return
  }

  console.error(`==> Performing final check-in for contract ${contract.address}...`)

  await ensureUnlocked(account)
  const {txHash, txPriceWei} = await contractTx(contract, 'keeperCheckIn', {from: account})

  printTx(txHash, keeper.balance, txPriceWei)
  contractsStore.removeContract(contract.address)

  // TODO: check for continuation contract
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

function printTx(txHash, received, txPrice) {
  console.error(
    `Done! Transaction hash: ${txHash}\n` +
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
