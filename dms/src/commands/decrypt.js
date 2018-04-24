export const command = 'decrypt <contract>'

export const desc = 'Decrypt the legacy'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contract', {
    desc: 'Contract ID or address'
  })

// Implementation

import ora from 'ora'

import getContractInstance from '../utils/get-contract-instance'
import {decryptData} from '../utils/encryption'
import {States, assembleEncryptedDataStruct} from '../utils/contract-api'
import keepersRequiredForRecovery from '../utils/keepers-required-for-recovery'
import {question, print} from '../utils/print'
import toNumber from '../utils/to-number'
import runCommand from '../utils/run-command'

export function handler(argv) {
  return runCommand(() => decrypt(argv.contract))
}

async function decrypt(contractAddressOrID) {
  // TODO: ensure json rpc is running

  print(`Welcome to KeeperNet v2!\n`)

  const spinner = ora('Reading contract...').start()
  const instance = await getContractInstance(contractAddressOrID)

  const [state, encryptedDataRaw, suppliedKeyPartsCount, keepersCount] = await Promise.all([
    toNumber(instance.state()),
    instance.encryptedData(),
    toNumber(instance.getNumSuppliedKeyParts()),
    toNumber(instance.getNumKeepers()),
  ])

  if (state !== States.CallForKeys) {
    spinner.info(`Contract can't be decrypted yet.`)
    return
  }

  spinner.succeed(`Contract is in "ready for decryption" state.`)
  spinner.start(`Obtaining decryption key parts...`)

  const requiredForRecovery = keepersRequiredForRecovery(keepersCount)

  let suppliedKeyParts = []
  for (let i = 0; i < suppliedKeyPartsCount; ++i) {
    suppliedKeyParts.push(instance.getSuppliedKeyPart(i))
  }

  suppliedKeyParts = await Promise.all(suppliedKeyParts)

  spinner.succeed(
    `${suppliedKeyPartsCount} of ${keepersCount} decryption keys submitted by keepers.`,
  )

  console.log()

  if (suppliedKeyPartsCount === 0) {
    print(
      `None of the keepers submitted decryption keys yet. Please wait a little ` +
        `and try again later.`,
    )
    return
  }

  const data = assembleEncryptedDataStruct(encryptedDataRaw)
  const privateKey = await question(`Enter the private key you received from message sender:`)

  console.log()
  spinner.start(`Decrypting data...`)

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
    spinner.fail(`Failed to decrypt the data.`)

    if (suppliedKeyPartsCount === keepersCount) {
      print(`\nThe private key you pasted here is not correct, please check it one more time.`)
    } else if (suppliedKeyPartsCount < requiredForRecovery) {
      print(
        `\nMost likely, you need to wait until more keepers submit their keys. ` +
          `Also, check that the private key you pasted here is correct.`,
      )
    } else {
      print(
        `\nMost likely, the private key you pasted here is not correct, please check it ` +
          `one more time. Also, it might be that you need to wait until more keepers ` +
          `submit their keys.`,
      )
    }

    return
  }

  spinner.succeed(`Successfully decrypted data!`)
  console.log()

  console.log(Buffer.from(legacy.substring(2), 'hex').toString('utf8'))
}
