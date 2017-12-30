export const command = 'checkin <contract>'

export const desc = 'Perform owner check-in'

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
  return runCommand(() => checkIn(argv.contract))
}

export async function checkIn(contractAddressOrID) {
  const address = await unlockAccount()

  print(`Current account address: ${address}`)

  const instance = await getContractInstance(contractAddressOrID)
  const [state, owner] = [(await instance.state()).toNumber(), await instance.owner()]

  if (owner !== address) {
    console.error(`Only contract owner can perform check-in`)
    return
  }

  console.error(`You've been identified as the contract owner.`)

  if (state !== States.Active) {
    console.error(`Owner can perform check-in only for a contract in Active state`)
    return
  }

  const [lastOwnerCheckInAt, checkInIntervalInSec, checkInPrice] = [
    (await instance.lastOwnerCheckInAt()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    await instance.calculateApproximateCheckInPrice(),
  ]

  const checkInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)
  const isCheckInOnTime = moment().isSameOrBefore(checkInDueDate)

  if (!isCheckInOnTime) {
    console.error(`Sorry, you have missed check-in due date.`)
    console.error(`Bob now can decrypt the legacy.`)
    return
  }

  // TODO: check owner account balance

  const txResult = await contractTx(instance, 'ownerCheckIn', {
    from: address,
    value: checkInPrice,
    approveFee: (gas, gasPrice) => {
      const checkInDuration = moment
        .duration(checkInIntervalInSec, 's')
        .humanize()
        .replace(/^a /, '')
      const txFee = gas.times(gasPrice)
      const combinedFee = txFee.plus(checkInPrice)

      const actualBalance = getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        print(`\nCouldn't check in due to low balance.\n`+
          `  Check in will cost you ${formatWei(combinedFee)}\n`+
          `  and you've got only ${formatWei(actualBalance)}.\n`+
          `  Please, add ${formatWei(difference.abs())} to your account and try again.`)
        return false
      }

      const proceed = ynQuestion(
        `\nCheck-in will cost you ${formatWei(combinedFee)}:\n` +
          `  keeping fee for the next ${checkInDuration}: ${formatWei(checkInPrice)},\n` +
          `  transaction cost: ${formatWei(txFee)}.\n\n` +
          `Proceed?`,
      )
      if (proceed) {
        print(`Checking in...`)
      }
      return proceed
    },
  })

  if (txResult) {
    console.error(`Done! Transaction hash: ${txResult.txHash}`)
    console.error(`Paid for transaction: ${formatWei(txResult.txPriceWei)}`)
  }

  console.error(`\nSee you next time!`)
  console.error(
    'The next check-in:',
    moment()
      .add(checkInIntervalInSec, 's')
      .fromNow(),
  )
}
