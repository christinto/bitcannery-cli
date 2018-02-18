export const command = 'status <contract>'

export const desc = 'Display the status of given legacy contract'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address',
  })

// Implementation

import moment from 'moment'
import getWeb3 from '../utils/get-web3'
import getContractInstance from '../utils/get-contract-instance'
import {States} from '../utils/contract-api'
import {formatWei} from '../utils/format'
import runCommand from '../utils/run-command'

export function handler(argv) {
  return runCommand(() => getStatus(argv.contract))
}

async function getStatus(contractAddressOrID) {
  // TODO: ensure json rpc is running
  const instance = await getContractInstance(contractAddressOrID)

  const [owner, state, checkInIntervalInSec, lastOwnerCheckInAt] = [
    await instance.owner(),
    (await instance.state()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    (await instance.lastOwnerCheckInAt()).toNumber(),
  ]

  console.error()
  console.error('Contract address:', instance.address)
  console.error('Owner:', owner)
  console.error('Contract state:', States.stringify(state))

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
    'Check-in intreval: each',
    moment
      .duration(checkInIntervalInSec, 's')
      .humanize()
      .replace(/^a /, ''),
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
