import linewrap from 'linewrap'
import readlineSync from 'readline-sync'
import inquirer from 'inquirer'
import yn from 'yn'

let _wrap

if (process.stderr.isTTY) {
  makeWrap()
  process.stderr.on('resize', makeWrap)
} else {
  _wrap = s => s
}

function makeWrap() {
  const columns = Math.min(process.stderr.columns, 80)
  _wrap = linewrap(columns, {
    skipScheme: 'ansi-color',
    whitespace: 'line',
  })
}

export default print

export function print(message) {
  console.error(_wrap(message))
}

export function wrap(string) {
  return _wrap(string)
}

export function question(message, opts) {
  return readlineSync.question(wrap(message) + ' ', opts)
}

question.demandAnswer = function question_demandAnswer(message, opts) {
  let answer = question(message, opts)
  while (!answer) {
    answer = question(message, opts)
  }
  return answer
}

question.password = async function question_password(message, requireNonEmpty = false) {
  const {result} = await inquirer.prompt([
    {
      name: 'result',
      type: 'password',
      message: message,
      validate: requireNonEmpty
        ? input => (input ? true : 'Password cannot be empty')
        : input => true,
      prefix: '',
    },
  ])
  return result
}

question.verifiedPassword = async function question_verifiedPassword(
  message,
  requireNonEmpty = false,
) {
  while (true) {
    const password = await question.password(message, requireNonEmpty)
    if (password === '') {
      return password
    }
    const checkPassword = await question.password(
      'Please enter password one more time to verify it:',
    )
    if (checkPassword === password) {
      return password
    } else {
      print(`Passwords don't match`)
    }
  }
}

export function ynQuestion(message, opts) {
  return yn(question(message + ' [Y/n]', opts))
}
