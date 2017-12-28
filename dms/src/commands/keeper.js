export const command = 'keeper [command]'

export const desc = 'Commands for running a Keeper node'

export const builder = yargs => {
  return yargs.commandDir('keeper')
}

export const handler = async argv => {}
