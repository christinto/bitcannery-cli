import * as cmdRun from './keeper/run'
import * as cmdSetFee from './keeper/set-fee'

export const command = 'keeper [command]'

export const desc = 'Commands for running a Keeper node'

export const builder = yargs => {
  return yargs.command(cmdRun).command(cmdSetFee)
}

export const handler = async argv => {}
