import yargs from 'yargs'

process.on('SIGINT', () => {
  console.error(`Caught SIGINT, exiting`)
  process.exit(1)
})

// prettier-ignore
yargs
  .commandDir('commands')
  .demandCommand(1, 'Please specify a command.')
  .help()
  .argv
