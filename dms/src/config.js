import Conf from 'conf'
import humps from 'humps'
import yn from 'yn'

import encryptionUtils from './utils/encryption'

const {env} = process
const SECONDS_IN_MONTH = 60 * 60 * 24 * 30

export const persistentConfig = new Conf({
  projectName: 'dms',
  configName: env.CONFIG_NAME || 'default',
  encryptionKey: '0x06012c8cf97bead5deae237070f9587f8e7a266d',
  defaults: {
    rpcConnection: 'http://localhost:8545',
    accountIndex: 0,
    keeper: {
      maxCheckInIntervalSec: SECONDS_IN_MONTH * 365,
      keepingFeePerContractMonth: '10000000000000000', // 0.01 ether
      keypair: undefined, // {privateKey, publicKey}
    },
  },
})

export let config = getConfig()

export function updateConfig() {
  config = getConfig()
}

function getConfig() {
  let config = persistentConfig.store
  overrideFromEnv(config, [])
  if (!config.keeper.keypair) {
    config.keeper.keypair = encryptionUtils.generateKeyPair()
    persistentConfig.set('keeper.keypair', config.keeper.keypair)
  }
  return config
}

//
// Utils
//

function overrideFromEnv(value, path) {
  if (isMap(value)) {
    for (let childKey in value) {
      value[childKey] = overrideFromEnv(value[childKey], path.concat(childKey))
    }
    return value
  } else {
    const envVarName = humps.decamelize(path.join('_')).toUpperCase()
    const envVar = env[envVarName]
    if (envVar) {
      console.error(`Overriding config key '${path.join('.')}' from environment`)
      return coerce(envVar, value)
    } else {
      return value
    }
  }
}

function coerce(src, dest) {
  switch (typeof dest) {
    case 'number': {
      return +src
    }
    case 'boolean': {
      return yn(src)
    }
  }
  if (Array.isArray(dest)) {
    const destEl = dest[0] || ''
    return src.split(',').map(v => coerce(v, destEl))
  }
  return src
}

function isMap(o) {
  return typeof o == 'object' && (!o.constructor || o.constructor == Object)
}
