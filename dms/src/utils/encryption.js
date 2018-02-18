const crypto = require('crypto')
const eccrypto = require('eccrypto')
const secrets = require('secrets.js-grempe')
const aesjs = require('aes-js')
const soliditySha3 = require('solidity-sha3').default

const packingUtils = require('./pack')
const prefixUtils = require('./prefix')
const UserError = require('./user-error').default

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

/**
 *  returns {
 *    publicKey - 0x hex string of secp256k1 private key
 *    publicKey - 0x hex string of secp256k1 public key
 *  }
 */
function generateKeyPair() {
  const privateKey = crypto.randomBytes(32)
  const publicKey = eccrypto.getPublic(privateKey)

  return {
    privateKey: prefixUtils.ensure0x(privateKey.toString('hex')),
    publicKey: prefixUtils.ensure0x(publicKey.toString('hex')),
  }
}

function aesEncrypt(textBuffer, keyBuffer, aesCounter) {
  const text = toUint8Array(textBuffer)
  const key = toUint8Array(keyBuffer)

  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesCounter)) // eslint-disable-line
  const encryptedBytes = aesCtr.encrypt(text)

  return aesjs.utils.hex.fromBytes(encryptedBytes)
}

function aesDecrypt(encryptedHex, hexKey, aesCounter) {
  const key = toUint8Array(Buffer.from(prefixUtils.trim0x(hexKey), 'hex'))
  const encryptedBytes = aesjs.utils.hex.toBytes(prefixUtils.trim0x(encryptedHex))

  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesCounter)) // eslint-disable-line
  const decryptedBytes = aesCtr.decrypt(encryptedBytes)

  return aesjs.utils.hex.fromBytes(decryptedBytes)
}

async function encryptLegacy(legacyData, bobPublicKey, aesKey, aesCounter) {
  const encryptedForBob = await ecEncrypt(legacyData, bobPublicKey)
  const encryptedForBobBuffer = Buffer.from(
    prefixUtils.trim0x(packingUtils.packElliptic(encryptedForBob)),
    'hex',
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

  return soliditySha3(dataToHash)
}

/**
 * str - 0x hex string
 * publicKey - 0x hex string
 *
 * returns object with fields iv, ephemPublicKey, ciphertext and mac
 */
async function ecEncrypt(str, publicKey) {
  const dataBuffer = Buffer.from(prefixUtils.trim0x(str), 'hex')
  const publicKeyBuffer = Buffer.from(prefixUtils.trim0x(publicKey), 'hex')
  return eccrypto.encrypt(publicKeyBuffer, dataBuffer)
}

/**
 * encrypted - object with fields iv, ephemPublicKey, ciphertext and mac
 * privateKey - 0x hex string
 *
 * returns 0x hex string
 */
async function ecDecrypt(encrypted, privateKey) {
  const privateKeyBuffer = Buffer.from(prefixUtils.trim0x(privateKey), 'hex')
  const decryptedBuffer = await eccrypto.decrypt(privateKeyBuffer, encrypted)
  return prefixUtils.ensure0x(decryptedBuffer.toString('hex'))
}

/**
 * legacyData - hex string w/ or w/o 0x prefix
 * bobPublicKey - hex string w/ or w/o 0x prefix
 * keeperPublicKeys - array of hex strings w/ or w/o 0x prefix
 * numKeepersToRecover - number of keepers sufficient to recover the key
 *
 *  returns {
 *    encryptedKeyParts - packed 0x hex string of encrypted keeper keys
 *    keyPartHashes - array of 0x sha3 solidity hashes of keeper keys
 *    shareLength - length of share string in hex characters
 *    legacyDataHash - 0x sha3 solidity hash of legacy data
 *    encryptedLegacyData - 0x hex string of encrypted legacy data
 *  }
 */
async function encryptData(legacyData, bobPublicKey, keeperPublicKeys, numKeepersToRecover) {
  const legacyDataHash = sha3(legacyData)
  const aesKeyBuffer = crypto.randomBytes(KEY_LENGTH_IN_BITS / 8)
  const aesCounterBuffer = crypto.randomBytes(16)

  let encryptedLegacyData = await encryptLegacy(
    legacyData,
    bobPublicKey,
    aesKeyBuffer,
    aesCounterBuffer,
  )

  encryptedLegacyData = prefixUtils.ensure0x(encryptedLegacyData)

  const keeperCount = keeperPublicKeys.length

  const encryptedKeyPartsArray = Array(keeperCount)
  const keyPartHashes = Array(keeperCount)

  const keeperSecrets = secrets.share(
    aesKeyBuffer.toString('hex'),
    keeperCount,
    numKeepersToRecover,
    1, // padLength
  )

  let shareLength

  for (let i = 0; i < keeperCount; ++i) {
    const keeperPublicKey = keeperPublicKeys[i]
    let keeperSecret = shareToHex(keeperSecrets[i])

    if (!shareLength) {
      shareLength = keeperSecret.length - 2
    }

    if (shareLength % 2 != 0) {
      keeperSecret = keeperSecret + '0'
    }

    const encryptedKeyPart = await eccrypto.encrypt(
      Buffer.from(prefixUtils.trim0x(keeperPublicKey), 'hex'),
      Buffer.from(prefixUtils.trim0x(keeperSecret), 'hex'),
    )

    encryptedKeyPartsArray[i] = packingUtils.packElliptic(encryptedKeyPart)
    keyPartHashes[i] = sha3(keeperSecret)
  }

  const encryptedKeyParts = packingUtils.pack(encryptedKeyPartsArray)

  return {
    encryptedKeyParts,
    keyPartHashes,
    shareLength,
    legacyDataHash,
    encryptedLegacyData,
    aesCounter: '0x' + aesCounterBuffer.toString('hex'),
  }
}

/**
 * A share starts from a character which is base-36 encoded number of
 * bits used for the Galois Field. Te rest of the share is hex-encoded.
 *
 * We need to convert the first character to hex in order to use
 * Buffer.from(x, 'hex') on the entire string,  e.g. "e" -> "0e",
 * "k" -> "14", etc.
 *
 * See: https://github.com/amper5and/secrets.js#share-format
 */
function shareToHex(share) {
  let bits = parseInt(share[0], 36).toString(16)
  if (bits.length == 1) {
    bits = '0' + bits
  }
  return prefixUtils.ensure0x(bits + share.substr(1))
}

/**
 * Converts hex-encoded share into the format accepted by secrets.js (see shareToHex).
 */
function shareFromHex(hex) {
  hex = prefixUtils.trim0x(hex)
  const bits = parseInt(hex.substr(0, 2), 16).toString(36)
  return (bits + hex.substr(2)).toLowerCase()
}

async function decryptKeeperShare(
  encryptedShares,
  numKeepers,
  keeperIndex,
  keeperPrivateKey,
  shareHash,
) {
  const encryptedSharesArray = packingUtils.unpack(encryptedShares, numKeepers)
  const encryptedShareData = encryptedSharesArray[keeperIndex]
  const encryptedShare = packingUtils.unpackElliptic(encryptedShareData)
  const shareHex = await ecDecrypt(encryptedShare, keeperPrivateKey)
  if (sha3(shareHex) !== shareHash) {
    throw new Error(`hashes don't match`)
  }
  return shareHex
}

/**
 * encryptedLegacyData - 0x hex string of encrypted legacy data
 * legacyDataHash - 0x sha3 solidity hash of legacy data
 * bobPrivateKey - 0x hex string of Bob's private key
 * keyParts - array of 0x hex string
 * shareLength - length of share string in hex characters
 * aesCounter - int counter for aes block mode
 *
 *  returns legacy 0x hex string
 */
async function decryptData(
  encryptedLegacyData,
  legacyDataHash,
  bobPrivateKey,
  keyParts,
  shareLength,
  aesCounter,
) {
  try {
    const recoveredAESKey = secrets.combine(
      keyParts.map(kp => shareFromHex(kp.substr(0, shareLength + 2))),
    )

    const encryptedForBob = aesDecrypt(
      prefixUtils.trim0x(encryptedLegacyData),
      recoveredAESKey,
      Buffer.from(prefixUtils.trim0x(aesCounter), 'hex'),
    )

    let legacyData = await ecDecrypt(packingUtils.unpackElliptic(encryptedForBob), bobPrivateKey)

    const calculatedSha3 = sha3(legacyData)

    if (calculatedSha3 !== legacyDataHash) {
      throw new Error(`hashes don't match`)
    }

    return legacyData
  } catch (e) {
    throw new UserError(`failed to decrypt (${e.message})`, e)
  }
}

/**
 * legacyData - hex string w/ or w/o 0x prefix
 * legacyHash - 0x sha3 solidity hash of legacy data
 *
 *  returns true or false
 */
function checkLegacySha3(legacyData, legacyHash) {
  const legacyDataHash = sha3(legacyData)
  return legacyHash === legacyDataHash
}

module.exports = {
  generateKeyPair,
  ecDecrypt,
  encryptData,
  decryptData,
  decryptKeeperShare,
  aesEncrypt,
  aesDecrypt,
  checkLegacySha3,
}
