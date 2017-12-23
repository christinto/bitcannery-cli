import {persistentConfig} from '../config'
import etherUnits from '../utils/ether-units'
import runCommand from '../utils/run-command'
import getWeb3 from '../utils/get-web3'

export const description = 'Set keeping fee'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 set-fee <fee> <unit>', 'Set keeping fee')
    .positional('fee', {
      type: 'number',
      describe: 'Specify new fee',
    })
    .positional('unit', {
      choices: etherUnits,
      describe: 'Specify new fee unit (in wei by default)',
    })
    .check(validFee)
}

export async function handler(argv) {
  return runCommand(() => setFee(argv))
}

function setFee(argv) {
  const feeInWei = getWeb3().toWei(getFeeFromArgs(argv), getUnitFromArgs(argv))
  persistentConfig.set('keeper.keepingFeePerContractMonth', feeInWei)
}

function validFee(argv) {
  return getFeeFromArgs(argv) > 0 && etherUnits.indexOf(getUnitFromArgs(argv)) != -1
}

function getFeeFromArgs(argv) {
  return argv._[1]
}

function getUnitFromArgs(argv) {
  return argv._[2] || 'wei'
}
