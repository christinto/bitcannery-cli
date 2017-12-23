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

export default function print(message) {
  console.error(_wrap(message))
}

export function wrap(string) {
  return _wrap(string)
}

export function question(message) {
  return readlineSync.question(wrap(message) + ' ')
}

question.demandAnswer = function question_demandAnswer(message) {
  let answer = question(message)
  while (!answer) {
    answer = question(message)
  }
  return answer
}

export function ynQuestion(message) {
  return yn(question(message + ' [Y/n]'))
}
