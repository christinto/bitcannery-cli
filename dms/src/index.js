import yargs from 'yargs'

// prettier-ignore
yargs
  .commandDir('commands')
  .demandCommand(1, 'Please specify a command.')
  .help()
  .argv
