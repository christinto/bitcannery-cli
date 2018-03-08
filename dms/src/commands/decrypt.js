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

  const [state, encryptedDataRaw, suppliedKeyPartsCount] = [
    (await instance.state()).toNumber(),
    await instance.encryptedData(),
    (await instance.getNumSuppliedKeyParts()).toNumber(),
  ]

  // TODO: in case when supplied keys number is small
  // in comparison with keepers number display a warning
  if (state !== States.CallForKeys) {
    console.error(`Contract can't be decrypted yet`)
    return
  }

  console.error(`Welcome to KeeperNet v2! Contract is in "ready for decryption" state.`)

  let suppliedKeyParts = []
  for (let i = 0; i < suppliedKeyPartsCount; ++i) {
    suppliedKeyParts.push(instance.getSuppliedKeyPart(i))
  }

  suppliedKeyParts = await Promise.all(suppliedKeyParts)

  const data = assembleEncryptedDataStruct(encryptedDataRaw)
  const privateKey = readlineSync.question(`To decrypt a contract enter your private key: `)

  const legacy = await decryptData(
    data.encryptedData,
    data.dataHash,
    privateKey,
    suppliedKeyParts,
    data.shareLength,
    data.aesCounter,
  )

  if (legacy === null) {
    console.error(`Failed to decrypt the legacy.`)
    console.error(`Please make sure that enough keepers have supplied`)
    console.error(`their keys and double check your private key.`)
    return
  }

  console.error('\nTrying to decrypt...\n')
  console.error(Buffer.from(legacy.substring(2), 'hex').toString('utf8'))
}
