import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import {generateKeyPair, decryptData} from '../utils/encryption'
import {States, assembleEncryptedDataStruct} from '../utils/contract-api'

export const description = 'Decrypt the legacy'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 decrypt -c 0xf455c170ea2c42e0510a3e50625775efec89962e', 'Decrypt the legacy')
    .alias('c', 'contract')
    .nargs('c', 1)
    .describe('c', 'Specify the legacy contract')
    .demandOption(['c'])
}

export async function handler(argv) {
  // TODO: ensure json rpc running and there is legacy contract w/ address
  const LegacyContract = getContractClass()
  const instance = await LegacyContract.at(argv.contract)

  const [state, encryptedDataRaw, suppliedKeyPartsCount] = [
    (await instance.state()).toNumber(),
    await instance.encryptedData(),
    (await instance.getNumSuppliedKeyParts()).toNumber(),
  ]

  // TODO: in case when supplied keys number is small
  // in comparison with keepers number display a warning
  if (state !== States.CallForKeys) {
    console.error(`Contract can't be decrypted in this state`)
    return
  }

  console.error(`Welcome to KeeperNet v2! Contract is "ready for decryption" status.`)

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
    console.error(`Please make sure that keepers supplied required for decryption`)
    console.error(`number of keys and double check your private key.`)
    return
  }

  console.error('\nTrying to decrypt...\n')
  console.error(Buffer.from(legacy.substring(2), 'hex').toString('utf8'))
}
