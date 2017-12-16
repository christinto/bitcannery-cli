import yargs from 'yargs'

const commandNames = ['status', 'deploy', 'keeper', 'checkin', 'decrypt']

let commands = {}
for (let commandName of commandNames) {
  commands[commandName] = require(`./commands/${commandName}`)
}

let argv = yargs.usage('Usage: $0 <command> [options]')

for (let commandName of commandNames) {
  const command = commands[commandName]
  argv = argv.command(commandName, command.description, command.yargsBuilder, command.handler)
}

argv = argv.argv
