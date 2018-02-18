export const command = 'rotate-keepers <contractAddressOrID> <path-to-file>'

export const desc = 'Start keeper rotation procedure'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contractAddressOrID', {
    desc: 'Contract ID or address of contract',
  })
  .positional('pathToFile', {
    desc: 'Path to file with legacy to encrypt',
    normalize: true,
  })

// Implementation

import yn from 'yn'
import inquirer from 'inquirer'

import runCommand from '../utils/run-command'
import {generateKeyPair, checkLegacySha3} from '../utils/encryption'
import {getGasPrice} from '../utils/tx'

import print from '../utils/print'
import getContractInstance from '../utils/get-contract-instance'
import {States, assembleEncryptedDataStruct} from '../utils/contract-api'

import {
  printWelcomeAndUnlockAccount,
  readLegacyData,
  deployLegacyContract,
  waitForKeepers,
  activateContract,
  announceContinuationContract,
  updateAddress,
} from './deploy/utils'

export function handler(argv) {
  return runCommand(() => {
    rotateKeepers(argv.contractAddressOrID, argv.pathToFile)
  })
}

async function rotateKeepers(contractAddressOrID, pathToFile) {
  console.log('rotateKeepers', contractAddressOrID, pathToFile)

  const address = await printWelcomeAndUnlockAccount()
  const legacyData = await readLegacyData(pathToFile)

  const depricatedInstance = await getContractInstance(contractAddressOrID)

  const [state, owner, encryptedDataRaw, checkInIntervalInSec, checkInPrice] = [
    (await depricatedInstance.state()).toNumber(),
    await depricatedInstance.owner(),
    await depricatedInstance.encryptedData(),
    (await depricatedInstance.checkInInterval()).toNumber(),
    await depricatedInstance.calculateApproximateCheckInPrice(),
  ]

  if (owner !== address) {
    print(`Only contract owner can perform check-in.`)
    print(`Keeper rotation process failed.`)
    return
  }

  print(`You've been identified as the contract owner.`)

  if (state !== States.Active) {
    print(`It's possible to perform rotation only for a contract in Active state.`)
    print(`Keeper rotation process failed.`)
    return
  }

  const data = assembleEncryptedDataStruct(encryptedDataRaw)

  if (!checkLegacySha3(legacyData, data.dataHash)) {
    print(`Legacy data from file and contract's data don't match each other.`)
    print(`Keeper rotation process failed.`)
  }

  // print checkin statistics

  const confirmRotation = await confirmStartKeeperRotation()
  if (!confirmRotation) {
    return
  }

  print('')

  const gasPrice = await getGasPrice()
  const legacyContract = await deployLegacyContract(
    contractAddressOrID, // allowed performing rotation only with contractId, not contract address
    checkInIntervalInSec,
    address,
    gasPrice,
  )

  await announceContinuationContract(depricatedInstance, legacyContract.address, address, gasPrice)
  await updateAddress(contractAddressOrID, address, gasPrice)

  print('')

  print('Waiting for keepers...')

  // const bobPrivate = await askForBobPrivate()
  // console.log('bobPrivate', bobPrivate)

  // -----------------------------------

  // finally we are updateAddress in Registry
  // activate new contract
  // cancel depricated one

  // in the future we need to check contract chain to ensure that we don;t have several contract in active state
}

async function askForBobPrivate() {
  const ASK_BOBS_PRIVATE_KEY_QUESTION_ID = 'ASK_BOBS_PRIVATE_KEY_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: ASK_BOBS_PRIVATE_KEY_QUESTION_ID,
        message: `To perform keeper rotation please input Bob's private key`,
        prefix: '',
        validate: input => {
          if (input.substring(0, 2) !== '0x' || input.length !== 66) {
            return `Passed key shoud be 0x string 66 characters long`
          }

          return true
        },
      },
    ])
    .then(x => x[ASK_BOBS_PRIVATE_KEY_QUESTION_ID])
}

async function confirmStartKeeperRotation() {
  const CONFIRM_ROTATION_QUESTION_ID = 'CONFIRM_ROTATION_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: CONFIRM_ROTATION_QUESTION_ID,
        message: `Do you want to start rotation procedure (Y/n)`,
        prefix: '',
        validate: input => {
          const value = yn(input)

          if (value == null) {
            return `Please type 'y', 'n', 'yes' or 'no'`
          }

          return true
        },
      },
    ])
    .then(input => yn(input[CONFIRM_ROTATION_QUESTION_ID]))
}
