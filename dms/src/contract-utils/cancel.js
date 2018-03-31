import ora from 'ora'
import inquirer from 'inquirer'
import moment from 'moment'

import {contractTx} from '../utils/tx'
import {getBalance} from '../utils/web3'
import {formatWei} from '../utils/format'
import print from '../utils/print'
import {States} from '../utils/contract-api'

export async function cancelContract(instance, address) {
  print('')

  const cancelSpinner = ora('Cancelling previous contract...').start()

  const [state, lastOwnerCheckInAt, checkInIntervalInSec, checkInPrice] = [
    (await instance.state()).toNumber(),
    (await instance.lastOwnerCheckInAt()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    await instance.calculateApproximateCheckInPrice(),
  ]

  if (state === States.Active) {
    const checkInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)
    const isCheckInOnTime = moment().isSameOrBefore(checkInDueDate)

    if (!isCheckInOnTime) {
      console.error(`Sorry, you have missed check-in due date. Cancelling contract isn't possible`)
      console.error(`Bob now can decrypt the legacy.`)
      return
    }
  }

  const cancelPrice = state === States.Active ? checkInPrice : 0

  const txResult = await contractTx(instance, 'cancel', {
    from: address,
    value: cancelPrice,
    approveFee: (gas, gasPrice) => {
      const checkInDuration = moment
        .duration(checkInIntervalInSec, 's')
        .humanize()
        .replace(/^a /, '')
      const txFee = gas.times(gasPrice)
      const combinedFee = txFee.plus(cancelPrice)

      const actualBalance = await getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        print(
          `\nCouldn't cancel contract due to low balance.\n` +
            `  Cancelling will cost you ${formatWei(combinedFee)}\n` +
            `  and you've got only ${formatWei(actualBalance)}.\n` +
            `  Please, add ${formatWei(difference.abs())} to your account and try again.`,
        )
        return false
      }

      return true
    },
  })

  cancelSpinner.succeed(`Previous contract has been canceled`)

  print('')

  if (txResult) {
    print(`Done! Transaction hash: ${txResult.txHash}`)
    print(`Paid for transaction: ${formatWei(txResult.txPriceWei)}`)
  }

  print('')
}
