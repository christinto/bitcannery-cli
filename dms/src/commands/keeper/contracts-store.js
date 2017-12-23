let contracts = []
let addresses = {}
let lastCheckedContractIndex

function addContract(address) {
  if (hasContract(address)) {
    return
  }
  contracts.push(address)
  addresses[address] = true
  console.error(`Added contract ${address} to list`)
}

function removeContract(address) {
  const index = contracts.indexOf(address)
  if (index >= 0) {
    contracts.splice(index, 1)
    addresses[address] = false
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
