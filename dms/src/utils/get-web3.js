import Web3 from 'web3'
import HDWalletProvider from 'truffle-hdwallet-provider'

import {config} from '../config'

let web3Instance

function _getProvider() {
  const {useLocalAccounts, mnemonic, rpcConnection} = config
  if (useLocalAccounts && mnemonic) {
    return new HDWalletProvider(mnemonic, rpcConnection)
  } else {
    return new Web3.providers.HttpProvider(rpcConnection)
  }
}

function _getWeb3() {
  const provider = _getProvider()
  const web3 = new Web3(provider)
  return web3
}

export default function getWeb3() {
  if (!web3Instance) {
    web3Instance = _getWeb3()
  }
  return web3Instance
}
