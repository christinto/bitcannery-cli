import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'
import getWeb3 from '../utils/get-web3'

export const description = 'Set account index'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 set-account-index <index>', 'Set account index')
    .positional('fee', {
      type: 'number',
      describe: 'Specify account index',
    })
    .check(validIndex)
}

export async function handler(argv) {
  return runCommand(() => setAccountIndex(argv))
}

function setAccountIndex(argv) {
  persistentConfig.set('accountIndex', getIndexFromArgs(argv))
  console.error('account index set to', getIndexFromArgs(argv))
}

function validIndex(argv) {
  return getIndexFromArgs(argv) >= 0
}

function getIndexFromArgs(argv) {
  return argv._[1]
}
