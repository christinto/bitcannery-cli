export const command = 'backup <path-to-directory>'

export const desc = 'Backup config'

// prettier-ignore
export const builder = yargs => yargs
  .positional('path-to-directory', {
    desc: 'Path to the output directory. Pass - to print encrypted config to STDOUT.',
    type: 'string',
  })

// Implementation

import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'
import print, {question} from '../utils/print'
import {passwordEncryptData} from '../utils/encryption'
import UserError from '../utils/user-error'
import Stream from 'stream'
import path from 'path'
import fs from 'fs'

export async function handler(argv) {
  return runCommand(() => exportConfig(argv.pathToDirectory))
}

function exportConfig(pathToDirectory) {
  const destination = makeDestinationPath(pathToDirectory)

  print(`\nYou need to think of a strong password, so nobody but you can restore the config later.`)
  const password = question.verifiedPassword(`Please enter password (empty password to cancel):`)

  if (password === '') {
    print(`The password is empty, cancelling.`)
    return
  }

  const configBuf = getConfigBuffer()
  const encryptedConfig = passwordEncryptData(configBuf, password)

  pipeEncryptedConfig(
    encryptedConfig,
    destination ? fs.createWriteStream(destination) : process.stdout,
  )

  print(`Config successfully exported ${destination ? 'to ' + destination : ''}`)
}

function makeDestinationPath(pathToDirectory) {
  if (pathToDirectory === '-' || pathToDirectory === '') {
    return null
  }
  let stat
  try {
    stat = fs.lstatSync(pathToDirectory)
  } catch (err) {
    throw new UserError(`the destination directory ${pathToDirectory} does not exist`, err)
  }
  if (!stat.isDirectory()) {
    throw new UserError(`the destination path ${pathToDirectory} does not point to a directory`)
  }
  const timeSpec = new Date()
    .toISOString()
    .slice(0, -1)
    .replace(/[:.]/g, '-')
  return path.join(pathToDirectory, `dms-backup-${timeSpec}.json`)
}

function getConfigBuffer() {
  const config = persistentConfig.store
  return Buffer.from(JSON.stringify(config))
}

function pipeEncryptedConfig(encryptedConfig, destination) {
  const encryptedConfigString = JSON.stringify(encryptedConfig)
  const s = new Stream.Readable()
  s.push(encryptedConfigString)
  s.push(null)
  return s.pipe(destination)
}
