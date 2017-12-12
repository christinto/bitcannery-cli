import Web3 from 'web3'
import config from '../config'

let web3Instance

function _getWeb3() {
  const provider = new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`)
  const web3 = new Web3(provider)
  return web3
}

export default function getWeb3() {
  if (!web3Instance) {
    web3Instance = _getWeb3()
  }
  return web3Instance
}
