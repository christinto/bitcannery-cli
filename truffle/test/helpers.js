const assert = require('chai').assert

const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))


async function assertTxFails(txResultPromise) {
  const txResult = await txResultPromise
  printEvents(txResult)
  const succeeded = await checkTransactionSuccessful(txResult)
  if (succeeded) {
    assert(false, 'transaction was expected to fail but succeeded')
  }
}


async function assertTxSucceeds(txResultPromise) {
  const txResult = await txResultPromise
  printEvents(txResult)
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
  console.info(`tx ${tx.hash}, from ${tx.from}`)
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

async function getAccountBalance(account) {
  const balance = await web3.eth.getBalance(account)
  return web3.utils.fromWei(balance)
}


function printEvents(txResult) {
  console.info('Events:', txResult.logs
    .map(log => {
      if (!log.event) return null
      const argsDesc = Object.keys(log.args)
        .map(argName => `${argName}: ${log.args[argName]}`)
        .join(', ')
      return `${log.event}(${argsDesc})`
    })
    .filter(x => !!x)
  )
}


module.exports = {
  web3,
  assertTxFails,
  assertTxSucceeds,
  checkTransactionSuccessful,
  increaseTimeSec,
  getAccountBalance,
}
