// WARN: code in this file is dependent on layout of data structures in CryptoLegacy.sol
// contract, so these two files need to be kept in sync.

const BigNumber = require('bignumber.js')


const States = {
  CallForKeepers: 0,
  Active: 1,
  CallForKeys: 2,
  Cancelled: 3,
}


function assembleKeeperStruct(rawStruct) {
  return {
    publicKey: rawStruct[0],
    keyPartHash: rawStruct[1],
    lastCheckInAt: rawStruct[2].toNumber(),
    balance: new BigNumber('' + rawStruct[3]),
    keyPartSupplied: rawStruct[4],
  }
}


function assembleProposalStruct(rawStruct) {
  return {
    keeperAddress: rawStruct[0],
    publicKey: rawStruct[1],
  }
}


function assembleEncryptedDataStruct(rawStruct) {
  return {
    encryptedData: rawStruct[0],
    aesCounter: rawStruct[1].toNumber(),
    dataHash: rawStruct[2],
    encryptedKeyParts: rawStruct[3],
    // suppliedKeyParts: rawStruct[4],
    // encoding bytes[] is not supported by current version of Solidity
  }
}


async function getActiveKeeperAddresses(contract) {
  const numKeepers = (await contract.getNumKeepers()).toNumber()
  const promises = Array(numKeepers).fill(0).map((_, i) => contract.activeKeepersAddresses(i))
  return await Promise.all(promises)
}


async function getActiveKeepers(keeperAddresses) {
  const rawStructs = await Promise.all(keeperAddresses.map(addr => contract.activeKeepers(addr)))
  return rawStructs.map(assembleKeeperStruct)
}


module.exports = {
  States,
  assembleKeeperStruct,
  assembleProposalStruct,
  assembleEncryptedDataStruct,
  getActiveKeeperAddresses,
  getActiveKeepers,
}
