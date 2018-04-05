import {config} from '../../config'
import {getAccounts} from '../web3'
import unlockAccount from './unlock-account'
import setupMnemonic from './setup-mnemonic'

export default async function getPreparedAccount() {
  if (config.useLocalAccounts) {
    if (!config.mnemonic) {
      await setupMnemonic()
    }

    const accounts = await getAccounts()

    return accounts[0]
  } else {
    return await unlockAccount()
  }
}
