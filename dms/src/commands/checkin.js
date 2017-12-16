import yn from 'yn'
import moment from 'moment'

import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import unlockAccount from '../utils/unlock-account'
import {formatWei} from '../utils/format'
import tx from '../utils/tx'

const GAS_HARD_LIMIT = 4700000

export const description = 'Owner checkin'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 checkin -c 0xf455c170ea2c42e0510a3e50625775efec89962e', 'Owner checkin')
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

  // TODO: check that account is contract owner
  console.error(`You're identified as a contract owner.`)

  // TODO: check contract state

  const [lastOwnerCheckInAt, checkInInterval, checkInPrice] = [
    await instance.lastOwnerCheckInAt(),
    await instance.checkInInterval(),
    await instance.calculateApproximateCheckInPrice(),
  ]

  const nextCheckInDueDate = moment.unix(lastOwnerCheckInAt.toNumber() + checkInInterval.toNumber())

  const isCheckInOnTime = moment().isSameOrBefore(nextCheckInDueDate)
  if (!isCheckInOnTime) {
    console.error(`Sorry, you have missed checkin due date`)
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

  console.error(`Sending keepers fees...`)
  console.error(`Done.`)
  console.error(`See you next time!`)
  const nextCheckUnixTime = Math.ceil(Date.now() / 1000) + checkInInterval.toNumber()
  console.error(`Next checkin: ${moment.unix(nextCheckUnixTime)}`)
}
