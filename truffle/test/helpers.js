const assert = require('chai').assert

const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))


async function assertTxFails(txResultPromise) {
  const txResult = await txResultPromise
  const succeeded = await checkTransactionSuccessful(txResult)
  if (succeeded) {
    assert(false, 'transaction was expected to fail but succeeded')
  }
}


async function assertTxSucceeds(txResultPromise) {
  const txResult = await txResultPromise
  const succeeded = await checkTransactionSuccessful(txResult)
  if (!succeeded) {
    assert(false, 'transaction was expected to succeed but failed')
  }
}


async function checkTransactionSuccessful(txResult) {
  const {receipt} = txResult
  if (receipt.status !== undefined) {
    // Since Byzantium fork
    return receipt.status === '0x1' || receipt.status === 1
  }
  // Before Byzantium fork (current version of TestRPC)
  const tx = await web3.eth.getTransaction(txResult.tx)
  return receipt.cumulativeGasUsed < tx.gas
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


module.exports = {
  web3,
  assertTxFails,
  assertTxSucceeds,
  checkTransactionSuccessful,
  increaseTimeSec
}
