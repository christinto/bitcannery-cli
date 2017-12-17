import truffleContract from 'truffle-contract'
import getWeb3 from './get-web3'
import LegacyContractABI from '../../../truffle/build/contracts/CryptoLegacy.json'

let contractInstance

function _getContractAPI() {
  const LegacyContract = truffleContract(LegacyContractABI)
  const web3 = getWeb3()
  const provider = web3.currentProvider

  LegacyContract.setProvider(provider)

  return LegacyContract
}

export default function getContractAPI() {
  if (!contractInstance) {
    contractInstance = _getContractAPI()
  }
  return contractInstance
}
