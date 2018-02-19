import ora from 'ora'

import getContractAPIs from '../utils/get-contract-apis'
import {contractTx} from '../utils/tx'
import delay from '../utils/delay'
import {formatWei} from '../utils/format'
import print from '../utils/print'

export async function announceContinuationContract(
  instance,
  newContractAddress,
  address,
  gasPrice,
) {
  const announceContinuationSpinner = ora('Announcing continuation contract...').start()

  const announceTxResult = await contractTx(
    instance,
    'announceContinuationContract',
    newContractAddress,
    {
      from: address,
      gasPrice: gasPrice,
    },
  )

  announceContinuationSpinner.succeed(`Continuation has been announced`)
  await delay(500)

  print(
    `\n` +
      `Paid for transaction: ${formatWei(announceTxResult.txPriceWei)}\n` +
      `Tx hash: ${announceTxResult.txHash}\n`,
  )
}

export async function updateAddress(contractId, address, gasPrice) {
  const updateAddressSpinner = ora('Updating address in registry...').start()

  const {registry} = await getContractAPIs()
  const updateAddressTxResult = await contractTx(registry, 'updateAddress', contractId, {
    from: address,
    gasPrice: gasPrice,
  })

  updateAddressSpinner.succeed(`Contract address in registry has been changed`)
  await delay(500)

  print(
    `\n` +
      `Paid for transaction: ${formatWei(updateAddressTxResult.txPriceWei)}\n` +
      `Tx hash: ${updateAddressTxResult.txHash}\n`,
  )
}
