import fs from 'fs'
import assert from 'assert'
import yn from 'yn'
import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import unlockAccount from '../utils/unlock-account'
import {generateKeyPair, encryptData} from '../utils/encryption'
import {States, assembleProposalStruct} from '../utils/contract-api'
import {formatWei} from '../utils/format'
import tx from '../utils/tx'

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

export async function handler(argv) {
  console.error('Welcome to KeeperNet v2!')

  const fileContent = await readFile(argv.file)
  const legacyData = '0x' + fileContent.toString('hex')

  const address = await unlockAccount()
  console.error(`Address ${address} will be`)
  console.error(`used to create a new contract.`)
  console.error(`Generated Bob's private key... (you must give it to Bob)`)

  const {privateKey, publicKey} = generateKeyPair()

  console.error(privateKey, '\n')
  console.error(`Check-in every ${CHECKIN_INTERVAL_SEC / 60} minutes`)
  console.error(`Your contract will be secured by ${NUM_KEEPERS} keepers`)
  console.error(`Publishing a new contract...`)

  const LegacyContract = await getContractClass()
  const instance = await LegacyContract.new(CHECKIN_INTERVAL_SEC, {
    from: address,
    gas: GAS_HARD_LIMIT,
  })

  console.error(`Contract is published.`)
  console.error(`Contract address is ${instance.address}`)
  console.error(`System is calling for keepers, this might take some time...`)

  let numKeepersProposals = (await instance.getNumProposals()).toNumber()
  let currentKeepersProposals = numKeepersProposals

  while (numKeepersProposals < NUM_KEEPERS) {
    numKeepersProposals = (await instance.getNumProposals()).toNumber()
    if (numKeepersProposals > currentKeepersProposals) {
      console.error(`${numKeepersProposals} keepers have joined...`)
      currentKeepersProposals = numKeepersProposals
    }
    if (numKeepersProposals < NUM_KEEPERS) {
      await delay(1000)
    }
  }

  console.error(`You have enough keepers now. Do you want to activate the contract?`)

  let selectedProposalIndices = []
  for (let i = 0; i < NUM_KEEPERS; ++i) {
    selectedProposalIndices.push(i)
  }

  const activationPrice = await instance.calculateActivationPrice(selectedProposalIndices)
  const doYouWantToPay = readlineSync.question(
    `You will pay ${formatWei(activationPrice)} for each check-in interval [Y/n] `,
  )

  if (!yn(doYouWantToPay)) {
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
    numKeepersToRecover,
  )

  // console.error('encryptionResult:', encryptionResult)

  console.error(`Activating contract...`)

  const {txHash, txPriceWei} = await tx(
    instance.acceptKeepers(
      selectedProposalIndices,
      encryptionResult.keyPartHashes,
      encryptionResult.encryptedKeyParts,
      encryptionResult.encryptedLegacyData,
      encryptionResult.legacyDataHash,
      encryptionResult.aesCounter,
      {
        from: address,
        gas: GAS_HARD_LIMIT, // TODO: estimate gas usage
        value: activationPrice,
      },
    ),
  )

  console.error(`Done! Transaction hash: ${txHash}`)
  console.error(`Paid for transaction: ${formatWei(txPriceWei)}`)

  const state = await instance.state()
  assert.equal(state.toNumber(), States.Active)
}

async function fetchKeeperProposals(instance) {
  const numProposals = await instance.getNumProposals()
  const promises = new Array(+numProposals).fill(0).map((_, i) => instance.keeperProposals(i))
  return (await Promise.all(promises)).map(rawProposal => assembleProposalStruct(rawProposal))
}

async function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms))
}
