import yn from 'yn'

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
  .option('mnemonic', {
    alias: 'm',
    nargs: 1,
  })
  .option('use-local-accounts', {
    alias: 'l',
    nargs: 1,
  })
  .check(validate)

function validate(argv) {
  if (
    argv.accountIndex == null &&
    argv.rpcConnection == null &&
    argv.mnemonic == null &&
    argv.useLocalAccounts == null
  ) {
    throw new Error(`Please pass at least one option.`)
  }
  if (argv.accountIndex != null && isNaN(argv.accountIndex)) {
    throw new Error(`Account index must be a number.`)
  }
  if (argv.rpcConnection != null && !/^https?:[/][/]/.test(argv.rpcConnection)) {
    throw new Error(`JSON-RPC connection string must be an URL.`)
  }
  if (argv.mnemonic != null && !isMnemonic(argv.mnemonic)) {
    throw new Error(`Mnemonic must be 12 words(or null) separated by a space inside '' or ""`)
  }
  if (argv.useLocalAccounts != null && yn(argv.useLocalAccounts) == null) {
    throw new Error(`useLocalAccounts must be boolean`)
  }
  return true
}

// Implementation

import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'

export async function handler(argv) {
  return runCommand(() =>
    setAccountIndex(argv.accountIndex, argv.rpcConnection, argv.mnemonic, argv.useLocalAccounts),
  )
}

function setAccountIndex(accountIndex, rpcConnection, mnemonic, useLocalAccounts) {
  if (accountIndex != null) {
    persistentConfig.set('accountIndex', accountIndex)
    console.error('Account index set to:', accountIndex)
  }
  if (rpcConnection != null) {
    persistentConfig.set('rpcConnection', rpcConnection)
    console.error('JSON-RPC connection string set to:', rpcConnection)
  }
  if (mnemonic != null) {
    if (mnemonic === 'null') {
      mnemonic = null
    } else {
      mnemonic = mnemonic
        .replace(/'/g, '')
        .replace(/"/g, '')
        .trim()
    }
    persistentConfig.set('mnemonic', mnemonic)
    console.error('Mnemonic string set to:', mnemonic)
  }
  if (useLocalAccounts != null) {
    persistentConfig.set('useLocalAccounts', yn(useLocalAccounts))
    console.error('useLocalAccounts bool set to:', yn(useLocalAccounts))
  }
}

function isMnemonic(mnemonic) {
  if (mnemonic === 'null') return true
  return (
    mnemonic
      .replace(/'/g, '')
      .replace(/"/g, '')
      .trim()
      .split(/\s+/g).length >= 12
  )
}
