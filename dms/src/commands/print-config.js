import {config} from '../config'

export const command = 'print-config'

export const desc = false // hide this command

export const builder = {}

export function handler(argv) {
  console.error(`Config:`, config)
}
