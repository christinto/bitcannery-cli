import yn from 'yn'
import moment from 'moment'

import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import unlockAccount from '../utils/unlock-account'
import {formatWei} from '../utils/format'
import {States} from '../utils/contract-api'
import tx from '../utils/tx'

const GAS_HARD_LIMIT = 4700000

export const description = 'Owner check-in'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 checkin -c 0xf455c170ea2c42e0510a3e50625775efec89962e', 'Owner check-in')
    .alias('c', 'contract')
    .nargs('c', 1)
    .describe('c', 'Specify the legacy contract')
    .demandOption(['c'])
}

export async function handler(argv) {
  const address = await unlockAccount()
  // TODO: display current accaunt

  const LegacyContract = await getContractClass()
  const instance = await LegacyContract.at(argv.contract)

  const [state, owner] = [(await instance.state()).toNumber(), await instance.owner()]

  if (owner !== address) {
    console.error(`Only contract owner can perform check-in`)
    return
  }

  console.error(`You're identified as a contract owner.`)

  if (state !== States.Active) {
    console.error(`Owner can perform check-in only for a contract in Active state`)
    return
  }

  const [lastOwnerCheckInAt, checkInIntervalInSec, checkInPrice] = [
    (await instance.lastOwnerCheckInAt()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    await instance.calculateApproximateCheckInPrice(),
  ]

  const nextCheckInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)

  const isCheckInOnTime = moment().isSameOrBefore(nextCheckInDueDate)
  if (!isCheckInOnTime) {
    console.error(`Sorry, you have missed check-in due date`)
    console.error(`Bob now can decrypt the legacy`)
    return
  }

  const fromNowToCheckin = moment().to(nextCheckInDueDate, true)
  const readyToPayForCheckIn = readlineSync.question(
    `Send keeeping fees for the next ${fromNowToCheckin} (${formatWei(checkInPrice)}) [Y/n]? `,
  )
  if (!yn(readyToPayForCheckIn)) {
    return
  }

  // TODO: check owner accaunt balance

  const {txHash, txPriceWei} = await tx(
    instance.ownerCheckIn({
      from: address,
      gas: GAS_HARD_LIMIT, // TODO: estimate gas usage
      value: checkInPrice,
    }),
  )

  console.error(`Done! Transaction hash: ${txHash}`)
  console.error(`Paid for transaction: ${formatWei(txPriceWei)}\n`)
  console.error(`See you next time!`)
  console.error(
    'The next check-in:',
    moment()
      .add(checkInIntervalInSec, 's')
      .fromNow(),
  )
}
