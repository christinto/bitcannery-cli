import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'

export const command = 'set-client-options'

export const desc = 'Set options for connecting to Ethereum client'

// prettier-ignore
export const builder = yargs => yargs
  .option('account-index', {
    alias: 'a',
    number: true,
    nargs: 1,
  })
  .option('rpc-connection', {
    alias: 'c',
    nargs: 1,
  })
  .check(validate)

function validate(argv) {
  if (argv.accountIndex == null && argv.rpcConnection == null) {
    throw new Error(`Please pass at least one option.`)
  }
  if (argv.accountIndex != null && isNaN(argv.accountIndex)) {
    throw new Error(`Account index must be a number.`)
  }
  if (argv.rpcConnection != null && !/^https?:[/][/]/.test(argv.rpcConnection)) {
    throw new Error(`JSON-RPC connection string must be an URL.`)
  }
  return true
}

export async function handler(argv) {
  return runCommand(() => setAccountIndex(argv.accountIndex, argv.rpcConnection))
}

function setAccountIndex(accountIndex, rpcConnection) {
  if (accountIndex != null) {
    persistentConfig.set('accountIndex', accountIndex)
    console.error('Account index set to:', accountIndex)
  }
  if (rpcConnection != null) {
    persistentConfig.set('rpcConnection', rpcConnection)
    console.error('JSON-RPC connection string set to:', rpcConnection)
  }
}
