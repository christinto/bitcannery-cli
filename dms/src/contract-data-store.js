import UserError from './utils/user-error'
import {passwordEncryptData, passwordDecryptData} from './utils/encryption'
import {config, persistentConfig} from './config'

export function isContractDataStoreInitialized() {
  return config.deployedContracts != null
}

export function initializeContractDataStore(password) {
  replaceContractDataStore({}, password)
}

export function readContractDataStore(password) {
  try {
    const encryptedStore = persistentConfig.get('deployedContracts')
    if (encryptedStore == null) {
      return {}
    }
    const storeDataBuf = passwordDecryptData(encryptedStore, password)
    return JSON.parse(storeDataBuf.toString('utf8'))
  } catch (err) {
    throw UserError.from(err, `cannot read contract store`)
  }
}

export function replaceContractDataStore(newStore, password) {
  const storeDataBuf = Buffer.from(JSON.stringify(newStore))
  const encryptedStore = passwordEncryptData(storeDataBuf, password)
  config.deployedContracts = encryptedStore
  persistentConfig.set('deployedContracts', encryptedStore)
}

export function updateContractDataWithAddress(id, address, password) {
  const store = readContractDataStore(password)
  store[address] = id
  replaceContractDataStore(store, password)
}
