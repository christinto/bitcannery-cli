import ora from 'ora'

import readFile from '../utils/read-file'
import getContractAPIs from '../utils/get-contract-apis'
import {contractTx, getBlockGasLimit} from '../utils/tx'
import delay from '../utils/delay'
import {formatWei} from '../utils/format'
import print from '../utils/print'

export async function readLegacyData(pathToFile) {
  const fileContent = await readFile(pathToFile)
  return '0x' + fileContent.toString('hex')
}

export async function deployLegacyContract(contractId, checkInIntervalInSec, address, gasPrice) {
  const deploySpinner = ora('Publishing a new contract...').start()

  const blockGasLimit = await getBlockGasLimit()
  const {LegacyContract} = await getContractAPIs()

  const instance = await LegacyContract.new(checkInIntervalInSec, {
    from: address,
    gas: blockGasLimit, // TODO: estimate gas usage
    gasPrice: gasPrice,
  })

  deploySpinner.succeed(`Contract address is ${instance.address}`)

  return instance
}

export async function deployAndRegisterLegacyContract(
  contractId,
  checkInIntervalInSec,
  address,
  gasPrice,
) {
  print('')

  const instance = await deployLegacyContract(contractId, checkInIntervalInSec, address, gasPrice)

  const registerSpinner = ora('Registering contract...').start()

  const {registry} = await getContractAPIs()
  const registerTxResult = await contractTx(registry, 'addContract', contractId, instance.address, {
    from: address,
  })

  registerSpinner.succeed(`Contract has been added to registry`)
  await delay(500)

  print(
    `\n` +
      `Paid for transaction: ${formatWei(registerTxResult.txPriceWei)}\n` +
      `Tx hash: ${registerTxResult.txHash}\n`,
  )

  return instance
}
