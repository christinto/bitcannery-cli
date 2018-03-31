import getWeb3 from './get-web3'
import {promisifyCall} from './promisify'
import BigNumber from 'bignumber.js'

const web3 = getWeb3()

export function getAccounts() {
  return promisifyCall(web3.eth.getAccounts, web3.eth)
}

export function getLatestBlock() {
  return promisifyCall(web3.eth.getBlock, web3.eth, ['latest'])
}

export function getTransaction(txHash) {
  return promisifyCall(web3.eth.getTransaction, web3.eth, [txHash])
}

export function getGasPrice() {
  return promisifyCall(web3.eth.getGasPrice, web3.eth)
}

export function getBalance(address) {
  return promisifyCall(web3.eth.getBalance, web3.eth, [address])
}

export function sign(address, data) {
  return promisifyCall(web3.eth.sign, web3.eth, [address, data])
}

export function getNetwork() {
  return promisifyCall(web3.version.getNetwork, web3.version)
}

export function addressIsZero(address) {
  // sometimes geth returns 0x instead of 0x0 which leads to exception
  // inside the BigNumber lib.
  if (address == '0x') {
    return true
  } else {
    return new BigNumber(address).isZero()
  }
}

export async function getNetworkName() {
  const netId = await getNetwork()

  switch (netId) {
    case '1':
      return 'Ethereum mainnet'
    case '2':
      return 'Morden test network'
    case '3':
      return 'Ropsten test network'
    case '4':
      return 'Rinkeby test network'
    case '1337':
      return 'Local development test network'
    default:
      return 'Unknown network'
  }
}
