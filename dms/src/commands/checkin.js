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

import getContractInstance from '../utils/get-contract-instance'
import {printWelcomeAndUnlockAccount} from '../contract-utils/common'
import {formatWei} from '../utils/format'
import {States, getActiveKeeperAddresses, getActiveKeepers} from '../utils/contract-api'
import {contractTx} from '../utils/tx'
import {print, ynQuestion} from '../utils/print'
import {getBalance} from '../utils/web3'
import runCommand from '../utils/run-command'
import {selectContract} from '../utils/select-contract'

export function handler(argv) {
  return runCommand(() => checkIn(argv.contract))
}

export async function checkIn(contractAddressOrID) {
  const address = await printWelcomeAndUnlockAccount()

  if (contractAddressOrID === null) {
    console.error('Please select a contract to check-in:')
    contractAddressOrID = await selectContract()
  }

  const instance = await getContractInstance(contractAddressOrID)
  const [state, owner] = [(await instance.state()).toNumber(), await instance.owner()]

  if (owner !== address) {
    console.error(`Only contract owner can perform check-in`)
    return
  }

  console.error(`You've been identified as the contract owner.`)

  if (state !== States.Active) {
    console.error(`Owner can perform check-in only for a contract in Active state.`)
    console.error(`Check-in Failed.`)
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
    console.error(`Check-in Failed.`)
    return
  }

  // TODO: check owner account balance

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
        print(
          `\nCouldn't check in due to low balance.\n` +
            `  Check in will cost you ${formatWei(combinedFee)}\n` +
            `  and you've got only ${formatWei(actualBalance)}.\n` +
            `  Please, add ${formatWei(difference.abs())} to your account and try again.`,
        )
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

  const activeKeeperAddresses = await getActiveKeeperAddresses(instance)
  const activeKeeper = await getActiveKeepers(instance, activeKeeperAddresses)
  const keeperReliabilityThreshold = Math.floor(Date.now() / 1000) - checkInIntervalInSec
  const reliableKeepers = activeKeeper.filter(k => k.lastCheckInAt > keeperReliabilityThreshold)
  print(`\nTotal keepers number: ${activeKeeper.length}`)
  print(`Reliable keepers number: ${reliableKeepers.length}`)

  const keeperNumberThreshold = Math.ceil(activeKeeper.length * 2 / 3)

  if (reliableKeepers.length < keeperNumberThreshold) {
    print(
      `\nThe number of keeper fell below the critical limit.` +
        ` To successfully decrypt the contract, you need at least ${keeperNumberThreshold} keepers.` +
        ` You must perform keeper rotation procedure!\n`,
    )
  }
}
