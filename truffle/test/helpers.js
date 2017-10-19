const assert = require('chai').assert
const BigNumber = require('bignumber.js')

const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))


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


module.exports = {
  web3,
  assertTxFails,
  assertTxSucceeds,
  inspectTransaction,
  increaseTimeSec,
  getAccountBalance,
}
