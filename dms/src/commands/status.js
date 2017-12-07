import moment from 'moment'
import getContractApi from '../utils/get-contract-api'

export const description = 'Display the status of given legacy contract'

export function yargsBuilder (yargs) {
  return yargs
    .example(
      '$0 status -c 0xf455c170ea2c42e0510a3e50625775efec89962e',
      'Display the status of given legacy contract'
    )
    .alias('c', 'contract_id')
    .nargs('c', 1)
    .describe('c', 'Specify the legacy contract')
    .demandOption(['c'])
}

export async function handler (argv) {
  console.log('Contract address: ', argv.contract_id)

  const LegacyContract = await getContractApi()
  const instance = await LegacyContract.at(argv.contract_id)

  const owner = await instance.owner()
  const checkInIntervalInSec = (await instance.checkInInterval()).toNumber()

  console.log('Owner: account', owner)
  console.log('Check in intreval:', moment().add(checkInIntervalInSec, 's').toNow(true))
}
