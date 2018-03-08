export const command = 'rotate-keepers <contractAddressOrID>'

export const desc = 'Start keeper rotation procedure'

// prettier-ignore
export const builder = yargs => yargs
  .positional('contractAddressOrID', {
    desc: 'Contract ID or address of contract',
  })

// Implementation

import yn from 'yn'
import inquirer from 'inquirer'
import moment from 'moment'

import {printWelcomeAndUnlockAccount} from '../contract-utils/common'
import {deployLegacyContract} from '../contract-utils/deploy'
import {waitForKeepers, activateContract} from '../contract-utils/call-for-keepers'
import {announceContinuationContract, updateAddress} from '../contract-utils/keepers-rotation'
import {cancelContract} from '../contract-utils/cancel'

import runCommand from '../utils/run-command'
import {checkLegacySha3} from '../utils/encryption'
import {getGasPrice, contractTx} from '../utils/tx'
import {getBalance} from '../utils/web3'
import {formatWei} from '../utils/format'
import print, {question} from '../utils/print'
import getContractInstance from '../utils/get-contract-instance'
import {States, assembleEncryptedDataStruct} from '../utils/contract-api'

import {readContractDataStore} from '../contract-data-store'
import {DEFAULT_KEEPERS_NUMBER} from '../constants'

export function handler(argv) {
  return runCommand(() => {
    return rotateKeepers(argv.contractAddressOrID, argv.pathToFile)
  })
}

async function rotateKeepers(contractAddressOrID, pathToFile) {
  const address = await printWelcomeAndUnlockAccount()

  print(
    `You are starting a process of keeper rotation. Please do not interrrupt ` +
      `the execution of this command, keeper rotation procedure is a very ` +
      `sensitive process, so wait until the program exits. If the program ` +
      `execution is interrupted, please contact support.\n`,
  )

  const previousInstance = await getContractInstance(contractAddressOrID)

  const [state, owner, encryptedDataRaw, checkInIntervalInSec, checkInPrice] = [
    (await previousInstance.state()).toNumber(),
    await previousInstance.owner(),
    await previousInstance.encryptedData(),
    (await previousInstance.checkInInterval()).toNumber(),
    await previousInstance.calculateApproximateCheckInPrice(),
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

  const contractDataStorePassword = await question.password(
    'Please enter contract data store password:',
    true,
  )

  const contractDataStore = await readContractDataStore(contractDataStorePassword)

  let contractData = contractDataStore[contractAddressOrID]
  if (typeof contractData === 'string') {
    contractData = contractDataStore[contractData]
  }

  if (contractData == null) {
    print(
      `It seems that you have no contract data stored in your configuration file ` +
        `for this contract. Make sure you imported your configuration from different machine. ` +
        `Use "dms restore" command to restore configuration from a backup.`,
    )
    // TODO: allow specifying data manually
    return
  }

  const {legacyData, bobPublicKey} = contractData
  const data = assembleEncryptedDataStruct(encryptedDataRaw)

  if (!checkLegacySha3(legacyData, data.dataHash)) {
    print(`Legacy data from config store doesn't match the one from the deployed contract.`)
    print(`Keeper rotation process failed.`)
  }

  // TODO: print reliable keepers number

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

  await announceContinuationContract(previousInstance, legacyContract.address, address, gasPrice)
  await updateAddress(contractAddressOrID, address, gasPrice)

  print('Waiting for keepers...')

  // TODO: it is required to reselect previous alive keepers
  const selectedProposalIndices = await waitForKeepers(
    legacyContract,
    DEFAULT_KEEPERS_NUMBER + 1,
    DEFAULT_KEEPERS_NUMBER,
  )

  await activateContract(
    legacyContract,
    selectedProposalIndices,
    bobPublicKey,
    address,
    gasPrice,
    legacyData,
  )

  await cancelContract(previousInstance, address)

  // TODO: add assertion that only top contract in active state

  print(
    `You have successfully re-deployed and replaced a set of keepers in the legacy contract. ` +
      `Please use the following command to perform check-in: \n\n` +
      `  node index.js checkin ${contractAddressOrID}\n`,
  )

  print(
    'The next check-in due date: ' +
      moment()
        .add(checkInIntervalInSec, 's')
        .format('DD MMM YYYY'),
  )
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
