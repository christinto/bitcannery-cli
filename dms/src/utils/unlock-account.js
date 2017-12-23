import getWeb3 from './get-web3'
import delay from './delay'
import {promisifyCall} from './promisify'

import {config} from '../config'

const RUNNING = -1
const WAITING_FOR_JSON_RPC = 0
const WAITING_FOR_AT_LEAST_ONE_ACCOUNT = 1
const WAITING_FOR_ACCOUNT_UNLOCKING = 2

const TIMEOUT = 1000

export async function isAccountLocked(address, web3) {
  try {
    await promisifyCall(web3.eth.sign, web3.eth, [address, ''])
  } catch (e) {
    return true
  }
  return false
}

export default async function unlockAccount(unlockPersistently = false) {
  let state = RUNNING

  while (true) {
    try {
      const web3 = getWeb3()
      const accounts = await promisifyCall(web3.eth.getAccounts, web3.eth)

      if (state === WAITING_FOR_JSON_RPC) {
        state = RUNNING
      }

      if (accounts.length === 0) {
        if (state !== WAITING_FOR_AT_LEAST_ONE_ACCOUNT) {
          console.error(`\nThere are no accounts, please add at least one to your Ethereum client.`)
          console.error(`Waiting for accounts...`)
          state = WAITING_FOR_AT_LEAST_ONE_ACCOUNT
        }
        await delay(TIMEOUT)
        continue
      } else if (config.accountIndex >= accounts.length) {
        throw new Error(`\nThere is no account with index ${config.accountIndex}`)
      } else if (state === WAITING_FOR_AT_LEAST_ONE_ACCOUNT) {
        state = RUNNING
      }

      const address = accounts[config.accountIndex]

      if (await isAccountLocked(address, web3)) {
        if (state !== WAITING_FOR_ACCOUNT_UNLOCKING) {
          console.error(`\nAccount with address ${address} is locked, please unlock it.`)
          if (unlockPersistently) {
            console.error(`In order to run keeper node, you need to unlock it persistently.`)
            console.error(`In web3 console, you can use this command:\n`)
            console.error(`> web3.personal.unlockAccount("${address}", undefined, 0)\n`)
          } else {
            console.error(`In web3 console, you can use this command:\n`)
            console.error(`> web3.personal.unlockAccount("${address}")\n`)
          }
          console.error(`Waiting...`)
          state = WAITING_FOR_ACCOUNT_UNLOCKING
        }
        await delay(TIMEOUT)
        continue
      } else {
        return address
      }
    } catch (e) {
      if (state !== WAITING_FOR_JSON_RPC) {
        console.error(`\nFailed to connect to JSON RPC.\n`)
        console.error(`Please start your Ethereum client with JSON RPC at`)
        console.error(`${config.rpcConnection}\n`)
        console.error(`If you have Ethereum client listening at different address, please`)
        console.error(`specify it using --rpc_connection option to dms command.\n`)
        console.error(`Waiting...`)
        state = WAITING_FOR_JSON_RPC
      }

      await delay(TIMEOUT)
    }
  }
}
