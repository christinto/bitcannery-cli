export const command = 'cancel [contract]'

export const desc = 'Cancel legacy contract'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address',
    default: null,
  })

// Implementation

import BigNumber from 'bignumber.js'
import moment from 'moment'
import ora from 'ora'

import getContractInstance from '../utils/get-contract-instance'
import {printWelcomeAndUnlockAccount} from '../contract-utils/common'
import {formatWei} from '../utils/format'
import {States} from '../utils/contract-api'
import {contractTx} from '../utils/tx'
import {print, ynQuestion} from '../utils/print'
import {getBalance} from '../utils/web3'
import runCommand from '../utils/run-command'
import {selectContract} from '../utils/select-contract'
import toNumber from '../utils/to-number'

export function handler(argv) {
  return runCommand(() => cancel(argv.contract))
}

export async function cancel(contractAddressOrID) {
  const address = await printWelcomeAndUnlockAccount()

  if (contractAddressOrID === null) {
    contractAddressOrID = await selectContract('Please select a contract to cancel:')

    if (contractAddressOrID === undefined) {
      print(
        `You have no contracts yet. If you know that you're the owner of a contract, ` +
          `pass its name as the argument to this command:\n\n  dms cancel contract_name\n`,
      )
      return
    }

    if (contractAddressOrID === null) {
      return
    }
  }

  const spinner = ora('Reading contract...').start()
  const instance = await getContractInstance(contractAddressOrID)

  const [owner, state, lastOwnerCheckInAt, checkInIntervalInSec] = await Promise.all([
    instance.owner(),
    toNumber(instance.state()),
    toNumber(instance.lastOwnerCheckInAt()),
    toNumber(instance.checkInInterval()),
  ])

  if (owner !== address) {
    spinner.fail(`Only owner can cancel the contract.`)
    return
  }

  let checkInMissed = state === States.CallForKeys

  if (state === States.Active) {
    const checkInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)
    checkInMissed = !moment().isSameOrBefore(checkInDueDate)
  }

  if (checkInMissed) {
    spinner.fail(`You have missed check-in due date.`)
    console.error(`\nCancelling contract isn't possible. Bob can now decrypt the legacy.`)
    return
  }

  if (state !== States.Active && state !== States.CallForKeepers) {
    spinner.fail(`Owner can only cancel a contract in Active or CallForKeepers state.`)
    print(`\nCurrent contract state: ${States.stringify(state)}.`)
    return
  }

  spinner.succeed(`You've been identified as the contract owner.`)
  spinner.start(`Calculating transaction fee...`)

  const cancelPrice =
    state === States.Active ? await instance.calculateApproximateCheckInPrice() : new BigNumber(0)

  const txResult = await contractTx(instance, 'cancel', {
    from: address,
    value: cancelPrice,
    approveFee: async (gas, gasPrice) => {
      const checkInDuration = moment
        .duration(checkInIntervalInSec, 's')
        .humanize()
        .replace(/^a /, '')

      const txFee = gas.times(gasPrice)
      const combinedFee = txFee.plus(cancelPrice)

      const actualBalance = await getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        spinner.fail(`Cannot cancel the contract due to insufficient balance.`)
        print(
          `\nCancelling will cost you ${formatWei(combinedFee)},\n` +
            `and you've got only ${formatWei(actualBalance)}.\n` +
            `Please, add ${formatWei(difference.abs())} to your account and try again.`,
        )
        return false
      }

      spinner.succeed()

      const proceedQuestion = cancelPrice.isZero()
        ? `\nCancelling contract will cost you ${formatWei(combinedFee)} (transaction fee).\n` +
          `Proceed?`
        : `\nCancelling contract will cost you ${formatWei(combinedFee)}:\n` +
          `  keeping fee: ${formatWei(cancelPrice)},\n` +
          `  transaction fee: ${formatWei(txFee)}.\n\n` +
          `Proceed?`

      const proceed = await ynQuestion(proceedQuestion)
      if (proceed) {
        console.log()
        spinner.start(`Cancelling contract...`)
      }

      return proceed
    },
  })

  if (txResult) {
    spinner.succeed(`Cancel successful! Transaction hash: ${txResult.txHash}`)
    print(`\nPaid for transaction: ${formatWei(txResult.txPriceWei)}\nSee you next time!`)
  } else {
    print(`\nSee you next time!`)
  }
}
