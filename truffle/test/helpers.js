const assert = require('chai').assert
const BigNumber = require('bignumber.js')

const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

const encryption = require('../utils/encryption')
const {unpackEllipticParts} = require('../utils/pack')
const {trim0x, ensure0x} = require('../utils/prefix')
const {bobPrivateKey, bobPublicKey, keeperPrivateKeys, keeperPublicKeys,
        numKeepersToRecover} = require('../utils/samples')

async function assertTxFails(txResultPromise) {
  const txProps = await inspectTransaction(txResultPromise)
  if (txProps.success) {
    assert(false, 'transaction was expected to fail but succeeded')
  }
  return txProps
}


async function assertTxSucceeds(txResultPromise) {
  const txProps = await inspectTransaction(txResultPromise)
  if (!txProps.success) {
    assert(false, 'transaction was expected to succeed but failed')
  }
  return txProps
}


async function inspectTransaction(txResultPromise) {
  const txResult = await txResultPromise
  const tx = await web3.eth.getTransaction(txResult.tx)
  const {receipt} = txResult
  const success = receipt.status !== undefined
    ? receipt.status === '0x1' || receipt.status === 1 // Since Byzantium fork
    : receipt.cumulativeGasUsed < tx.gas // Before Byzantium fork (current version of TestRPC)
  const txPriceWei = new BigNumber(tx.gasPrice).times(receipt.cumulativeGasUsed)
  return {tx, receipt, success, txPriceWei}
}


// Works only with TestRPC provider.
//
function increaseTimeSec(addSeconds) {
  return new Promise((resolve, reject) => web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [addSeconds],
      id: 0
    },
    (err, result) => err ? reject(err) : resolve(result))
  )
}

async function getAccountBalance(account) {
  return new BigNumber(await web3.eth.getBalance(account))
}

async function prepareLegacyData(legacyString, selectedKeeperIndices, aesCounter) {
  return await encryption.encryptData(
    ensure0x(new Buffer(legacyString).toString('hex')),
    bobPublicKey,
    keeperPublicKeys.filter((_, index) => selectedKeeperIndices.indexOf(index) != -1),
    numKeepersToRecover,
    aesCounter
  )
}

async function decryptLegacy(encryptedData, dataHash, suppliedKeyParts, aesCounter) {
  const decrypted = await encryption.decryptData(
    encryptedData,
    dataHash,
    bobPrivateKey,
    suppliedKeyParts,
    aesCounter
    )
  return Buffer.from(trim0x(decrypted), 'hex').toString('utf8')
}

async function decryptKeyPart(encryptedKeyParts, keeperSubmitedPartIndex, keeperIndex) {
  const keyParts = unpackEllipticParts(trim0x(encryptedKeyParts), 2)
  return await encryption.ecDecrypt(
      keyParts[keeperSubmitedPartIndex],
      keeperPrivateKeys[keeperIndex]
    )
}


module.exports = {
  web3,
  assertTxFails,
  assertTxSucceeds,
  inspectTransaction,
  increaseTimeSec,
  getAccountBalance,
  prepareLegacyData,
  decryptKeyPart,
  decryptLegacy,
}
