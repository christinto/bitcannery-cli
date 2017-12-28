export const command = 'backup [path-to-file]'

export const desc = 'Backup config'

// prettier-ignore
export const builder = yargs => yargs
  .positional('pathToFile', {
    desc: 'Path to the output file. If not specified, encrypted config will be printed to STDOUT.',
    normalize: true,
  })

// Implementation

import {persistentConfig} from '../config'
import runCommand from '../utils/run-command'
import print, {question} from '../utils/print'
import {aesEncrypt} from '../utils/encryption'
import Crypto from 'crypto'
import Stream from 'stream'
import fs from 'fs'

export async function handler(argv) {
  return runCommand(() => exportConfig(argv.pathToFile))
}

function exportConfig(destination) {
  print('You need to think of a password for config, so nobody but you could access it.')
  const userPassword = question.demandAnswer(`Please enter password for the config:`)
  const password = makeStrongAesPassword(userPassword)
  const config = getConfig()
  const encryptedConfig = encryptConfig(config, password)
  pipeEncryptedConfig(
    encryptedConfig,
    destination ? fs.createWriteStream(destination) : process.stdout,
  )
  print(`Config successfully exported ${destination ? 'to ' : ''} ${destination || ''}`)
}

function makeStrongAesPassword(password) {
  //TODO — generate random salt and embed it in config cyphertext, not in code
  const salt =
    'c4e0da221c0eff92de02dabfce15dcc8e7255f9284e0bc8ad2ada27593931d20ae019c4fbc1bc60112414740f8f033b6590061d17aeeea29ca43b7319272e56a25684c8647ba395fa9123528f4597f8b5632d2a6059ba41ec92493584b490ec8bedcdf02d91b90b3260174d15c23553e5526d73c29263184aa0d7ece7fc81aac5793f90895ae3a842b9693fb53805441d1a5564fda07a8db4b40ed4c9bc07cb1bfcd680642a8b72dbe6d28b91292183da1f47e6453948244ef7799aa69417e17c2f92acc8e26269ee0e8b34dc1c3867f6745a2e8c32940639bbc258494c66338731cc12eebc410309083bab7392748d7c4ac5e1e8d399abef94e23b6d81f4eb462306fb53cc168a9bca2159ed3e4fddd7185fb307fa13a9fac4a1dc0ffd73b20e476502506b5b91c4dcbe03c64542cb31b42e9a280353c4d00591ee92893d090cbe5b6bc29ff9ebd69dcc9d3d87fc8c19749c7a228bf0a9f93d33191a0268d4575e2e44c6b2a106780a4bcd5e9a23fbe696749b0b6efb0a7d3d6179a98e4d130f8f715fe3cea0676bf3590c6296c50e3f50bf7a27d28dab8fa7a90a63d50017c04d3495eedcb52f569b3d0d0a9b196475e616047de44f56ca29a330684c5471c01694326a683c98d36e33fedb9704948289104ac4c8e429d983ea785a5c6d738d4d9d72d434bc0309c8fae877db5e1a94d9e119337122f39b67af4d369e4d4290de3c99d6317024f0cae9a90dab3324f999bb36733191924069419cb11e6b4e60b53607a3d6506bfe11db92f8f5cade4dffb7cb1dbc075a8b03380dfd26ddff8157d9956e77d52f783f6e47b1b1fc2775f7790905f376681bae20320e3f7ef9e57f031e0502df5c89d94e8e87c57249da4825685931b28ee06a3edb4cbf40e2557c2a99ba549220eb64590dc4258d61eb8d303b5ffeed96e5faa660f95ff6682f0464ac8894022d6567ebf6f7b5b8a3bdbeafd1b170e81a0e65f3d9ece2e86c8211f5d214d8ac717cd445b90ebf28a5b8cd2435d40d696b7c9e9cac7c2b9362756875a12ea679f5766aacf347910977e3f898d04f68a38ab00bdfbaa58c1aaff6d825cbd2043a4c55cce4ebf3996766173f580f567fdbc407913c779f7e693efb0b20aae1b9fe03ff8926cd202affbd01f28be6501a5a2faa2f662a2d6d95e1e1cd5cb0f3b63be31cb02d57310fee2e5f8f6b70ef5c6b9520d04c94ab1a062394e614672e0bc91ffcbc04cbd0d20952593e30a96d571fdeeef04cb2792c778b59d706a842342b279b9311cdaa15ce7095c83043422f6feb6ba7aed002b9ac8195e013b8a57d5fa7d989e542e7a410e083e29f204ef4d2952cd5d4dbcd4777508ec8a556517a3b07d8d5773c57ed7fd209e30c7e1bfb9764e952a634b38eac19d7cf1119851b6dc4f1d584ad385099bc2f9d87956d2396ebc92971afc60ec21f6'
  return Crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha512')
}

function getConfig() {
  const config = persistentConfig.store
  return stringToBuffer(JSON.stringify(config))
}

function stringToBuffer(string) {
  return Buffer.from(string)
}

function encryptConfig(configStream, passwordStream) {
  //TODO — embed aesCounter in config cyphertext, not in code
  return aesEncrypt(
    configStream,
    passwordStream,
    Buffer.from('6d2c3bb44c10d7351678c05bad33ad0a', 'hex'),
  )
}

function pipeEncryptedConfig(encryptedConfigString, destination) {
  var s = new Stream.Readable()
  s.push(encryptedConfigString)
  s.push(null)
  return s.pipe(destination)
}
