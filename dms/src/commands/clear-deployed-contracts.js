// WARN: THIS IS A HIDDEN COMMAND FOR DEBUG PURPOSES ONLY

import {persistentConfig, config} from '../config'

export const command = 'clear-deployed-contracts'

export const desc = false // hide this command

export const builder = {}

export function handler(argv) {
  persistentConfig.set('deployedContracts', null)
  config.deployedContracts = null
  console.error(`Config:`, config)
}
