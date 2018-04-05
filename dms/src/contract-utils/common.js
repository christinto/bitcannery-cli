import print from '../utils/print'

import {getNetworkName} from '../utils/web3'
import getPreparedAccount from '../utils/accounts/get-prepared-account'
import getContractAPIs from '../utils/get-contract-apis'

export async function printWelcomeAndUnlockAccount() {
  print('Welcome to KeeperNet v2!\n')

  const networkName = await getNetworkName()
  const address = await getPreparedAccount()
  const {registry} = await getContractAPIs()

  print(`Your address: ${address}`)
  print(`Network: ${networkName}`)
  print(`Registry: ${registry.address}\n`)

  return address
}
