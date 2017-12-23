import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'

export const description = 'Set options for connecting to Ethereum client'

export function yargsBuilder(yargs) {
  return yargs
    .example(
      '$0 set-client-options -a <account-index> -c <rpc-connection>',
      'Set connection options',
    )
    .describe('a', 'Account index to use')
    .alias('a', 'account-index')
    .number('a')
    .nargs('a', 1)
    .describe('c', 'JSON-RPC connection string, e.g. http://localhost:8545')
    .alias('c', 'rpc-connection')
    .nargs('c', 1)
    .check(validate)
}

function validate(argv) {
  if (argv.a == null && argv.c == null) {
    throw new Error(`Please pass at least one option.`)
  }
  if (argv.a != null && isNaN(argv.a)) {
    throw new Error(`Account index must be a number.`)
  }
  if (argv.c != null && !/^https?:[/][/]/.test(argv.c)) {
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
