export const command = 'restore <path-to-file>'

export const desc = 'Restore config'

// prettier-ignore
export const builder = yargs => yargs
  .positional('path-to-file', {
    desc: 'Path to the encrypted config file',
    normalize: true,
  })

// Implementation

import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'
import print, {question} from '../utils/print'
import {passwordDecryptData} from '../utils/encryption'
import UserError from '../utils/user-error'
import fs from 'fs'

export async function handler(argv) {
  return runCommand(() => importConfig(argv.pathToFile))
}

async function importConfig(pathToFile) {
  assertFileExists(pathToFile)

  const encryptedConfig = await readEncryptedConfig(pathToFile)
  const password = question.password(`\nPlease enter password for the config:`)

  if (password === '') {
    throw new UserError(`password cannot be empty`)
  }

  const decryptedConfigBuf = passwordDecryptData(encryptedConfig, password)
  const decryptConfig = JSON.parse(decryptedConfigBuf.toString('utf8'))

  // saveDecryptedConfig(decryptedConfig)
  console.log(`config:`, decryptConfig)

  print(`Config successfully imported from ${pathToFile}`)
}

function assertFileExists(pathToFile) {
  let stat
  try {
    stat = fs.lstatSync(pathToFile)
  } catch (err) {
    throw new UserError(`file ${pathToFile} does not exist`, err)
  }
  if (!stat.isFile()) {
    throw new UserError(`the destination path ${pathToFile} does not point to a file`)
  }
}

async function readEncryptedConfig(pathToFile) {
  const stream = fs.createReadStream(pathToFile)
  const configString = await streamToString(stream)
  try {
    return JSON.parse(configString)
  } catch (err) {
    throw new UserError(`the config file is invalid or corrupted`, err)
  }
}

function streamToString(stream) {
  return new Promise(resolve => {
    const chunks = []

    stream.on('data', chunk => chunks.push(chunk))

    // Send the buffer or you can put it into a var
    stream.on('end', _ => resolve(Buffer.concat(chunks).toString()))
  })
}

function saveDecryptedConfig(config) {
  persistentConfig.set(config)
}
