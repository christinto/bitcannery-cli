export const command = 'list'

export const desc = 'Display the contracts list'

// prettier-ignore
export const builder = yargs => yargs

// Implementation

import runCommand from '../utils/run-command'
import getContractAPIs from '../utils/get-contract-apis'
import {fetchOwnerContracts} from '../utils/contract-api'
import print from '../utils/print'
import {printWelcomeAndUnlockAccount} from '../contract-utils/common'

export function handler(argv) {
  return runCommand(() => getList())
}

async function getList() {
  // TODO: ensure json rpc is running

  const address = await printWelcomeAndUnlockAccount()
  const {registry} = await getContractAPIs()
  const contracts = await fetchOwnerContracts(registry, address)

  if (contracts.length === 0) {
    print(`\nYou have no contracts yet.\n`)
    return
  }

  print('Contract list:\n')

  for (let i = 0; i < contracts.length; ++i) {
    print(contracts[i])
  }

  print('')
}
