import inquirer from 'inquirer'
import bip39 from 'bip39'
import print from '../print'
import HDWalletProvider from 'truffle-hdwallet-provider'
import delay from '../delay'
import getWeb3 from '../get-web3'
import {config, persistentConfig, updateConfig} from '../../config'
import {
  MESSAGE_IMPORT_OR_GENEARATE_MNEMONIC,
  MESSAGE_BEFORE_GENERATE_MNEMONIC,
  MESSAGE_AFTER_GENERATE_MNEMONIC,
} from '../../messages'

const TIMEOUT = 1000

//staff erupt buzz road gadget best cash ability wreck winner nasty inherit airport fortune parrot
export default async function setupMnemonic() {
  print(MESSAGE_IMPORT_OR_GENEARATE_MNEMONIC)

  const shouldGenerateNew = await askShouldGenerateNew()

  let mnemonic

  if (shouldGenerateNew) {
    print(MESSAGE_BEFORE_GENERATE_MNEMONIC)
    mnemonic = await generateMnemonic()
    print(MESSAGE_AFTER_GENERATE_MNEMONIC)
  } else {
    mnemonic = await askMnemonic()
    print('')
  }

  persistentConfig.set('mnemonic', mnemonic)
  updateConfig()

  const web3 = getWeb3()
  web3.setProvider(new HDWalletProvider(mnemonic, config.rpcConnection))

  await delay(TIMEOUT)
}

async function askShouldGenerateNew() {
  const IMPORT_OR_GENERATE_QUESTION_ID = 'IMPORT_OR_GENERATE_QUESTION_ID'
  const IMPORT = 'IMPORT'
  const GENERATE = 'GENERATE'

  const importOrGenerate = await inquirer
    .prompt([
      {
        type: 'list',
        name: IMPORT_OR_GENERATE_QUESTION_ID,
        message: 'Import or generate BIP39 seed phrase',
        choices: [
          {
            name: `Import`,
            value: IMPORT,
          },
          {
            name: `Generate`,
            value: GENERATE,
          },
        ],
        prefix: '',
      },
    ])
    .then(x => x[IMPORT_OR_GENERATE_QUESTION_ID])

  return importOrGenerate === GENERATE
}

async function askMnemonic() {
  const IMPORT_MNEMONIC_QUESTION_ID = 'IMPORT_MNEMONIC_QUESTION_ID'

  return await inquirer
    .prompt([
      {
        type: 'input',
        name: IMPORT_MNEMONIC_QUESTION_ID,
        message: `Please enter BIP39 seed`,
        prefix: '',
        validate: input => {
          // TODO: add validation
          return true
        },
      },
    ])
    .then(x => x[IMPORT_MNEMONIC_QUESTION_ID])
}

async function generateMnemonic() {
  const mnemonic = bip39.generateMnemonic()

  print(mnemonic)
  return mnemonic
}
