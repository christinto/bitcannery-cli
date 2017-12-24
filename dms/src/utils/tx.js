import {getTransaction, getLatestBlock, getGasPrice as _getGasPrice} from './web3'
import BigNumber from 'bignumber.js'

import throttle from './throttle'
import once from './call-once'
import UserError from './user-error'

async function inspectTransaction(txResultPromise) {
  const txResult = await txResultPromise
  const tx = await getTransaction(txResult.tx)
  const {receipt} = txResult
  const success =
    receipt.status !== undefined
      ? receipt.status === '0x1' || receipt.status === 1 // Since Byzantium fork
      : receipt.gasUsed < tx.gas // Before Byzantium fork (current version of TestRPC)
  const txPriceWei = new BigNumber(tx.gasPrice).times(receipt.gasUsed)
  const events = txResult.logs
    .map(log => (log.event ? {name: log.event, args: log.args} : null))
    .filter(x => !!x)
  return {result: txResult, txHash: txResult.tx, success, txPriceWei, events}
}

export default tx

async function tx(txResultPromise) {
  const txProps = await inspectTransaction(txResultPromise)
  if (!txProps.success) {
    throw new UserError('transaction failed')
  }
  return txProps
}

export const getBlockGasLimit = once(() =>
  getLatestBlock().then(b => {
    return BigNumber.min(4700000, new BigNumber(b.gasLimit))
  }),
)

export const getGasPrice = throttle(60 * 1000, () => _getGasPrice().then(p => new BigNumber(p)))

export async function contractTx(contract, methodName, ...args) {
  const opts = extractOptsArg(args)
  const [blockGasLimit, gasPrice] = [await getBlockGasLimit(), await getGasPrice()]

  const method = contract[methodName]

  const gasEstimation = await estimateGas(method, args, {
    from: opts.from,
    value: opts.value,
    gas: blockGasLimit,
  })

  if (opts.approveFee && !await opts.approveFee(gasEstimation, gasPrice)) {
    return null
  }

  const gasLimit = BigNumber.min(new BigNumber(gasEstimation).plus(100000), blockGasLimit)

  const txPromise = method(...args, {
    from: opts.from,
    value: opts.value,
    gasPrice: gasPrice,
    gas: gasLimit,
  })

  return tx(txPromise)
}

function extractOptsArg(args) {
  if (args.length == 0) {
    return {}
  }
  const lastArg = args[args.length - 1]
  if (typeof lastArg === 'object' && lastArg.constructor === Object) {
    return args.pop()
  }
  return {}
}

async function estimateGas(method, args, opts) {
  try {
    const gas = await method.estimateGas(...args, opts)
    return new BigNumber(gas)
  } catch (err) {
    throw new UserError(`transaction failed`, err)
  }
}
