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
import ora from 'ora'
import inquirer from 'inquirer'
import moment from 'moment'

import runCommand from '../utils/run-command'
import {generateKeyPair, checkLegacySha3} from '../utils/encryption'
import {getGasPrice, contractTx} from '../utils/tx'
import {getBalance} from '../utils/web3'
import {formatWei} from '../utils/format'

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
  const address = await printWelcomeAndUnlockAccount()
  const legacyData = await readLegacyData(pathToFile)

  print(
    `You are starting a process of keeper rotation. Please do not interrrupt ` +
      `the execution of this command, keeper rotation procedure is a very ` +
      `sensitive process, so wait until the program will exit. If the program ` +
      `execution is interrupted, please contact support.\n`,
  )

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

  print('Waiting for keepers...')

  // const bobPrivate = await askForBobPrivate()
  // console.log('bobPrivate', bobPrivate)

  // -----------------------------------

  // activate new contract

  await cancelContract(depricatedInstance, address)
  // in the future we need to check contract chain to ensure that we don;t have several contract in active state

  print(
    `You have successfully re-deployed and replace a set of keepers in the legacy contract. ` +
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

async function cancelContract(instance, address) {
  print('')

  const cancelSpinner = ora('Cancelling previous contract...').start()

  const [state, lastOwnerCheckInAt, checkInIntervalInSec, checkInPrice] = [
    (await instance.state()).toNumber(),
    (await instance.lastOwnerCheckInAt()).toNumber(),
    (await instance.checkInInterval()).toNumber(),
    await instance.calculateApproximateCheckInPrice(),
  ]

  if (state === States.Active) {
    const checkInDueDate = moment.unix(lastOwnerCheckInAt + checkInIntervalInSec)
    const isCheckInOnTime = moment().isSameOrBefore(checkInDueDate)

    if (!isCheckInOnTime) {
      console.error(`Sorry, you have missed check-in due date. Cancelling contract isn't possible`)
      console.error(`Bob now can decrypt the legacy.`)
      return
    }
  }

  const cancelPrice = state === States.Active ? checkInPrice : 0

  const txResult = await contractTx(instance, 'cancel', {
    from: address,
    value: cancelPrice,
    approveFee: (gas, gasPrice) => {
      const checkInDuration = moment
        .duration(checkInIntervalInSec, 's')
        .humanize()
        .replace(/^a /, '')
      const txFee = gas.times(gasPrice)
      const combinedFee = txFee.plus(cancelPrice)

      const actualBalance = getBalance(address)
      const difference = actualBalance.minus(combinedFee)

      if (difference.lessThan(0)) {
        print(
          `\nCouldn't cancel contract due to low balance.\n` +
            `  Cancelling will cost you ${formatWei(combinedFee)}\n` +
            `  and you've got only ${formatWei(actualBalance)}.\n` +
            `  Please, add ${formatWei(difference.abs())} to your account and try again.`,
        )
        return false
      }

      return true
    },
  })

  cancelSpinner.succeed(`Previous contract has been canceled`)

  print('')

  if (txResult) {
    print(`Done! Transaction hash: ${txResult.txHash}`)
    print(`Paid for transaction: ${formatWei(txResult.txPriceWei)}`)
  }

  print('')
}
