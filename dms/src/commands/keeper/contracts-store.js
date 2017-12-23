import {config, persistentConfig} from '../../config'

let contracts = []
let addresses = {}
let lastCheckedContractIndex

function initialize() {
  lastCheckedContractIndex = config.keeper.lastCheckedContractIndex
  contracts = config.keeper.contracts
  for (let i = 0; i < contracts.length; ++i) {
    addresses[contracts[i]] = true
  }
}

function addContract(address) {
  if (hasContract(address)) {
    return
  }
  contracts.push(address)
  addresses[address] = true
  persistentConfig.set('keeper.contracts', contracts)
  console.error(`Added contract ${address} to list`)
}

function removeContract(address) {
  const index = contracts.indexOf(address)
  if (index >= 0) {
    contracts.splice(index, 1)
    addresses[address] = false
    persistentConfig.set('keeper.contracts', contracts)
    console.error(`Removed contract ${address} from list`)
  }
}

function hasContract(address) {
  return addresses[address]
}

function forEachContract(iterator) {
  return contracts.forEach(iterator)
}

function getContracts() {
  return contracts.slice()
}

function getLastCheckedContractIndex() {
  return lastCheckedContractIndex
}

function setLastCheckedContractIndex(newIndex) {
  lastCheckedContractIndex = newIndex
  persistentConfig.set('keeper.lastCheckedContractIndex', newIndex)
}

export default {
  addContract,
  removeContract,
  hasContract,
  forEachContract,
  getContracts,
  getLastCheckedContractIndex,
  setLastCheckedContractIndex,
}

initialize()
