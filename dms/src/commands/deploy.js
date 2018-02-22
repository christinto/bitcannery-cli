export const command = 'deploy <path-to-file>'

export const desc = 'Start new legacy contract'

// prettier-ignore
export const builder = yargs => yargs
  .positional('pathToFile', {
    desc: 'Path to file to encrypt',
    normalize: true,
  })
  .option('c', {
    alias: 'continueId',
    default: null,
    describe: 'Contract ID or address to continue deploy',
    type: 'string'
  })

// Implementation

import yn from 'yn'
import inquirer from 'inquirer'
import moment from 'moment'
import dockerNames from 'docker-names'
import BigNumber from 'bignumber.js'

import {printWelcomeAndUnlockAccount} from '../contract-utils/common'
import {readLegacyData, deployAndRegisterLegacyContract} from '../contract-utils/deploy'
import {waitForKeepers, activateContract} from '../contract-utils/call-for-keepers'

import runCommand from '../utils/run-command'
import getContractAPIs from '../utils/get-contract-apis'
import {generateKeyPair} from '../utils/encryption'
import {getGasPrice} from '../utils/tx'
import print from '../utils/print'
import getContractInstance from '../utils/get-contract-instance'

import {
  MIN_CHECKIN_INTERVAL_IN_DAYS,
  MAX_CHECKIN_INTERVAL_IN_DAYS,
  DEFAULT_KEEPERS_NUMBER,
} from '../constants'

export function handler(argv) {
  return runCommand(() => {
    if (argv.continueId) {
      continueDeploy(argv.continueId, argv.pathToFile)
    } else {
      deploy(argv.pathToFile)
    }
  })
}

async function deploy(pathToFile) {
  const address = await printWelcomeAndUnlockAccount()

  print(
    `You are about to deploy a new contract. Legacy data will ` +
      `be taken from the provided file, and encrypted with Bob's private key ` +
      `the first time, and with shared secret the second time. The shared secret ` +
      `will be split into parts and distributed among multiple keepers.\n`,
  )

  const legacyData = await readLegacyData(pathToFile)
  const {LegacyContract, registry} = await getContractAPIs()

  const contractId = await obtainNewContractName(registry)

  const checkInInterval = await askForCheckinInterval()
  const checkInIntervalInSec = Number(checkInInterval) * 24 * 60 * 60

  const gasPrice = await getGasPrice()
  const legacyContract = await deployAndRegisterLegacyContract(
    contractId,
    checkInIntervalInSec,
    address,
    gasPrice,
  )

  print(
    `Contract "${contractId}" has been deployed to the network. Contract address is ${address}. ` +
      `You have to wait until the keepers send their proposals with price for keeping the legacy, ` +
      `it will take some time. It's not necessary to keep this terminal session opened, ` +
      `you can always continue the deployment process with following command: \n\n` +
      `  node index.js deploy ${pathToFile} -c ${contractId}\n`,
  )

  const selectedProposalIndices = await waitForKeepers(
    legacyContract,
    DEFAULT_KEEPERS_NUMBER + 1,
    DEFAULT_KEEPERS_NUMBER,
  )

  const {privateKey, publicKey} = generateKeyPair()

  await activateContract(
    legacyContract,
    selectedProposalIndices,
    publicKey,
    address,
    gasPrice,
    legacyData,
  )

  print(
    `\nHere is Bob's key pair. You must send the private key to Bob using secure channel. If you ` +
      `don't give it to Bob, he won't be able to decrypt the data. If you transfer it ` +
      `using non-secure channel, anyone will be able to decrypt the data.\n\n` +
      `Bob's private key:\n` +
      `${privateKey}\n\n` +
      `Bob's public key:\n` +
      `${publicKey}\n\n` +
      `Please store Bob's public key and the legacy text securely, ` +
      `this will be required in case of keeper rotation procedure.\n\n` +
      `You have to perform check-ins on time otherwise Bob can decrypt the legacy. ` +
      `Please use the following command to perform check-in: \n\n` +
      `  node index.js checkin ${contractId}\n`,
  )

  print(
    'The next check-in due date: ' +
      moment()
        .add(checkInIntervalInSec, 's')
        .format('DD MMM YYYY'),
  )
}

async function continueDeploy(contractAddressOrID, pathToFile) {
  const address = await printWelcomeAndUnlockAccount()
  const legacyData = await readLegacyData(pathToFile)

  const legacyContract = await getContractInstance(contractAddressOrID)

  print(`Current account address: ${address}`)

  const gasPrice = await getGasPrice()
  let [state, owner] = [(await legacyContract.state()).toNumber(), await legacyContract.owner()]

  if (state !== 0) {
    print(`\nYou can continue deploy for contract in "CallForKeepers" state only`)
    return
  }

  if (owner !== address) {
    print(`\nOnly contract owner can perform check-in`)
    return
  }

  print(`You've been identified as the contract owner.\n`)

  const selectedProposalIndices = await waitForKeepers(
    legacyContract,
    DEFAULT_KEEPERS_NUMBER + 1,
    DEFAULT_KEEPERS_NUMBER,
  )

  const {privateKey, publicKey} = generateKeyPair()

  print(`\nBob's private key: ${privateKey}\n`)

  await activateContract(
    legacyContract,
    selectedProposalIndices,
    publicKey,
    address,
    gasPrice,
    legacyData,
  )

  print(
    `\n` +
      `You must send the key to Bob using secure channel. If you ` +
      `don't give it to Bob, he won't be able to decrypt the data. If you transfer it ` +
      `using non-secure channel, anyone will be able to decrypt the data. Bob's private key:\n\n` +
      `${privateKey}\n\n` +
      `Please store Bob's key pair and the legacy text securely, \n` +
      `this will be required in case of keeper rotation procedure. \n` +
      `You have to perform check-ins on time otherwise Bob can decrypt the legacy. ` +
      `Please use the following command to perform check-in: \n\n` +
      `  node index.js checkin ${contractAddressOrID}\n`,
  )

  const checkInIntervalInSec = await legacyContract.checkInInterval().then(x => x.toNumber())

  print(
    'The next check-in due date: ' +
      moment()
        .add(checkInIntervalInSec, 's')
        .format('DD MMM YYYY'),
  )
}

async function obtainNewContractName(registry) {
  while (true) {
    let name = await obtainRandomName(registry)

    console.error(`The automatically-generated random name for this contract is "${name}". `)

    const useRandomName = await inquirer
      .prompt([
        {
          type: 'input',
          name: 'useRandomName',
          message: `Do you want to use it? (Y/n)`,
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
      .then(input => yn(input['useRandomName']))

    if (useRandomName) {
      return name
    }

    name = await inquirer
      .prompt([
        {
          type: 'input',
          name: 'name',
          message: `Please enter name for this contract (enter "g" to generate new random name)`,
          prefix: '',
          validate: input => {
            if (!isValidName(input) || input.length === 0) {
              return `Name should be alphanumeric without spaces, "-" and "_" are allowed`
            }

            return true
          },
        },
      ])
      .then(x => x['name'])

    if (name === 'g') {
      continue
    }

    while (!await isUnique(name, registry)) {
      console.error()

      name = await inquirer
        .prompt([
          {
            type: 'input',
            name: 'name',
            message: `Please enter another name (enter "g" to generate new random name)`,
            prefix: '',
            validate: input => {
              if (!isValidName(input)) {
                return `Name should be alphanumeric without spaces, "-" and "_" are allowed`
              }

              return true
            },
          },
        ])
        .then(x => x['name'])

      if (name === 'g') {
        break
      }
    }

    if (name !== 'g') {
      return name
    }
  }
}

async function askForCheckinInterval() {
  const CHECKIN_INTERVAL_QUESTION_ID = 'CHECKIN_INTERVAL_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: CHECKIN_INTERVAL_QUESTION_ID,
        message: 'Please specify check-in interval in days (30 is recommended)',
        prefix: '',
        validate: input => {
          const value = Number(input)

          if (!value) {
            return `Passed value is not a number, please enter the valid number`
          }
          if (value <= 0) {
            return `You are kidding me, you've provided a negative number`
          }
          if (value < MIN_CHECKIN_INTERVAL_IN_DAYS) {
            return `Check-in interval should be a number in range between [${MIN_CHECKIN_INTERVAL_IN_DAYS}..${MAX_CHECKIN_INTERVAL_IN_DAYS}]`
          }
          if (value > MAX_CHECKIN_INTERVAL_IN_DAYS) {
            return `Check-in interval should be a number in range between [${MIN_CHECKIN_INTERVAL_IN_DAYS}..${MAX_CHECKIN_INTERVAL_IN_DAYS}]`
          }

          return true
        },
      },
    ])
    .then(x => x[CHECKIN_INTERVAL_QUESTION_ID])
}

async function obtainRandomName(registry) {
  let name = getRandomName()
  while (!await isUnique(name, registry)) {
    name = getRandomName()
  }
  return name
}

function getRandomName() {
  return dockerNames.getRandomName() + '_' + Math.floor(Math.random() * 99 + 1)
}

function isValidName(str) {
  const notAllowedSymbols = /[^a-z\d-_]/i
  return !notAllowedSymbols.test(str)
}

async function isUnique(name, registry) {
  const address = await registry.getContractAddress(name)
  return new BigNumber(address).isZero()
}
