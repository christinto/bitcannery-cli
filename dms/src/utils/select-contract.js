import inquirer from 'inquirer'

import {getAccounts} from './web3'
import getContractAPIs from './get-contract-apis'
import {fetchOwnerContracts} from './contract-api'
import {question} from './print'

const CANCEL_VALUE = '___CANCEL___'

export async function selectContract(message) {
  const [accounts, {registry}] = await Promise.all([
    getAccounts(),
    getContractAPIs(),
  ])

  const contracts = await fetchOwnerContracts(registry, accounts[0])

  if (contracts.length === 0) {
    return undefined
  }

  if (contracts.length === 1) {
    return contracts[0]
  }

  const contractName = await question.prompt({
    type: 'list',
    message,
    choices: [...contracts, new inquirer.Separator(), {name: 'Cancel', value: CANCEL_VALUE}],
  })

  console.log()

  if (contractName === CANCEL_VALUE) {
    return null
  }

  return contractName
}
