import moment from 'moment'
import getWeb3 from '../utils/get-web3'
import getContractClass from '../utils/get-contract-class'
const {stateToString} = require('../utils/contract-api')

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

  const owner = await instance.owner()
  const state = await instance.state()
  const checkInIntervalInSec = (await instance.checkInInterval()).toNumber()
  const numKeepers = (await instance.getNumKeepers()).toNumber()
  const lastOwnerCheckInAt = (await instance.lastOwnerCheckInAt()).toNumber()
  const totalKeepingFee = await instance.totalKeepingFee()

  const totalKeepingFeeEth = getWeb3().fromWei(totalKeepingFee, 'ether')

  console.log()
  console.log('Contract address: ', argv.contract_id)
  console.log('Owner: account', owner)
  console.log('Contract state:', stateToString(state.toNumber()))
  console.log('Number of keepers:', numKeepers)
  console.log(
    'Check in intreval:',
    moment()
      .add(checkInIntervalInSec, 's')
      .toNow(true),
  )
  console.log('Combined keepers fee:', totalKeepingFeeEth.toString(), 'ETH')
  console.log(
    'The next check-in:',
    moment(lastOwnerCheckInAt * 1000)
      .add(checkInIntervalInSec, 's')
      .fromNow(),
  )
}
