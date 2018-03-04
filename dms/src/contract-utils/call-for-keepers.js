import assert from 'assert'
import ora from 'ora'
import inquirer from 'inquirer'
import yn from 'yn'
import BigNumber from 'bignumber.js'

import {contractTx} from '../utils/tx'
import delay from '../utils/delay'
import {fetchKeeperProposals} from '../utils/contract-api'
import {encryptData} from '../utils/encryption'
import packingUtils from '../utils/pack'
import {formatWei} from '../utils/format'
import print from '../utils/print'

import {MIN_KEEPERS_NUMBER, MAX_KEEPERS_IN_CHUNK} from '../constants'

export async function waitForKeepers(legacyContract, waitKeeperNumber, defaultKeeperNumber) {
  const spinner = ora('System is calling for keepers...').start()

  let numKeepersProposals = (await legacyContract.getNumProposals()).toNumber()

  while (numKeepersProposals < waitKeeperNumber) {
    await delay(500)
    numKeepersProposals = (await legacyContract.getNumProposals()).toNumber()
    spinner.text = `${numKeepersProposals} keepers have joined...`
  }

  spinner.succeed(`${numKeepersProposals} keepers have joined`)

  print('')

  let keeperProposals = await fetchKeeperProposals(legacyContract)
  let selectedProposalIndices = await pickCheapestKeepers(keeperProposals, defaultKeeperNumber)

  let activationPrice = await legacyContract.calculateActivationPrice(selectedProposalIndices)

  const isDefault = await askIsDefaultKeeperNumber(defaultKeeperNumber, activationPrice)

  if (!isDefault) {
    let confirmKeepersNumber, adjustedKeeperNumber
    while (true) {
      numKeepersProposals = (await legacyContract.getNumProposals()).toNumber()

      print(
        `\n` +
          `${numKeepersProposals} keepers joined the contract now. ` +
          `You can choose the number of keepers in range between 2 and ${numKeepersProposals}. ` +
          `If you want more keepers, just stop this terminal session and wait for a while.\n`,
      )

      adjustedKeeperNumber = await askAdjustedKeepersNumber(MIN_KEEPERS_NUMBER, numKeepersProposals)

      keeperProposals = await fetchKeeperProposals(legacyContract)
      selectedProposalIndices = await pickCheapestKeepers(keeperProposals, adjustedKeeperNumber)
      activationPrice = await legacyContract.calculateActivationPrice(selectedProposalIndices)

      confirmKeepersNumber = await confirmAdjustedKeeperNumber(
        adjustedKeeperNumber,
        activationPrice,
      )

      if (confirmKeepersNumber) {
        break
      }
    }
  }

  return selectedProposalIndices
}

export async function activateContract(
  legacyContract,
  selectedProposalIndices,
  publicKey,
  address,
  gasPrice,
  legacyData,
) {
  const activationPrice = await legacyContract.calculateActivationPrice(selectedProposalIndices)

  // TODO: pre-calculate cumulative TXes cost and confirm total activation price, like:
  //
  // Alice, activating this contract will cost you X ETH, including Ethereum network
  // fee of Y ETH. Do you want to proceed?

  const spinner = ora(`Encrypting data...`).start()

  const proposals = await fetchKeeperProposals(legacyContract)
  const selectedProposals = selectedProposalIndices.map(i => proposals[i])
  const keeperPublicKeys = selectedProposals.map(p => p.publicKey)
  const numKeepersToRecover = Math.max(Math.floor(selectedProposals.length * 2 / 3), 2)

  const encryptionResult = await encryptData(
    legacyData,
    publicKey,
    keeperPublicKeys,
    numKeepersToRecover,
  )

  const chunks = splitSelectedKeepersInChunks(
    selectedProposalIndices,
    encryptionResult.keyPartHashes,
    encryptionResult.encryptedKeyParts,
  )

  spinner.succeed(`Encrypting data`)

  let totalTxCostWei = new BigNumber(0)

  for (let i = 0; i < chunks.length; ++i) {
    const chunk = chunks[i]
    spinner.start(`Accepting keepers (chunk ${i + 1}/${chunks.length})...`)

    const acceptTxResult = await contractTx(
      legacyContract,
      'acceptKeepers',
      chunk.selectedProposalIndices,
      chunk.keyPartHashes,
      chunk.encryptedKeyParts,
      {from: address},
    )

    totalTxCostWei = totalTxCostWei.plus(acceptTxResult.txPriceWei)
    spinner.succeed(`Accepting keepers (chunk ${i + 1}/${chunks.length}): ${acceptTxResult.txHash}`)
  }

  spinner.start(`Activating contract...`)

  const activateTxResult = await contractTx(
    legacyContract,
    'activate',
    encryptionResult.shareLength,
    encryptionResult.encryptedLegacyData,
    encryptionResult.legacyDataHash,
    encryptionResult.aesCounter,
    {from: address, value: activationPrice},
  )

  spinner.succeed(`Contract has been activated: ${activateTxResult.txHash}`)
  totalTxCostWei = totalTxCostWei.plus(activateTxResult.txPriceWei)

  await delay(500)

  print(`\nPaid for contract activation: ${formatWei(totalTxCostWei)}`)
}

function splitSelectedKeepersInChunks(selectedProposalIndices, keyPartHashes, encryptedKeyParts) {
  let result = []

  const numSelectedProposals = selectedProposalIndices.length
  const numChunks = Math.ceil(numSelectedProposals / MAX_KEEPERS_IN_CHUNK)

  assert.equal(numSelectedProposals, keyPartHashes.length)
  assert.equal(numSelectedProposals, encryptedKeyParts.length)

  for (let iChunk = 0; iChunk < numChunks; ++iChunk) {
    const iLeftKeeper = iChunk * MAX_KEEPERS_IN_CHUNK
    const iRightKeeper = Math.min(numSelectedProposals, iLeftKeeper + MAX_KEEPERS_IN_CHUNK)
    result.push({
      selectedProposalIndices: selectedProposalIndices.slice(iLeftKeeper, iRightKeeper),
      keyPartHashes: keyPartHashes.slice(iLeftKeeper, iRightKeeper),
      encryptedKeyParts: packingUtils.pack(encryptedKeyParts.slice(iLeftKeeper, iRightKeeper)),
    })
  }

  return result
}

async function pickCheapestKeepers(keeperProposals, keeperNumber) {
  return keeperProposals
    .map((v, i) => {
      return {index: i, keepingFee: v.keepingFee}
    })
    .sort((a, b) => a.keepingFee.gt(b.keepingFee))
    .map(v => v.index)
    .slice(0, keeperNumber)
}

async function askIsDefaultKeeperNumber(defaultKeeperNumber, keepingFeeForDefault) {
  const IS_DEFAULT_KEEPER_NUMBER = 'IS_DEFAULT_KEEPER_NUMBER'
  const DEFAULT_KEEPERS_NUMBER = 'DEFAULT_KEEPERS_NUMBER'
  const DIFFERENT_KEEPER_NUMBER = 'DIFFERENT_KEEPER_NUMBER'

  const keeperPolicy = await inquirer
    .prompt([
      {
        type: 'list',
        name: IS_DEFAULT_KEEPER_NUMBER,
        message:
          'To activate the contract please choose the number of keepers and the corresponding fee',
        choices: [
          {
            name: `${defaultKeeperNumber} keepers, ${formatWei(
              keepingFeeForDefault,
            )} keeping fee for each check-in interval (recommended)`,
            value: DEFAULT_KEEPERS_NUMBER,
          },
          {
            name: `Different number of keepers`,
            value: DIFFERENT_KEEPER_NUMBER,
          },
        ],
        prefix: '',
      },
    ])
    .then(x => x[IS_DEFAULT_KEEPER_NUMBER])

  return keeperPolicy === DEFAULT_KEEPERS_NUMBER
}

async function askAdjustedKeepersNumber(minKeepers, maxKeepers) {
  const KEEPER_NUMBER_QUESTION_ID = 'KEEPER_NUMBER_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: KEEPER_NUMBER_QUESTION_ID,
        message: `Please enter the number of keepers [${minKeepers}..${maxKeepers}]`,
        prefix: '',
        validate: input => {
          const value = Number(input)

          if (!value) {
            return `Passed value is not a number, please enter the valid number of keepers`
          }
          if (!Number.isInteger(value)) {
            return `Passed value should be an integer`
          }
          if (value <= 0) {
            return `You are kidding me, you've provided a negative number`
          }
          if (value < minKeepers) {
            return `${value} keepers is less than minimum accepted number of keepers`
          }
          if (value > maxKeepers) {
            return `${value} keepers is more than number of keepers that has been joined`
          }

          return true
        },
      },
    ])
    .then(x => x[KEEPER_NUMBER_QUESTION_ID])
}

async function confirmAdjustedKeeperNumber(keeperNumber, activationPrice) {
  const CONFIRM_CHECKIN_PRICE_QUESTION_ID = 'CONFIRM_CHECKIN_PRICE_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: CONFIRM_CHECKIN_PRICE_QUESTION_ID,
        message: `You will pay ${formatWei(
          activationPrice,
        )} for each check-in interval, please confirm to activate a contract (Y/n)`,
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
    .then(input => yn(input[CONFIRM_CHECKIN_PRICE_QUESTION_ID]))
}
