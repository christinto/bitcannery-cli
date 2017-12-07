import Web3 from 'web3'
import truffleContract from 'truffle-contract'

import LegacyContractABI from '../../../truffle/build/contracts/CryptoLegacy.json'

import config from '../config'

export default async function () {
  const LegacyContract = truffleContract(LegacyContractABI)

  const provider = new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`)

  LegacyContract.setProvider(provider)

  return LegacyContract
}
