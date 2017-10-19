const crypto = require('crypto')
const eccrypto = require('eccrypto')
const secrets = require('secrets.js')
const aesjs = require('aes-js')
const Web3 = require('web3')
const web3 = new Web3()

const packingUtils = require('./pack')
const prefixUtils = require('./prefix')

const KEY_LENGTH_IN_BITS = 256
const SHAMIR_BITS = 14 // 2 ^ 14 = 16384 max keepers

secrets.init(SHAMIR_BITS)

function toUint8Array(buffer) {
  const key = []

  for (let i = 0; i < buffer.length; ++i) {
    key.push(buffer.readUInt8(i))
  }

  return key
}

function aesEncrypt(textBuffer, keyBuffer, aesCounter) {
  const text = toUint8Array(textBuffer)
  const key = toUint8Array(keyBuffer)

  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesCounter))
  const encryptedBytes = aesCtr.encrypt(text)

  return aesjs.utils.hex.fromBytes(encryptedBytes)
}

function aesDecrypt(encryptedHex, hexKey, aesCounter) {
  const key = toUint8Array(new Buffer(hexKey, 'hex'))
  const encryptedBytes = aesjs.utils.hex.toBytes(encryptedHex)

  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesCounter))
  const decryptedBytes = aesCtr.decrypt(encryptedBytes)

  return aesjs.utils.hex.fromBytes(decryptedBytes)
}

async function encryptLegacy(legacyData, bobPublicKey, aesKey, aesCounter) {
  const encryptedForBob = await ecEncrypt(legacyData, bobPublicKey)

  const encryptedForBobBuffer = new Buffer(
    packingUtils.packElliptic(encryptedForBob),
    'hex'
  )

  return aesEncrypt(encryptedForBobBuffer, aesKey, aesCounter)
}

function sha3(data) {
  let dataToHash
  if (data instanceof Buffer) {
    dataToHash = data.toString('hex')
  } else {
    dataToHash = data
  }

  dataToHash = prefixUtils.ensure0x(dataToHash)

  return web3.utils.soliditySha3(dataToHash)
}

/**
  * str - 0x hex string
  * publicKey - 0x hex string
  *
  * returns object with fields iv, ephemPublicKey, ciphertext and mac
  */
async function ecEncrypt(str, publicKey) {
  const dataBuffer = new Buffer(prefixUtils.trim0x(str), 'hex')
  const publicKeyBuffer = new Buffer(prefixUtils.trim0x(publicKey), 'hex')
  return await eccrypto.encrypt(publicKeyBuffer, dataBuffer)
}

/**
  * encrypted - object with fields iv, ephemPublicKey, ciphertext and mac
  * privateKey - 0x hex string
  *
  * returns 0x hex string
  */
async function ecDecrypt(encrypted, privateKey) {
  const privateKeyBuffer = new Buffer(prefixUtils.trim0x(privateKey), 'hex')
  const decryptedBuffer = await eccrypto.decrypt(privateKeyBuffer, encrypted)
  return prefixUtils.ensure0x(decryptedBuffer.toString('hex'))
}

/**
  * legacyData - hex string w/ or w/o 0x prefix
  * bobPublicKey - hex string w/ or w/o 0x prefix
  * keeperPublicKeys - array of hex strings w/ or w/o 0x prefix
  * numKeepersToRecover - number of keepers sufficient to recover the key
  * aesCounter - int counter for aes block mode
  *
  *  returns {
  *    encryptedKeyParts - packed 0x hex string of encrypted keeper keys
  *    keyPartHashes - array of 0x sha3 solidity hashes of keeper keys
  *    legacyDataHash - 0x sha3 solidity hash of legacy data
  *    encryptedLegacyData - 0x hex string of encrypted legacy data
  *  }
  */
async function encryptData(legacyData, bobPublicKey, keeperPublicKeys, numKeepersToRecover, aesCounter) {
  const legacyDataHash = sha3(legacyData)
  const aesKeyBuffer = crypto.randomBytes(KEY_LENGTH_IN_BITS / 8)

  let encryptedLegacyData = await encryptLegacy(
    legacyData,
    bobPublicKey,
    aesKeyBuffer,
    aesCounter
  )

  encryptedLegacyData = prefixUtils.ensure0x(encryptedLegacyData)

  const keeperCount = keeperPublicKeys.length

  const encryptedKeyPartsArray = Array(keeperCount)
  const keyPartHashes = Array(keeperCount)

  const keeperSecrets = secrets.share(
    aesKeyBuffer.toString('hex'),
    keeperCount,
    numKeepersToRecover
  )

  for(let i = 0; i < keeperCount; ++i) {
    const keeperPublicKey = prefixUtils.trim0x(keeperPublicKeys[i])
    const keeperSecret = keeperSecrets[i]

    const encryptedKeyPart = await eccrypto.encrypt(
      new Buffer(keeperPublicKey, 'hex'),
      new Buffer(keeperSecret, 'hex')
    )

    encryptedKeyPartsArray[i] = packingUtils.packElliptic(encryptedKeyPart)
    keyPartHashes[i] = sha3(keeperSecret)
  }

  const encryptedKeyParts = prefixUtils.ensure0x(
    packingUtils.pack(encryptedKeyPartsArray)
  )

  return {
    encryptedKeyParts,
    keyPartHashes,
    legacyDataHash,
    encryptedLegacyData,
  }
}

/**
  * encryptedLegacyData - 0x hex string of encrypted legacy data
  * legacyDataHash - 0x sha3 solidity hash of legacy data
  * bobPrivateKey - 0x hex string of Bob's private key
  * keyParts - array of 0x hex string
  * aesCounter - int counter for aes block mode
  *
  *  returns legacy 0x hex string or null if it doesnt possible to decrypt data
  */
async function decryptData(encryptedLegacyData, legacyDataHash, bobPrivateKey, keyParts, aesCounter) {
  try {
    const recoveredAesKey = secrets.combine(keyParts.map(kp => prefixUtils.trim0x(kp)))

    const encryptedForBob = aesDecrypt(
      prefixUtils.trim0x(encryptedLegacyData),
      recoveredAesKey,
      aesCounter
    )

    let legacyData = await ecDecrypt(
      packingUtils.unpackElliptic(encryptedForBob),
      bobPrivateKey
    )

    calculatedSha3 = sha3(legacyData)

    if (calculatedSha3 != legacyDataHash) {
      throw new Error('legacy hashes dont match')
    }

    return legacyData
  } catch (e) {
    const redColor = s => '\033[31m' + s + '\x1b[0m'
    console.log(redColor('[ERROR!] failed to decrypt data'))
    return null
  }
}

module.exports = {
  ecDecrypt,
  encryptData,
  decryptData,
}