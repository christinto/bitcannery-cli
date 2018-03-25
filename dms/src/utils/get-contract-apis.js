import truffleContract from 'truffle-contract'
import getWeb3 from './get-web3'

import {LegacyContractABI, RegistryContractABI} from '../contract-abis'

let classesByName = {}
let registry

function assembleContractClass(abi, web3) {
  let cls = classesByName[abi.contractName]
  if (!cls) {
    cls = truffleContract(abi)
    cls.setProvider(web3.currentProvider)
    classesByName[abi.contractName] = cls
  }
  return cls
}

export default async function getContractAPIs() {
  const web3 = getWeb3()
  const LegacyContract = assembleContractClass(LegacyContractABI, web3)
  const RegistryContract = assembleContractClass(RegistryContractABI, web3)
  if (!registry) {
    registry = await RegistryContract.deployed()
  }
  return {LegacyContract, RegistryContract, registry}
}
