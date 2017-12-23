import getWeb3 from './get-web3'
import {promisifyCall} from './promisify'

const web3 = getWeb3()

export function getAccounts() {
  return promisifyCall(web3.eth.getAccounts, web3.eth)
}

export function getLatestBlock() {
  return promisifyCall(web3.eth.getBlock, web3.eth, ['latest'])
}

export function sign(address, data) {
  return promisifyCall(web3.eth.sign, web3.eth, [address, ''])
}
