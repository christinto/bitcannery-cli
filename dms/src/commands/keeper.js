import BigNumber from 'bignumber.js'
import assert from 'assert'

import {States, assembleKeeperStruct, assembleEncryptedDataStruct} from '../utils/contract-api'
import getContractClass from '../utils/get-contract-class'
import getWeb3 from '../utils/get-web3'
import {promisifyCall} from '../utils/promisify'
import {formatWei} from '../utils/format'
import tx from '../utils/tx'
import encryptionUtils from '../utils/encryption'
import packingUtils from '../utils/pack'

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

const web3 = getWeb3()

const keypair = generateKeyPair()

const config = {
  accountIndex: 1,
  maxCheckInIntervalSec: SECONDS_IN_MONTH * 365,
  keepingFeePerContractMonth: String(web3.toWei('0.01', 'ether')),
  checkinsPerKeepingPeriod: 2,
  keypair: keypair,
}

export async function handler(argv) {
  try {
    await _handler(argv)
  } catch (err) {
    console.log(err.stack)
  }
}

async function _handler(argv) {
  const [LegacyContract, account] = [
    await getContractClass(),
    await getAccountWithIndex(config.accountIndex),
  ]
  console.log(`Using account: ${account}`)
  const instance = await LegacyContract.at(argv.contract)
  await checkContract(instance, account)
}

async function checkContract(contract, account) {
  const state = await contract.state()
  console.log(`Contract state: ${States.stringify(state)}`)
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
  if (checkInInterval.toNumber() > config.maxCheckInIntervalSec) {
    return {
      isContractEgligible: false,
      comment: `check-in interval ${checkInInterval} is larger than max ${
        config.maxCheckInIntervalSec
      }`,
    }
  }
  return {isContractEgligible: true}
}

async function sendProposal(contract, account) {
  console.error(`Sending proposal for contract ${contract.address}...`)
  const keepingFee = await calculateKeepingFee(contract)
  console.error(`Keeping fee per owner check-in: ${formatWei(keepingFee)}`)
  const {txHash, txPriceWei} = await tx(
    contract.submitKeeperProposal(config.keypair.publicKey, keepingFee, {
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
    .mul(config.keepingFeePerContractMonth)
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

  console.error(`Performing check-in for contract ${contract.address}...`)

  // TODO: check that ETH to be received is sufficiently bigger than TX price, and don't
  // check in otherwise

  const {txHash, txPriceWei} = await tx(
    contract.keeperCheckIn({
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  console.error(
    `Done! Transaction hash: ${txHash}\n` +
      `Received ${formatWei(keeper.balance)}, ` +
      `paid for transaction ${formatWei(txPriceWei)}, ` +
      `balance change ${formatWei(keeper.balance.minus(txPriceWei))}`,
  )

  const state = (await contract.state()).toNumber()

  if (state === States.CallForKeys) {
    console.error(`Owner disappeared, started keys collection`)
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

  console.error(`Supplying key part for contract ${contract.address}...`)

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
  const keyPart = await encryptionUtils.ecDecrypt(encryptedKeyPart, config.keypair.privateKey)

  console.error(`Decrypted key part:`, keyPart)

  const {txHash, txPriceWei} = await tx(
    contract.supplyKey(keyPart, {
      from: account,
      gas: 4700000, // TODO: estimate gas
    }),
  )

  const received = keeper.balance.plus(keeper.keepingFee)

  console.error(
    `Done! Transaction hash: ${txHash}\n` +
      `Received ${formatWei(received)}, ` +
      `paid for transaction ${formatWei(txPriceWei)}, ` +
      `balance change ${formatWei(received.minus(txPriceWei))}`,
  )
}

//
// State: Cancelled
//

async function handleCancelledState(contract, account) {
  // nop
}

//
// Utils
//

async function getAccountWithIndex(index) {
  const accounts = await promisifyCall(web3.eth.getAccounts, web3.eth)
  return accounts[index]
}
