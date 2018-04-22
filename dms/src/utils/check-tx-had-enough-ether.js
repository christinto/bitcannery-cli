import UserError from './user-error'

export default async function checkTxHadEnoughEther(txPromise) {
  try {
    const txResult = await txPromise
    return txResult
  } catch (err) {
    if (/insufficient funds/i.test(err.message)) {
      throw new UserError('Insufficient funds to pay for transaction')
    } else {
      throw err
    }
  }
}
