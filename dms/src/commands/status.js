import moment from 'moment'
import getWeb3 from '../utils/get-web3'
import getContractClass from '../utils/get-contract-class'
import {States, stateToString} from '../utils/contract-api'
import {formatWei} from '../utils/format'

export const description = 'Display the status of given legacy contract'

export function yargsBuilder(yargs) {
  return yargs
    .example(
      '$0 status -c 0xf455c170ea2c42e0510a3e50625775efec89962e',
      'Display the status of given legacy contract',
    )
    .alias('c', 'contract')
    .nargs('c', 1)
    .describe('c', 'Specify the legacy contract')
    .demandOption(['c'])
}

export async function handler(argv) {
  // TODO: ensure json rpc running and there is legacy contract w/ address
  const LegacyContract = await getContractClass()
  const instance = await LegacyContract.at(argv.contract)

  const [owner, state, checkInIntervalInSec, lastOwnerCheckInAt] = [
    await instance.owner(),
    (await instance.state()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    (await instance.lastOwnerCheckInAt()).toNumber(),
  ]

  console.error()
  console.error('Contract address: ', argv.contract)
  console.error('Owner:', owner)
  console.error('Contract state:', stateToString(state))

  if (state === States.CallForKeepers) {
    const numProposals = await instance.getNumProposals()
    console.error(`Number of keepeing proposals: ${numProposals}`)
  } else {
    const [numKeepers, totalKeepingFee] = [
      await instance.getNumKeepers(),
      await instance.totalKeepingFee(),
    ]
    console.error(`Number of keepers: ${numKeepers}`)
    console.error(`Combined keepers fee: ${formatWei(totalKeepingFee)}`)
  }

  console.error(
    'Check-in intreval:',
    moment()
      .add(checkInIntervalInSec, 's')
      .toNow(true),
  )

  if (state === States.Active) {
    console.error(
      'The next check-in:',
      moment(lastOwnerCheckInAt * 1000)
        .add(checkInIntervalInSec, 's')
        .fromNow(),
    )
  }
}
