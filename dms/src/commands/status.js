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
import {States, fetchContractChain} from '../utils/contract-api'
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

  if (contractAddressOrID.substring(0, 2) != '0x') {
    const chain = await fetchContractChain(contractAddressOrID)
    console.error(`\nPrevious contracts in chain [${chain.length - 1}]\n`)
    chain
      .reverse()
      .slice(1)
      .forEach(displayShortInfo)
  }
}

async function displayShortInfo(contract) {
  const [state, lastOwnerCheckInAt] = [
    (await contract.state()).toNumber(),
    (await contract.lastOwnerCheckInAt()).toNumber(),
  ]
  console.error('Contract address:', contract.address)
  console.error('Contract state:', States.stringify(state))
  console.error('Last owner checkin:', moment(lastOwnerCheckInAt * 1000).format('DD MMM YYYY'))
  console.error()
}
