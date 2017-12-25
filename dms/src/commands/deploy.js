import assert from 'assert'
import readlineSync from 'readline-sync'
import dockerNames from 'docker-names'
import BigNumber from 'bignumber.js'

import runCommand from '../utils/run-command'
import getContractAPIs from '../utils/get-contract-apis'
import unlockAccount from '../utils/unlock-account'
import {generateKeyPair, encryptData} from '../utils/encryption'
import {States, fetchKeeperProposals} from '../utils/contract-api'
import {formatWei} from '../utils/format'
import tx from '../utils/tx'
import readFile from '../utils/read-file'
import delay from '../utils/delay'
import print, {question, ynQuestion} from '../utils/print'
import UserError from '../utils/user-error'
import {getGasPrice} from '../utils/web3'

// Fail if tx is going to take more gas than this.
//
const GAS_HARD_LIMIT = 4700000
const NUM_KEEPERS = 3
const CHECKIN_INTERVAL_SEC = 1 * 60

export const description = 'Deploy new legacy contract to blockchain'

export function yargsBuilder(yargs) {
  return yargs
    .example('$0 deploy -f <path-to-file>', 'Deploy new legacy contract')
    .alias('f', 'file')
    .nargs('f', 1)
    .describe('f', 'Specify file to encrypt')
    .demandOption(['f'])
}

export function handler(argv) {
  return runCommand(() => deploy(argv.file))
}

async function deploy(pathToFile) {
  print('Welcome to KeeperNet v2!\n')

  const fileContent = await readFile(pathToFile)
  const legacyData = '0x' + fileContent.toString('hex')

  const address = await unlockAccount()

  print(`Address ${address} will be used to create a new contract.`)

  const {LegacyContract, registry} = await getContractAPIs()
  const contractId = await obtainNewContractName(registry)

  const {privateKey, publicKey} = generateKeyPair()

  print(
    `\nGenerated Bob's private key. You must send it to Bob using secure channel. If you ` +
      `don't give it to Bob, he won't be able to decrypt the data. If you transfer it ` +
      `using non-secure channel, anyone will be able to decrypt the data:\n\n` +
      `${privateKey}\n\n` +
      `Check-in every ${CHECKIN_INTERVAL_SEC / 60} minutes.\n` +
      `Your contract will be secured by ${NUM_KEEPERS} keepers.\n\n` +
      `Publishing a new contract...`
  )

  let gasPrice = await getGasPrice()

  const instance = await LegacyContract.new(CHECKIN_INTERVAL_SEC, {
    from: address,
    gasPrice: gasPrice,
    gas: GAS_HARD_LIMIT,
  })

  print(
    `Contract is published.\n` +
      `Contract address is ${instance.address}\n\n` +
      `Registering contract...`
  )

  const registerTxResult = await tx(
    registry.addContract(contractId, instance.address, {
      from: address,
      gasPrice: gasPrice,
      gas: GAS_HARD_LIMIT,
    })
  )

  print(
    `Done! Transaction hash: ${registerTxResult.txHash}\n` +
      `Paid for transaction: ${formatWei(registerTxResult.txPriceWei)}\n\n` +
      `System is calling for keepers, this might take some time...\n`
  )

  let numKeepersProposals = (await instance.getNumProposals()).toNumber()
  let currentKeepersProposals = numKeepersProposals

  while (numKeepersProposals < NUM_KEEPERS) {
    numKeepersProposals = (await instance.getNumProposals()).toNumber()
    if (numKeepersProposals > currentKeepersProposals) {
      print(`${numKeepersProposals} keepers have joined...`)
      currentKeepersProposals = numKeepersProposals
    }
    if (numKeepersProposals < NUM_KEEPERS) {
      await delay(1000)
    }
  }

  let selectedProposalIndices = []
  for (let i = 0; i < NUM_KEEPERS; ++i) {
    selectedProposalIndices.push(i)
  }

  const activationPrice = await instance.calculateActivationPrice(selectedProposalIndices)
  const doActivate = ynQuestion(
    `\nYou have enough keepers now.\n` +
      `You will pay ${formatWei(activationPrice)} for each check-in interval. ` +
      `Do you want to activate the contract?`
  )

  if (!doActivate) {
    return
  }

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
    numKeepersToRecover
  )

  // console.error('encryptionResult:', encryptionResult)

  print(`Activating contract...`)

  gasPrice = await getGasPrice()

  const acceptTxResult = await tx(
    instance.acceptKeepers(
      selectedProposalIndices,
      encryptionResult.keyPartHashes,
      encryptionResult.encryptedKeyParts,
      encryptionResult.shareLength,
      encryptionResult.encryptedLegacyData,
      encryptionResult.legacyDataHash,
      encryptionResult.aesCounter,
      {
        from: address,
        gasPrice: gasPrice,
        gas: GAS_HARD_LIMIT,
        value: activationPrice,
      }
    )
  )

  print(
    `Done! Transaction hash: ${acceptTxResult.txHash}\n` +
      `Paid for transaction: ${formatWei(acceptTxResult.txPriceWei)}`
  )

  const state = await instance.state()
  assert.equal(state.toNumber(), States.Active)
}

async function obtainNewContractName(registry) {
  while (true) {
    console.error()

    let name = await obtainRandomName(registry)
    const useRandomName = ynQuestion(
      `The automatically-generated random name for this contract is "${name}". ` +
        `Do you want to use it?`
    )
    if (useRandomName) {
      return name
    }

    console.error()

    name = question.demandAnswer(
      `Please enter name for this contract (enter "g" to generate new random name):`
    )
    if (name === 'g') {
      continue
    }

    while (!await isUnique(name, registry)) {
      console.error()
      name = question.demandAnswer(
        `Unfortunately, there is already a contract with this name in the system. ` +
          `Please enter another name (enter "g" to generate new random name):`
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
