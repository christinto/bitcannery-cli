import assert from 'assert'
import yn from 'yn'
import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import unlockAccount from '../utils/unlock-account'
import {generateKeyPair, encryptData} from '../utils/encryption'
import {States, assembleProposalStruct} from '../utils/contract-api'
import {formatWei} from '../utils/format'
import tx from '../utils/tx'

function delay(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms))
}

// Fail if tx is going to take more gas than this.
//
const GAS_HARD_LIMIT = 4700000
const NUM_KEEPERS = 2

export const description = 'Deploy new legacy contract to blockchain'

export function yargsBuilder(yargs) {
  return yargs
}

export async function handler() {
  console.log('Welcome to KeeperNet v2! Geth Ethereum client is detected.')

  const address = await unlockAccount()
  console.log(`Address ${address} will be`)
  console.log(`used to create a new contract.`)
  console.log(`Generated Bob's private key... (you must give it to Bob)`)

  const {privateKey, publicKey} = generateKeyPair()

  console.log(privateKey, '\n')
  console.log(`Check-in every 5 min`)
  console.log(`Your contract will be secured by 2 keepers`)
  console.log(`Publishing a new contract...`)

  const LegacyContract = await getContractClass()

  // const instance = await LegacyContract.at('0x0acaae5009e4b5431e575aa00985df045dd4acad')
  const instance = await LegacyContract.new(1 * 60 * 60, {from: address, gas: GAS_HARD_LIMIT})

  console.log(`Contract is published.`)
  console.log(`Contract address is ${instance.address}`)
  console.log(`System is calling for keepers, this might take some time...`)

  let numKeepersProposals = (await instance.getNumProposals()).toNumber()
  let currentKeepersProposals = numKeepersProposals

  while (numKeepersProposals < NUM_KEEPERS) {
    numKeepersProposals = (await instance.getNumProposals()).toNumber()
    if (numKeepersProposals > currentKeepersProposals) {
      console.log(`${numKeepersProposals} keepers have joined...`)
      currentKeepersProposals = numKeepersProposals
    }
    if (numKeepersProposals < NUM_KEEPERS) {
      await delay(1000)
    }
  }

  console.log(`You have enough keepers now. Do you want to activate the contract?`)

  const selectedProposalIndices = [0, 1] // TODO: remove hardcode

  const activationPrice = await instance.calculateActivationPrice(selectedProposalIndices)
  const doYouWantToPay = readlineSync.question(
    `You will pay ${formatWei(activationPrice)} for each check-in interval [Y/n] `,
  )

  if (!yn(doYouWantToPay)) {
    return
  }

  const proposals = await fetchKeeperProposals(instance)
  console.log('proposals:', proposals)
  const selectedProposals = selectedProposalIndices.map(i => proposals[i])
  console.log('selectedProposals:', selectedProposals)
  const keeperPublicKeys = selectedProposals.map(p => p.publicKey)
  const numKeepersToRecover = Math.max(Math.floor(selectedProposals.length * 2 / 3), 2)

  console.log(`keeperPublicKeys:`, keeperPublicKeys)
  console.log(`numKeepersToRecover:`, numKeepersToRecover)

  const encryptionResult = await encryptData(
    '0x' + Buffer.from('test message').toString('hex'),
    publicKey,
    keeperPublicKeys,
    numKeepersToRecover,
  )

  console.log('encryptionResult:', encryptionResult)

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
