// WARN: code in this file is dependent on layout of data structures in CryptoLegacy.sol
// contract, so these two files need to be kept in sync.


exports.States = {
  CallForKeepers: 0,
  Active: 1,
  CallForKeys: 2,
  Cancelled: 3,
}


exports.assembleKeeperStruct = function assembleKeeperStruct(rawStruct) {
  return {
    publicKey: rawStruct[0],
    keyPartHash: rawStruct[1],
    lastCheckInAt: rawStruct[2].toNumber(),
    balance: rawStruct[3].toNumber(),
    keyPartSupplied: rawStruct[4],
  }
}


exports.assembleProposalStruct = function assembleProposalStruct(rawStruct) {
  return {
    keeperAddress: rawStruct[0],
    publicKey: rawStruct[1],
  }
}
