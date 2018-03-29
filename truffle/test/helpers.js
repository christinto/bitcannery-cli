import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import chai from 'chai'

import encryption from '../../dms/src/utils/encryption'
import {pack, unpackElliptic} from '../../dms/src/utils/pack'
import {trim0x, ensure0x} from '../../dms/src/utils/prefix'
import {getActiveKeepers, getActiveKeeperAddresses} from '../../dms/src/utils/contract-api'

import {bobPrivateKey,
  bobPublicKey,
  keeperPrivateKeys,
  keeperPublicKeys,
  numKeepersToRecover} from './data'

const {assert} = chai
export {assert}

export const web3 = new Web3(global.web3.currentProvider)


// general helpers

export function assertTxReverts(txResultPromise, message) {
  return assertTxFailsWithError(
    err => /revert/.test(err.message),
    txResultPromise,
    message
  )
}

export function assertTxFails(txResultPromise, message) {
  return assertTxFailsWithError(
    err => /revert|invalid opcode/.test(err.message),
    txResultPromise,
    message
  )
}

export async function assertTxFailsWithError(errorPred, txResultPromise, message) {
  let txProps
  try {
    txProps = await inspectTransaction(txResultPromise)
  } catch (err) {
    assert(errorPred(err), (message ? message + ': ' : '') +
      `transaction failed with unexpected error: ${err.stack}`)
    return
  }
  if (txProps.success) {
    assert(false, `${message ? message + ': ' : ''}transaction was expected to fail but succeed`)
  }
  return txProps
}


export async function assertTxSucceeds(txResultPromise, message) {
  let txProps
  try {
    txProps = await inspectTransaction(txResultPromise)
  } catch (err) {
    assert(false,
      `${message ? message + ': ' : ''}transaction was expected to ` +
      `succeed but failed: ${err.message}`
    )
  }
  if (!txProps.success) {
    assert(false, `${message ? message + ': ' : ''}transaction was expected to succeed but failed`)
  }
  return txProps
}


export async function assertTxSucceedsGeneratingEvents(txResultPromise, expectedEvents, message) {
  const txProps = await assertTxSucceeds(txResultPromise, message)
  assert.deepEqual(txProps.events, expectedEvents, message ? `${message}, tx events` : `tx events`)
  return txProps
}


export async function inspectTransaction(txResultPromise) {
  const txResult = await txResultPromise
  const tx = await web3.eth.getTransaction(txResult.tx)
  const {receipt} = txResult
  const success = receipt.status !== undefined
    ? +toBigNumber(receipt.status, 0) === 1 // Since Byzantium fork
    : receipt.gasUsed < tx.gas // Before Byzantium fork (current version of TestRPC)
  const txPriceWei = new BigNumber(tx.gasPrice).times(receipt.gasUsed)
  const events = txResult.logs
    .map(log => log.event ? {name: log.event, args: log.args} : null)
    .filter(x => !!x)
  return {result: txResult, success, txPriceWei, events}
}


export function toBigNumber(val, defaultVal) {
  try {
    return new BigNumber(val)
  } catch (err) {
    return new BigNumber(defaultVal)
  }
}


export function printEvents(txResult) {
  console.info('Events:', txResult.logs
    .map(log => {
      if (!log.event) return null
      const argsDesc = Object.keys(log.args)
        .map(argName => `${argName}: ${log.args[argName]}`)
        .join(', ')
      return `${log.event}(${argsDesc})`
    })
    .filter(x => !!x)
  )
}


export async function getAccountBalance(account) {
  const bal = await web3.eth.getBalance(account)
  return new BigNumber('' + bal)
}


export async function getAccountBalances(...addrs) {
  return await Promise.all(addrs.map(addr => getAccountBalance(addr)))
}


export function ceil(x, y) {
  return Math.ceil(x / y) * y;
}


export function sum(arr, accessor = (x => x)) {
  return arr.reduce((s, el) => s + accessor(el), 0)
}


export function bigSum(arr, accessor = (x => x)) {
  return arr.reduce((s, el) => s.plus('' + accessor(el)), new BigNumber(0))
}


export function stringify(x) {
  return '' + x
}


assert.bignumEqual = function assertBignumEqual(bal1, bal2, message) {
  assert.equal(bal1.toString(), bal2.toString(), message)
}


// contract-specific helpers


export function getAddresses(accounts) {
  const [_, Alice, Bob, ...keeper] = accounts
  return {Alice, Bob, keeper}
}


export async function acceptKeepersAndActivate(contract, {
  selectedProposalIndices,
  keyPartHashes,
  encryptedKeyParts,
  shareLength,
  encryptedLegacyData,
  legacyDataHash,
  aesCounter},
  {from, value},
  message,
) {
  await assertTxSucceeds(contract.acceptKeepers(
    selectedProposalIndices,
    keyPartHashes,
    encryptedKeyParts,
    {from}),
    message ? `${message} (accepting keepers)` : `accepting keepers`)

  await assertTxSucceeds(contract.activate(
    shareLength,
    encryptedLegacyData,
    legacyDataHash,
    aesCounter,
    {from, value}),
    message ? `${message} (accepting keepers)` : `activating contract`)
}


export async function getActiveKeepersBalances(contract, keeperAddrs) {
  const keepers = await getActiveKeepers(contract, keeperAddrs)
  return keepers.map(keeper => keeper.balance)
}


export async function getTotalKeepersBalance(contract) {
  const keeperAddresses = await getActiveKeeperAddresses(contract)
  const keepers = await getActiveKeepers(contract, keeperAddresses)
  return bigSum(keepers, keeper => keeper.balance)
}


export async function prepareLegacyData(legacyString, selectedKeeperIndices) {
  const {encryptedKeyParts, ...encryptionResult} = await encryption.encryptData(
    ensure0x(new Buffer(legacyString).toString('hex')),
    bobPublicKey,
    keeperPublicKeys.filter((_, index) => selectedKeeperIndices.indexOf(index) != -1),
    numKeepersToRecover,
  )
  return {
    ...encryptionResult,
    encryptedKeyParts: pack(encryptedKeyParts),
  }
}


export async function decryptLegacy(
  encryptedData,
  dataHash,
  suppliedKeyParts,
  shareLength,
  aesCounter,
) {
  const decrypted = await encryption.decryptData(
    encryptedData,
    dataHash,
    bobPrivateKey,
    suppliedKeyParts,
    shareLength,
    aesCounter,
  )
  return Buffer.from(trim0x(decrypted), 'hex').toString('utf8')
}


export async function decryptKeyPart(
  encryptedKeyPartsChunks,
  keyPartHashes,
  keeperProposalIndex,
  keeperIndex
) {
  return await encryption.decryptKeeperShare(
    encryptedKeyPartsChunks,
    keeperProposalIndex,
    keeperPrivateKeys[keeperIndex],
    keyPartHashes[keeperProposalIndex],
  )
}
