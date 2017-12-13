import yn from 'yn'
import readlineSync from 'readline-sync'

import getContractClass from '../utils/get-contract-class'
import unlockAccount from '../utils/unlock-account'
import {generateKeyPair, encryptData} from '../utils/encryption'
import {assembleProposalStruct} from '../utils/contract-api'

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
  const instance = await LegacyContract.new(2 * 60 * 60, {from: address, gas: GAS_HARD_LIMIT})

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
  const doYouWantToPay = readlineSync.question('You will pay 0.25 ETH [Y/n] ')

  if (!yn(doYouWantToPay)) {
    return
  }

  const proposals = await fetchKeeperProposals(instance)
  const numKeepersToRecover = Math.max(Math.floor(proposals.length * 2 / 3), 2)
  const aesCounter = 4

  const legacy = await encryptData(
    '0x' + Buffer.from('test message').toString('hex'),
    publicKey,
    [
      '0x04f57f84ac80bed4758d51bd785d3900043d0799d5d7073d3f4fb9727c76f1e813fac54ccde14f4e7fe4bbd7c0c3c6b6774a22b4da7f0d20ed96d97989e1732b3a',
      '0x0402586d0100021eedad6d27cfe923635e17de7b30c93455724a5ebcfa68a414167f6383298b78e478ccae419bcaab4985e301c1891de77330998a38e5968874a9',
    ],
    numKeepersToRecover,
    aesCounter,
  )

  const state = await contract.state()
  assert.equal(state.toNumber(), States.Active)

  console.log(legacy)
}

async function fetchKeeperProposals(instance) {
  const proposalsNumber = await instance.getNumProposals()
  const proposals = []

  for (let i = 0; i < proposalsNumber; ++i) {
    proposals.push(assembleProposalStruct(await instance.keeperProposals(i)))
  }

  return proposals
}
