import Web3 from 'web3'
import config from '../config'

export default function getWeb3 () {
  const provider = new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`)

  const web3 = new Web3(provider)

  return web3
}
