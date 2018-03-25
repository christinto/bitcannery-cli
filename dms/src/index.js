import yargs from 'yargs'

import * as cmdSetClientOptions from './commands/set-client-options'
import * as cmdBackup from './commands/backup'
import * as cmdRestore from './commands/restore'

import * as cmdList from './commands/list'
import * as cmdDeploy from './commands/deploy'
import * as cmdCheckin from './commands/checkin'
import * as cmdCancel from './commands/cancel'
import * as cmdRotateKeepers from './commands/rotate-keepers'

import * as cmdKeeper from './commands/keeper'
import * as cmdStatus from './commands/status'
import * as cmdDecrypt from './commands/decrypt'

import * as cmdPrintConfig from './commands/print-config'
import * as cmdClearDeployedContracts from './commands/clear-deployed-contracts'

process.on('SIGINT', () => {
  console.error(`Caught SIGINT, exiting`)
  process.exit(1)
})

// prettier-ignore
yargs
  .command(cmdSetClientOptions)
  .command(cmdBackup)
  .command(cmdRestore)
  .command(cmdList)
  .command(cmdDeploy)
  .command(cmdCheckin)
  .command(cmdCancel)
  .command(cmdRotateKeepers)
  .command(cmdKeeper)
  .command(cmdStatus)
  .command(cmdDecrypt)
  .command(cmdPrintConfig)
  .command(cmdClearDeployedContracts)
  .demandCommand(1, 'Please specify a command.')
  .help()
  .argv
