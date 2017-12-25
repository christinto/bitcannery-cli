import yn from 'yn'
import moment from 'moment'
import readlineSync from 'readline-sync'

import getContractInstance from '../utils/get-contract-instance'
import unlockAccount from '../utils/unlock-account'
import {formatWei} from '../utils/format'
import {States} from '../utils/contract-api'
import tx from '../utils/tx'
import runCommand from '../utils/run-command'
import {getGasPrice} from '../utils/web3'

const GAS_HARD_LIMIT = 4700000

export const description = 'Owner check-in'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 checkin -c contract_id', 'Owner check-in')
    .alias('c', 'contract')
    .nargs('c', 1)
    .describe('c', 'ID or address of a contract')
    .demandOption(['c'])
}

export function handler(argv) {
  return runCommand(() => checkIn(argv.contract))
}

export async function checkIn(contractAddressOrID) {
  const address = await unlockAccount()
  // TODO: display current account

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

  const checkInDuration = moment.duration(checkInIntervalInSec, 's').humanize().replace(/^a /, '')

  const readyToPayForCheckIn = readlineSync.question(
    `Send keeeping fees for the next ${checkInDuration} (${formatWei(checkInPrice)})? [Y/n] `
  )

  if (!yn(readyToPayForCheckIn)) {
    return
  }

  // TODO: check owner account balance

  const gasPrice = await getGasPrice()

  const {txHash, txPriceWei} = await tx(
    instance.ownerCheckIn({
      from: address,
      gas: GAS_HARD_LIMIT,
      gasPrice: gasPrice,
      value: checkInPrice,
    })
  )

  console.error(`Done! Transaction hash: ${txHash}`)
  console.error(`Paid for transaction: ${formatWei(txPriceWei)}\n`)
  console.error(`See you next time!`)
  console.error('The next check-in:', moment().add(checkInIntervalInSec, 's').fromNow())
}
