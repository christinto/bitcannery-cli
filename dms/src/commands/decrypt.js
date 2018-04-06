import {print} from '../utils/print'
import keepersRequiredForRecovery from '../utils/keepers-required-for-recovery'

export const command = 'decrypt <contract>'

export const desc = 'Decrypt the legacy'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address'
  })

// Implementation

import readlineSync from 'readline-sync'

import getContractInstance from '../utils/get-contract-instance'
import {decryptData} from '../utils/encryption'
import {States, assembleEncryptedDataStruct} from '../utils/contract-api'
import runCommand from '../utils/run-command'

export function handler(argv) {
  return runCommand(() => decrypt(argv.contract))
}

async function decrypt(contractAddressOrID) {
  // TODO: ensure json rpc is running
  const instance = await getContractInstance(contractAddressOrID)

  const [state, encryptedDataRaw, suppliedKeyPartsCount, keepersCount] = [
    (await instance.state()).toNumber(),
    await instance.encryptedData(),
    (await instance.getNumSuppliedKeyParts()).toNumber(),
    (await instance.getNumKeepers()).toNumber(),
  ]

  // TODO: in case when supplied keys number is small
  // in comparison with keepers number display a warning
  if (state !== States.CallForKeys) {
    print(`Contract can't be decrypted yet`)
    return
  }

  print(`Welcome to KeeperNet v2! Contract is in "ready for decryption" state.`)

  const requiredForRecovery = keepersRequiredForRecovery(keepersCount)

  let suppliedKeyParts = []
  for (let i = 0; i < suppliedKeyPartsCount; ++i) {
    suppliedKeyParts.push(instance.getSuppliedKeyPart(i))
  }

  suppliedKeyParts = await Promise.all(suppliedKeyParts)

  const data = assembleEncryptedDataStruct(encryptedDataRaw)
  const privateKey = readlineSync.question(`To decrypt a contract enter your private key: `)

  let legacy = null

  try {
    legacy = await decryptData(
      data.encryptedData,
      data.dataHash,
      privateKey,
      suppliedKeyParts,
      data.shareLength,
      data.aesCounter,
    )
  } catch (err) {}

  if (legacy === null) {
    print(`Failed to decrypt the legacy.`)
    print(`${suppliedKeyPartsCount} of ${keepersCount} keeper keys submitted`)
    if (suppliedKeyPartsCount === keepersCount) {
      print(`Failed to decrypt the legacy. The private key you pasted here is not correct, `
        +`please check it one more time.`)
      return
    }
    if (suppliedKeyPartsCount < requiredForRecovery) {
      print(`Failed to decrypt the legacy. Most likely, you need to wait until more keepers `+
        `submit their keys. And check that the private key you pasted here is correct.`)
      return
    } else {
      print(`Failed to decrypt the legacy. Most likely, the private key you pasted here is not `
        + `correct, please check it one more time. Also, it might be that you need to wait until `
        + `more keepers submit their keys.`)
      return
    }
  }

  print('\nTrying to decrypt...\n')
  print(Buffer.from(legacy.substring(2), 'hex').toString('utf8'))
}
