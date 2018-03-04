// WARN: code in this file is dependent on layout of data structures in CryptoLegacy.sol
// contract, so these two files need to be kept in sync.
import BigNumber from 'bignumber.js'
import UserError from './user-error'
import getContractAPIs from './get-contract-apis'

export const States = {
  CallForKeepers: 0,
  Active: 1,
  CallForKeys: 2,
  Cancelled: 3,
}

States.stringify = stateToString

export function stateToString(number) {
  return ['CallForKeepers', 'Active', 'CallForKeys', 'Cancelled'][+number]
}

export function assembleKeeperStruct(rawStruct) {
  return {
    publicKey: rawStruct[0],
    keyPartHash: rawStruct[1],
    keepingFee: rawStruct[2],
    balance: new BigNumber('' + rawStruct[3]),
    lastCheckInAt: rawStruct[4].toNumber(),
    keyPartSupplied: rawStruct[5],
  }
}

export function assembleProposalStruct(rawStruct) {
  return {
    keeperAddress: rawStruct[0],
    publicKey: rawStruct[1],
    keepingFee: rawStruct[2],
  }
}

export function assembleEncryptedDataStruct(rawStruct) {
  return {
    encryptedData: rawStruct[0],
    aesCounter: rawStruct[1],
    dataHash: rawStruct[2],
    shareLength: rawStruct[3].toNumber(),
    // suppliedKeyParts: rawStruct[4],
    // encoding bytes[] is not supported by current version of Solidity
  }
}

export async function getActiveKeeperAddresses(contract) {
  const numKeepers = (await contract.getNumKeepers()).toNumber()
  const promises = Array(numKeepers)
    .fill(0)
    .map((_, i) => contract.activeKeepersAddresses(i))
  return Promise.all(promises)
}

export async function getActiveKeepers(contract, keeperAddresses) {
  const rawStructs = await Promise.all(keeperAddresses.map(addr => contract.activeKeepers(addr)))
  return rawStructs.map(assembleKeeperStruct)
}

export async function fetchKeeperProposals(contract) {
  const numProposals = await contract.getNumProposals()
  const promises = new Array(+numProposals).fill(0).map((_, i) => contract.keeperProposals(i))
  return (await Promise.all(promises)).map(rawProposal => assembleProposalStruct(rawProposal))
}

export async function fetchEncryptedKeyPartsChunks(contract) {
  const numChunks = await contract.getNumEncryptedKeyPartsChunks()
  const promises = new Array(+numChunks)
    .fill(0)
    .map((_, i) => contract.getEncryptedKeyPartsChunk(i))
  return await Promise.all(promises)
}

export async function fetchOwnerContracts(registryContract, ownerAddress) {
  const numContracts = await registryContract.getNumContractsByOwner(ownerAddress)
  const promises = new Array(+numContracts)
    .fill(0)
    .map((_, i) => registryContract.getContractByOwner(ownerAddress, i))
  return (await Promise.all(promises)).map(rawContract => rawContract.toString())
}

export async function fetchContractChain(contractId) {
  const {LegacyContract, registry} = await getContractAPIs()
  let address, contract

  address = await registry.getContractInitialAddress(contractId)

  if (new BigNumber(address).isZero()) {
    throw new UserError(`there is no contract with id "${contractId}"`)
  }

  const chain = []
  while (!new BigNumber(address).isZero()) {
    contract = await LegacyContract.at(address).then(x => x)
    chain.push(contract)
    address = await contract.getContinuationContractAddress()
  }

  return chain
}
