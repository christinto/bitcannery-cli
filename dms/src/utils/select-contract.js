import readlineSync from 'readline-sync'

import {getAccounts} from './web3'
import getContractAPIs from './get-contract-apis'
import {fetchOwnerContracts} from './contract-api'

export async function selectContract() {
  const accounts = await getAccounts()
  const {registry} = await getContractAPIs()
  const contracts = await fetchOwnerContracts(registry, accounts[0])

  const index = readlineSync.keyInSelect(contracts, 'Which contract?', {cancel: 'Cancel'})

  if (index === -1) {
    process.exit(0)
  }

  return contracts[index]
}
