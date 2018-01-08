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

import moment from 'moment'
import assert from 'assert'
import dockerNames from 'docker-names'
import BigNumber from 'bignumber.js'
import readlineSync from 'readline-sync'

import runCommand from '../utils/run-command'
import getContractAPIs from '../utils/get-contract-apis'
import unlockAccount from '../utils/unlock-account'
import {generateKeyPair, encryptData} from '../utils/encryption'
import {States, fetchKeeperProposals} from '../utils/contract-api'
import {formatWei} from '../utils/format'
import {contractTx, getBlockGasLimit, getGasPrice} from '../utils/tx'
import readFile from '../utils/read-file'
import delay from '../utils/delay'
import print, {question, ynQuestion} from '../utils/print'
import getContractInstance from '../utils/get-contract-instance'
import UserError from '../utils/user-error'

const MIN_CHECKIN_INTERVAL_IN_DAYS = 1 / (60 * 24) // 1 min
const MAX_CHECKIN_INTERVAL_IN_DAYS = 365 * 3 // 3 years

const MIN_KEEPERS_NUMBER = 3
const MAX_KEEPERS_NUMBER = 127

export function handler(argv) {
  return runCommand(() => {
    if (argv.continueId) {
      waitForKeepers(argv.continueId, argv.pathToFile)
    } else {
      deploy(argv.pathToFile)
    }
  })
}

async function deploy(pathToFile) {
  print('Welcome to KeeperNet v2!\n')

  const fileContent = await readFile(pathToFile)
  const legacyData = '0x' + fileContent.toString('hex')

  const address = await unlockAccount()

  print(`Address ${address} will be used to create a new contract.`)

  const {LegacyContract, registry} = await getContractAPIs()
  const contractId = await obtainNewContractName(registry)

  const checkInInterval = readlineSync.question('Please specify check-in interval in days (30): ', {
    limit: input => {
      const value = Number(input)
      return value && value >= MIN_CHECKIN_INTERVAL_IN_DAYS && value <= MAX_CHECKIN_INTERVAL_IN_DAYS
    },
    limitMessage: `Check-in interval should be a number in range between [${MIN_CHECKIN_INTERVAL_IN_DAYS}..${MAX_CHECKIN_INTERVAL_IN_DAYS}].`,
  })

  const checkInIntervalInSec = Number(checkInInterval) * 24 * 60 * 60

  print(`Check-in every ${checkInInterval} days.\n`)

  const numberOfKeepers = readlineSync.question('Set the number of keepers (12): ', {
    limit: input => {
      const value = Number(input)
      return value && value >= MIN_KEEPERS_NUMBER && value <= MAX_KEEPERS_NUMBER
    },
    limitMessage: `Keepers number should be an integer in range between [${MIN_KEEPERS_NUMBER}..${MAX_KEEPERS_NUMBER}].`,
  })

  print(
    `Your contract will be secured by ${numberOfKeepers} keepers\n\n` +
      `Publishing a new contract...`,
  )

  const [blockGasLimit, gasPrice] = [await getBlockGasLimit(), await getGasPrice()]

  const instance = await LegacyContract.new(checkInIntervalInSec, {
    from: address,
    gas: blockGasLimit, // TODO: estimate gas usage
    gasPrice: gasPrice,
  })

  print(
    `Contract is published.\n` +
      `Contract address is ${instance.address}\n\n` +
      `Registering contract...`,
  )

  const registerTxResult = await contractTx(registry, 'addContract', contractId, instance.address, {
    from: address,
  })

  print(
    `Done! Transaction hash: ${registerTxResult.txHash}\n` +
      `Paid for transaction: ${formatWei(registerTxResult.txPriceWei)}\n\n` +
      `System is calling for keepers, this might take some time...\n`,
  )

  let numKeepersProposals = (await instance.getNumProposals()).toNumber()
  let currentKeepersProposals = numKeepersProposals

  while (numKeepersProposals < numberOfKeepers) {
    numKeepersProposals = (await instance.getNumProposals()).toNumber()
    if (numKeepersProposals > currentKeepersProposals) {
      print(`${numKeepersProposals} keepers have joined...`)
      currentKeepersProposals = numKeepersProposals
    }
    if (numKeepersProposals < numberOfKeepers) {
      await delay(1000)
    }
  }

  let selectedProposalIndices = []
  for (let i = 0; i < numberOfKeepers; ++i) {
    selectedProposalIndices.push(i)
  }

  const activationPrice = await instance.calculateActivationPrice(selectedProposalIndices)
  const doActivate = ynQuestion(
    `\nYou have enough keepers now.\n` +
      `You will pay ${formatWei(activationPrice)} for each check-in interval. ` +
      `Do you want to activate the contract?`,
  )

  if (!doActivate) {
    return
  }

  const {privateKey, publicKey} = generateKeyPair()

  print(
    `\nGenerated Bob's private key. You must send it to Bob using secure channel. If you ` +
      `don't give it to Bob, he won't be able to decrypt the data. If you transfer it ` +
      `using non-secure channel, anyone will be able to decrypt the data:\n\n` +
      `${privateKey}\n`,
  )

  const proposals = await fetchKeeperProposals(instance)
  const selectedProposals = selectedProposalIndices.map(i => proposals[i])
  const keeperPublicKeys = selectedProposals.map(p => p.publicKey)
  const numKeepersToRecover = Math.max(Math.floor(selectedProposals.length * 2 / 3), 2)

  // console.error(`keeperPublicKeys:`, keeperPublicKeys)
  // console.error(`numKeepersToRecover:`, numKeepersToRecover)

  const encryptionResult = await encryptData(
    legacyData,
    publicKey,
    keeperPublicKeys,
    numKeepersToRecover,
  )

  // console.error('encryptionResult:', encryptionResult)

  print(`Activating contract...`)

  const acceptTxResult = await contractTx(
    instance,
    'acceptKeepers',
    selectedProposalIndices,
    encryptionResult.keyPartHashes,
    encryptionResult.encryptedKeyParts,
    encryptionResult.shareLength,
    encryptionResult.encryptedLegacyData,
    encryptionResult.legacyDataHash,
    encryptionResult.aesCounter,
    {from: address, value: activationPrice},
  )

  print(
    `Done! Transaction hash: ${acceptTxResult.txHash}\n` +
      `Paid for transaction: ${formatWei(acceptTxResult.txPriceWei)}`,
  )

  const state = await instance.state()
  assert.equal(state.toNumber(), States.Active)

  print(
    `\nSee you next time!\n` +
      'The next check-in: ' +
      moment()
        .add(checkInIntervalInSec, 's')
        .fromNow(),
  )
}

async function waitForKeepers(contractAddressOrID, pathToFile) {
  const fileContent = await readFile(pathToFile)
  const legacyData = '0x' + fileContent.toString('hex')

  const address = await unlockAccount()

  print(`Current account address: ${address}`)

  if (contractAddressOrID === null) {
    console.error('Please select a contract to continue deploy:')
    contractAddressOrID = await selectContract()
  }

  const instance = await getContractInstance(contractAddressOrID)
  let [state, owner] = [(await instance.state()).toNumber(), await instance.owner()]

  if (owner !== address) {
    console.error(`Only contract owner can perform check-in`)
    return
  }

  print(`You've been identified as the contract owner.`)

  let numKeepersProposals = (await instance.getNumProposals()).toNumber()
  let currentKeepersProposals = numKeepersProposals

  print(`${numKeepersProposals} keepers already joined\n`)

  const numberOfKeepers = readlineSync.question('Set the number of keepers (12): ', {
    limit: input => {
      const value = Number(input)
      return value && value >= MIN_KEEPERS_NUMBER && value <= MAX_KEEPERS_NUMBER
    },
    limitMessage: `Keepers number should be an integer in range between [${MIN_KEEPERS_NUMBER}..${MAX_KEEPERS_NUMBER}].`,
  })

  print(
    `Your contract will be secured by ${numberOfKeepers} keepers\n` +
      `System is calling for keepers, this might take some time...\n`,
  )

  while (numKeepersProposals < numberOfKeepers) {
    numKeepersProposals = (await instance.getNumProposals()).toNumber()
    if (numKeepersProposals > currentKeepersProposals) {
      print(`${numKeepersProposals} keepers have joined...`)
      currentKeepersProposals = numKeepersProposals
    }
    if (numKeepersProposals < numberOfKeepers) {
      await delay(1000)
    }
  }

  let selectedProposalIndices = []
  for (let i = 0; i < numberOfKeepers; ++i) {
    selectedProposalIndices.push(i)
  }

  const activationPrice = await instance.calculateActivationPrice(selectedProposalIndices)
  const doActivate = ynQuestion(
    `\nYou have enough keepers now.\n` +
      `You will pay ${formatWei(activationPrice)} for each check-in interval. ` +
      `Do you want to activate the contract?`,
  )

  if (!doActivate) {
    return
  }

  const {privateKey, publicKey} = generateKeyPair()

  print(
    `\nGenerated Bob's private key. You must send it to Bob using secure channel. If you ` +
      `don't give it to Bob, he won't be able to decrypt the data. If you transfer it ` +
      `using non-secure channel, anyone will be able to decrypt the data:\n\n` +
      `${privateKey}\n`,
  )

  const proposals = await fetchKeeperProposals(instance)
  const selectedProposals = selectedProposalIndices.map(i => proposals[i])
  const keeperPublicKeys = selectedProposals.map(p => p.publicKey)
  const numKeepersToRecover = Math.max(Math.floor(selectedProposals.length * 2 / 3), 2)

  const encryptionResult = await encryptData(
    legacyData,
    publicKey,
    keeperPublicKeys,
    numKeepersToRecover,
  )

  print(`Activating contract...`)

  const acceptTxResult = await contractTx(
    instance,
    'acceptKeepers',
    selectedProposalIndices,
    encryptionResult.keyPartHashes,
    encryptionResult.encryptedKeyParts,
    encryptionResult.shareLength,
    encryptionResult.encryptedLegacyData,
    encryptionResult.legacyDataHash,
    encryptionResult.aesCounter,
    {from: address, value: activationPrice},
  )

  print(
    `Done! Transaction hash: ${acceptTxResult.txHash}\n` +
      `Paid for transaction: ${formatWei(acceptTxResult.txPriceWei)}`,
  )

  state = await instance.state()
  assert.equal(state.toNumber(), States.Active)

  const checkInIntervalInSec = (await instance.checkInInterval()).toNumber()

  print(
    `\nSee you next time!\n` +
      'The next check-in: ' +
      moment()
        .add(checkInIntervalInSec, 's')
        .fromNow(),
  )
}

async function obtainNewContractName(registry) {
  while (true) {
    console.error()

    let name = await obtainRandomName(registry)
    const useRandomName = ynQuestion(
      `The automatically-generated random name for this contract is "${name}". ` +
        `Do you want to use it?`,
    )
    if (useRandomName) {
      return name
    }

    console.error()

    name = question.demandAnswer(
      `Please enter name for this contract (enter "g" to generate new random name):`,
    )
    if (name === 'g') {
      continue
    }

    while (!await isUnique(name, registry)) {
      console.error()
      name = question.demandAnswer(
        `Unfortunately, there is already a contract with this name in the system. ` +
          `Please enter another name (enter "g" to generate new random name):`,
      )
      if (name === 'g') {
        break
      }
    }

    if (name !== 'g') {
      return name
    }
  }
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

async function isUnique(name, registry) {
  const address = await registry.getContractAddress(name)
  return new BigNumber(address).isZero()
}
