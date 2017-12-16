import BigNumber from 'bignumber.js'
import assert from 'assert'

import {States, assembleKeeperStruct, assembleEncryptedDataStruct} from '../utils/contract-api'
import getContractClass from '../utils/get-contract-class'
import getWeb3 from '../utils/get-web3'
import {formatWei} from '../utils/format'
import unlockAccount, {isAccountLocked} from '../utils/unlock-account'
import tx from '../utils/tx'
import encryptionUtils from '../utils/encryption'
import packingUtils from '../utils/pack'
import delay from '../utils/delay'
import config from '../config'

export const description = 'Run Keeper node'

export function yargsBuilder(yargs) {
  return yargs
    .example(
      '$0 keeper --contract 0xf455c170ea2c42e0510a3e50625775efec89962e',
      'Run keeper node for contract 0xf455c170ea2c42e0510a3e50625775efec89962e',
    )
    .alias('contract', 'c')
    .nargs('contract', 1)
    .describe('contract', 'Contract address')
    .demandOption(['contract'])
}

const SECONDS_IN_MONTH = 60 * 60 * 24 * 30

const keeperConfig = config.keeper
const web3 = getWeb3()

export async function handler(argv) {
  console.error(`Keeper config:`, sanitizeKeeperConfig(keeperConfig))

  const [LegacyContract, account] = [await getContractClass(), await unlockAccount(true)]
  console.error(`Using account: ${account}`)

  const instance = await LegacyContract.at(argv.contract)
  while (true) {
    try {
      await checkContract(instance, account)
    } catch (err) {
      console.error(err.stack)
    }
    await delay(1000)
  }
}

async function checkContract(contract, account) {
  const state = await contract.state()
  // console.error(`Contract state: ${States.stringify(state)}`)
  switch (state.toNumber()) {
    case States.CallForKeepers: {
      return handleCallForKeepersState(contract, account)
    }
    case States.Active: {
      return handleActiveState(contract, account)
    }
    case States.CallForKeys: {
      return handleCallForKeysState(contract, account)
    }
    case States.Cancelled: {
      return handleCancelledState(contract, account)
    }
    default: {
      throw new Error(`unexpected contract state: ${state}`)
    }
  }
}

//
// State: CallForKeepers
//

async function handleCallForKeepersState(contract, account) {
  const didSendProposal = await contract.didSendProposal(account)
  if (didSendProposal) {
    return
  }
  const checkResult = await checkContractEgligibility(contract)
  if (!checkResult.isContractEgligible) {
    console.error(`Skipping contract ${contract.address}: ${checkResult.comment}`)
    return
  }
  await sendProposal(contract, account)
}

async function checkContractEgligibility(contract) {
  const checkInInterval = await contract.checkInInterval()
  if (checkInInterval.toNumber() > keeperConfig.maxCheckInIntervalSec) {
    return {
      isContractEgligible: false,
      comment: `check-in interval ${checkInInterval} is larger than max ${
        keeperConfig.maxCheckInIntervalSec
      }`,
    }
  }
  return {isContractEgligible: true}
}

async function sendProposal(contract, account) {
  console.error(`==> Sending proposal for contract ${contract.address}...`)

  const keepingFee = await calculateKeepingFee(contract)
  console.error(`Keeping fee per owner check-in: ${formatWei(keepingFee)}`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await tx(
    contract.submitKeeperProposal(keeperConfig.keypair.publicKey, keepingFee, {
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  console.error(`Done! Transaction hash: ${txHash}`)
  console.error(`Paid for transaction: ${formatWei(txPriceWei)}`)
}

async function calculateKeepingFee(contract) {
  const checkInInterval = await contract.checkInInterval()
  return new BigNumber(checkInInterval)
    .div(SECONDS_IN_MONTH)
    .mul(keeperConfig.keepingFeePerContractMonth)
    .round(BigNumber.ROUND_UP)
}

//
// State: Active
//

async function handleActiveState(contract, account) {
  const isActiveKeeper = await contract.isActiveKeeper(account)
  if (!isActiveKeeper) {
    console.error(`Account ${account} is not an active Keeper for contract ${contract.address}`)
    // TODO: remove from list
    return
  }

  // TODO: if contract is not in the list, add and log

  const [keeper, checkInInterval, lastOwnerCheckInAt] = [
    assembleKeeperStruct(await contract.activeKeepers(account)),
    (await contract.checkInInterval()).toNumber(),
    (await contract.lastOwnerCheckInAt()).toNumber(),
  ]

  const now = Math.floor(Date.now() / 1000)
  const passedSinceOwnerCheckIn = now - lastOwnerCheckInAt

  if (passedSinceOwnerCheckIn <= checkInInterval && keeper.lastCheckInAt >= lastOwnerCheckInAt) {
    return
  }

  console.error(`==> Performing check-in for contract ${contract.address}...`)

  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await tx(
    contract.keeperCheckIn({
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  printTx(txHash, keeper.balance, txPriceWei)

  const state = (await contract.state()).toNumber()

  if (state === States.CallForKeys) {
    console.error(`==> Owner disappeared, started keys collection`)
    await handleCallForKeysState(contract, account)
  } else {
    // TODO: check for continuation contract
  }
}

//
// State: CallForKeys
//

async function handleCallForKeysState(contract, account) {
  const keeper = assembleKeeperStruct(await contract.activeKeepers(account))
  if (keeper.keyPartSupplied) {
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

  const enctyptedKeyParts = packingUtils.unpack(encryptedData.encryptedKeyParts, numKeepers)
  const encryptedKeyPartData = enctyptedKeyParts[myIndex]
  const encryptedKeyPart = packingUtils.unpackElliptic(encryptedKeyPartData)
  const keyPart = await encryptionUtils.ecDecrypt(encryptedKeyPart, keeperConfig.keypair.privateKey)

  console.error(`Decrypted key part: ${keyPart}`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await tx(
    contract.supplyKey(keyPart, {
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  const received = keeper.balance.plus(keeper.keepingFee)
  printTx(txHash, received, txPriceWei)
}

//
// State: Cancelled
//

async function handleCancelledState(contract, account) {
  const keeper = assembleKeeperStruct(await contract.activeKeepers(account))
  // TODO: check that ETH to be received is bigger than TX price, and don't check in otherwise
  if (keeper.balance.isZero()) {
    return
  }

  console.error(`==> Performing final check-in for contract ${contract.address}...`)

  await ensureUnlocked(account)

  const {txHash, txPriceWei} = await tx(
    contract.keeperCheckIn({
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  printTx(txHash, keeper.balance, txPriceWei)

  // TODO: check for continuation contract
  // TODO: remove contract from watchlist
}

//
// Utils
//

async function ensureUnlocked(account) {
  if (await isAccountLocked(account, web3)) {
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
  }
}
