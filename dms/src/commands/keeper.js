import {States} from '../utils/contract-api'
import getContractClass from '../utils/get-contract-class'
import getWeb3 from '../utils/get-web3'
import {promisifyCall} from '../utils/promisify'
import tx from '../utils/tx'

import encryption from '../utils/encryption'
const {generateKeyPair} = encryption

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

const web3 = getWeb3()

const keypair = generateKeyPair()

const config = {
  accountIndex: 1,
  maxCheckInIntervalSec: 60 * 60 * 24 * 30 * 365, // 1 year
  keepingFeePerContractMonth: web3.toWei('0.01', 'ether'),
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
  const didSendProposal = await contract.didSendProposal(account, {from: account})
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
  const keepingFee = config.keepingFeePerContractMonth // TODO: calculate keeping fee
  await tx(contract.submitKeeperProposal(config.keypair.publicKey, keepingFee, {from: account, gas: 4700000}))
  console.error(`Done!`)
}

//
// State: Active
//

async function handleActiveState(contract, account) {
  const isActiveKeeper = await contract.isActiveKeeper(account)
  //
}

//
// State: CallForKeys
//

async function handleCallForKeysState(contract, account) {
  //
}

//
// State: Cancelled
//

async function handleCancelledState(contract, account) {
  //
}

//
// Utils
//

async function getAccountWithIndex(index) {
  const accounts = await promisifyCall(web3.eth.getAccounts, web3.eth)
  return accounts[index]
}
