import print from '../utils/print'

import {getNetworkName} from '../utils/web3'
import unlockAccount from '../utils/unlock-account'
import getContractAPIs from '../utils/get-contract-apis'

export async function printWelcomeAndUnlockAccount() {
  print('Welcome to KeeperNet v2!\n')

  const networkName = await getNetworkName()
  const address = await unlockAccount()
  const {registry} = await getContractAPIs()

  print(`Your address: ${address}`)
  print(`Network: ${networkName}`)
  print(`Registry: ${registry.address}\n`)

  return address
}
