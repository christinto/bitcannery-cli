import getWeb3 from './get-web3'
import BigNumber from 'bignumber.js'

async function inspectTransaction(txResultPromise) {
  const web3 = getWeb3()
  const txResult = await txResultPromise
  const tx = await web3.eth.getTransaction(txResult.tx)
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

export default async function tx(txResultPromise) {
  const txProps = await inspectTransaction(txResultPromise)
  if (!txProps.success) {
    throw Error('transaction failed')
  }
  return txProps
}
