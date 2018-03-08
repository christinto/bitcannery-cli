import linewrap from 'linewrap'
import readlineSync from 'readline-sync'
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

question.password = function question_password(message) {
  return question(message, {hideEchoBack: true})
}

question.verifiedPassword = function question_verifiedPassword(message) {
  while (true) {
    const password = question.password(message)
    if (password === '') {
      return password
    }
    const checkPassword = question.password('Please enter password one more time to verify it:')
    if (checkPassword === password) {
      return password
    }
  }
}

export function ynQuestion(message, opts) {
  return yn(question(message + ' [Y/n]', opts))
}
