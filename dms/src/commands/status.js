import moment from 'moment'
import getWeb3 from '../utils/get-web3'
import getContractClass from '../utils/get-contract-class'
const {States, stateToString} = require('../utils/contract-api')

export const description = 'Display the status of given legacy contract'

export function yargsBuilder(yargs) {
  return yargs
    .example(
      '$0 status -c 0xf455c170ea2c42e0510a3e50625775efec89962e',
      'Display the status of given legacy contract',
    )
    .alias('c', 'contract_id')
    .nargs('c', 1)
    .describe('c', 'Specify the legacy contract')
    .demandOption(['c'])
}

export async function handler(argv) {
  const LegacyContract = await getContractClass()
  const instance = await LegacyContract.at(argv.contract_id)

  const [owner, state, checkInIntervalInSec, lastOwnerCheckInAt] = [
    await instance.owner(),
    (await instance.state()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    (await instance.lastOwnerCheckInAt()).toNumber(),
  ]

  console.log()
  console.log('Contract address: ', argv.contract_id)
  console.log('Owner:', owner)
  console.log('Contract state:', stateToString(state))

  if (state === States.CallForKeepers) {
    const numProposals = await instance.getNumProposals()
    console.log(`Number of keepeing proposals: ${numProposals}`)
  } else {
    const [numKeepers, totalKeepingFee] = [
      await instance.getNumKeepers(),
      await instance.totalKeepingFee(),
    ]
    const totalKeepingFeeEth = getWeb3().fromWei(totalKeepingFee, 'ether')
    console.log(`Number of keepers: ${numKeepers}`)
    console.log(`Combined keepers fee: ${totalKeepingFeeEth} ETH`)
  }

  console.log(
    'Check-in intreval:',
    moment()
      .add(checkInIntervalInSec, 's')
      .toNow(true),
  )

  if (state === States.Active) {
    console.log(
      'The next check-in:',
      moment(lastOwnerCheckInAt * 1000)
        .add(checkInIntervalInSec, 's')
        .fromNow(),
    )
  }
}
