export const command = 'checkin [contract]'

export const desc = 'Perform owner check-in'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address',
    default: null,
  })

// Implementation

import moment from 'moment'
import ora from 'ora'

import getContractInstance from '../utils/get-contract-instance'
import {printWelcomeAndUnlockAccount} from '../contract-utils/common'
import {formatWei} from '../utils/format'
import {States, getActiveKeeperAddresses, getActiveKeepers} from '../utils/contract-api'
import {contractTx} from '../utils/tx'
import {print, ynQuestion} from '../utils/print'
import {getBalance} from '../utils/web3'
import runCommand from '../utils/run-command'
import {selectContract} from '../utils/select-contract'
import toNumber from '../utils/to-number'

export function handler(argv) {
  return runCommand(() => checkIn(argv.contract))
}

export async function checkIn(contractAddressOrID) {
  const address = await printWelcomeAndUnlockAccount()

  if (contractAddressOrID === null) {
    contractAddressOrID = await selectContract('Please select a contract to check in:')

    if (contractAddressOrID === undefined) {
      print(
        `You have no contracts yet. If you know that you're the owner of a contract, ` +
          `pass its name as the argument to this command:\n\n  dms checkin contract_name\n`,
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
    toNumber(instance.checkInInterval()),,
  ])

  if (owner !== address) {
    spinner.fail(`Only contract owner can perform check-in.`)
    return
  }

  let checkInMissed = state === States.CallForKeys

  if (state === States.Active) {
    const checkInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)
    checkInMissed = !moment().isSameOrBefore(checkInDueDate)
  }

  if (checkInMissed) {
    spinner.fail(`You have missed check-in due date. Bob can now decrypt the legacy.`)
    return
  }

  if (state !== States.Active) {
    spinner.fail(`Owner can perform check-in only for a contract in Active state.`)
    print(`\nCurrent contract state: ${States.stringify(state)}.`)
    return
  }

  const checkInPrice = await instance.calculateApproximateCheckInPrice()

  spinner.succeed(`You've been identified as the contract owner.`)
  spinner.start(`Calculating check-in price...`)

  const txResult = await contractTx(instance, 'ownerCheckIn', {
    from: address,
    value: checkInPrice,
    approveFee: async (gas, gasPrice) => {
      const checkInDuration = moment
        .duration(checkInIntervalInSec, 's')
        .humanize()
        .replace(/^a /, '')
      const txFee = gas.times(gasPrice)
      const combinedFee = txFee.plus(checkInPrice)

      const actualBalance = await getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        spinner.fail(`Cannot check in due to insufficient balance.`)
        print(
          `\nCheck in will cost you ${formatWei(combinedFee)},\n` +
            `and you've got only ${formatWei(actualBalance)}.\n` +
            `Please add ${formatWei(difference.abs())} to your account and try again.`,
        )
        return false
      }

      spinner.succeed()

      const proceed = await ynQuestion(
        `\nCheck-in will cost you ${formatWei(combinedFee)}:\n` +
          `  keeping fee for the next ${checkInDuration}: ${formatWei(checkInPrice)},\n` +
          `  transaction fee: ${formatWei(txFee)}.\n\n` +
          `Proceed?`,
      )

      if (proceed) {
        console.log()
        spinner.start(`Checking in...`)
      }

      return proceed
    },
  })

  if (txResult) {
    spinner.succeed(`Check-in successful! Transaction hash: ${txResult.txHash}`)
    console.error(`\nPaid for transaction: ${formatWei(txResult.txPriceWei)}`)
  }

  console.log()
  spinner.start(`Checking keepers' reliability...`)

  const activeKeeperAddresses = await getActiveKeeperAddresses(instance)
  const activeKeepers = await getActiveKeepers(instance, activeKeeperAddresses)

  const keeperReliabilityThreshold = Math.floor(Date.now() / 1000) - checkInIntervalInSec
  const reliableKeepers = activeKeepers.filter(k => k.lastCheckInAt > keeperReliabilityThreshold)

  spinner.succeed()

  print(
    `\nTotal keepers number: ${activeKeepers.length}\n` +
      `Reliable keepers number: ${reliableKeepers.length}`,
  )

  print(
    `\nSee you next time!\nThe next check-in: ` +
      moment()
        .add(checkInIntervalInSec, 's')
        .fromNow(),
  )

  const keeperNumberThreshold = Math.ceil(activeKeepers.length * 2 / 3)

  if (reliableKeepers.length < keeperNumberThreshold) {
    print(
      `\nThe number of keeper fell below the critical limit.` +
        ` To successfully decrypt the contract, you need at least ${keeperNumberThreshold} keepers.` +
        ` You must perform keeper rotation procedure!`,
    )
  }
}
