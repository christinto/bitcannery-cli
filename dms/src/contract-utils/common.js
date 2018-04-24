import BigNumber from 'bignumber.js'
import print from '../utils/print'

import {getNetworkName, getBalance} from '../utils/web3'
import {formatWei} from '../utils/format'
import getPreparedAccount from '../utils/accounts/get-prepared-account'
import getContractAPIs from '../utils/get-contract-apis'

const ACCOUNT_LOW_BALANCE = new BigNumber('5e17') // 0.5 ETH
const ACCOUNT_CRITICAL_LOW_BALANCE = new BigNumber('1e15') // 0.001 ETH

export async function printWelcomeAndUnlockAccount() {
  print('Welcome to KeeperNet v2!\n')

  const [networkName, address, {registry}] = await Promise.all([
    getNetworkName(),
    getPreparedAccount(),
    getContractAPIs(),
  ])

  const balance = await getBalance(address)

  print(`Your address: ${address}`)
  print(`Network: ${networkName}`)
  print(`Registry: ${registry.address}`)
  print(`Wallet balance: ${formatWei(balance)}\n`)

  if (balance.lt(ACCOUNT_CRITICAL_LOW_BALANCE)) {
    print('Account balance is too low, please add some ether on it.\n')
    process.exit(1)
    return
  }

  if (balance.lt(ACCOUNT_LOW_BALANCE)) {
    print('Warning: account balance is low, please refill it shortly.\n')
  }

  return address
}
