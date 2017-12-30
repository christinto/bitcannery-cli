export const command = 'cancel <contract>'

export const desc = 'Cancel legacy contract'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address'
  })

// Implementation

import moment from 'moment'

import getContractInstance from '../utils/get-contract-instance'
import unlockAccount from '../utils/unlock-account'
import {formatWei} from '../utils/format'
import {States} from '../utils/contract-api'
import {contractTx} from '../utils/tx'
import {print, ynQuestion} from '../utils/print'
import {getBalance} from '../utils/web3'
import runCommand from '../utils/run-command'

export function handler(argv) {
  return runCommand(() => cancel(argv.contract))
}

export async function cancel(contractAddressOrID) {
  const address = await unlockAccount()

  print(`Current account address: ${address}`)

  const instance = await getContractInstance(contractAddressOrID)
  const [state, owner] = [(await instance.state()).toNumber(), await instance.owner()]

  if (owner !== address) {
    console.error(`Only owner can cancel the contract`)
    return
  }

  console.error(`You've been identified as the contract owner.`)

  if (state !== States.Active && state !== States.CallForKeepers) {
    console.error(`Owner can cancel only for a contract in Active or CallForKeepers state`)
    return
  }

  const [lastOwnerCheckInAt, checkInIntervalInSec, checkInPrice] = [
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

      const actualBalance = getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        print(`\nCouldn't cancel contract due to low balance.\n`+
          `  Cancelling will cost you ${formatWei(combinedFee)}\n`+
          `  and you've got only ${formatWei(actualBalance)}.\n`+
          `  Please, add ${formatWei(difference.abs())} to your account and try again.`)
        return false
      }

      const proceed = ynQuestion(
        `\nCancelling contract will cost you ${formatWei(combinedFee)}:\n` +
          `  transaction cost: ${formatWei(txFee)}.\n\n` +
          `Proceed?`,
      )
      if (proceed) {
        print(`Cancelling contract`)
      }
      return proceed
    },
  })

  if (txResult) {
    console.error(`Done! Transaction hash: ${txResult.txHash}`)
    console.error(`Paid for transaction: ${formatWei(txResult.txPriceWei)}`)
  }

  console.error(`\nSee you next time!`)
}
