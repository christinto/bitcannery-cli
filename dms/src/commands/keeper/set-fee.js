export const command = 'set-fee <fee> [unit]'

export const desc = 'Set keeping fee per contract-month for new contracts'

// prettier-ignore
export const builder = yargs => yargs
  .positional('fee', {
    desc: 'Keeping fee per contract-month',
    number: true,
  })
  .positional('unit', {
    desc: 'Unit of the fee',
    default: 'wei',
    choices: etherUnits,
  })
  .example('$0 keeper set-fee 10 Gwei', 'Sets fee per contract-month to 10 Gwei')
  .check(validateArgs)

function validateArgs(argv) {
  if (isNaN(argv.fee)) {
    throw new Error(`fee should be a number`)
  }
  if (etherUnits.indexOf(argv.unit) == -1) {
    throw new Error(wrap(`Invalid unit; should be one of: ${etherUnits.join(', ')}`))
  }
  return true
}

// Implementation

import {persistentConfig} from '../../config'
import etherUnits from '../../utils/ether-units'
import runCommand from '../../utils/run-command'
import getWeb3 from '../../utils/get-web3'
import {wrap} from '../../utils/print'

export async function handler(argv) {
  return runCommand(() => setFee(argv.fee, argv.unit))
}

function setFee(fee, unit) {
  const feeInWei = getWeb3().toWei(fee, unit)
  persistentConfig.set('keeper.keepingFeePerContractMonth', feeInWei)
  console.error(`Fee set to ${fee} ${unit}` + (unit === 'wei' ? '' : ` (${feeInWei} wei)`))
}
