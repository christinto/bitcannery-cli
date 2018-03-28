const crypto = require('crypto')
const eccrypto = require('eccrypto')
const secrets = require('secrets.js-grempe')
const aesjs = require('aes-js')
const soliditySha3 = require('solidity-sha3').default
const flatten = require('lodash.flatten')

const packingUtils = require('./pack')
const prefixUtils = require('./prefix')
const UserError = require('./user-error').default

const AES_KEY_LENGTH_BYTES = 32
const AES_KEY_LENGTH_BITS = AES_KEY_LENGTH_BYTES * 8

const SHAMIR_BITS = 14 // 2 ^ 14 = 16384 max keepers

const HMAC_SECRET_FOR_PASSWORD_ENCRYPT = new Buffer('df890b7f532dfac8a02236de9b4953d8', 'hex')

secrets.init(SHAMIR_BITS)

/**
 *  returns {
 *    publicKey - 0x hex string of secp256k1 private key
 *    publicKey - 0x hex string of secp256k1 public key
 *  }
 */
function makeEllipticKeyPair() {
  const privateKey = crypto.randomBytes(32)
  const publicKey = eccrypto.getPublic(privateKey)

  return {
    privateKey: prefixUtils.ensure0x(privateKey.toString('hex')),
    publicKey: prefixUtils.ensure0x(publicKey.toString('hex')),
  }
}

function makeKeyDerivationParams(saltLenBytes, baseIterCount) {
  const entropy = crypto.randomBytes(saltLenBytes + 16)
  const salt = entropy.slice(0, saltLenBytes)
  const iterCount = baseIterCount + entropy.slice(saltLenBytes, saltLenBytes + 16).readUInt16BE()
  return {salt, iterCount}
}

function deriveKey(password, saltBuf, iterCount) {
  return crypto.pbkdf2Sync(password, saltBuf, iterCount, AES_KEY_LENGTH_BYTES, 'sha512')
}

/**
 * Returns object of the following form: {
 *   ciphertext: String, hex-encoded
 *   salt: String, hex-encoded
 *   dataHash: String, hex-encoded
 *   iterCount: Number
 *   aesCounter: Number
 * }
 */
function passwordEncryptData(dataBuf, password, opts = {}) {
  const {saltLenBytes = 32, baseIterCount = 300000} = opts
  const {salt, iterCount} = makeKeyDerivationParams(saltLenBytes, baseIterCount)
  const keyBuf = deriveKey(password, salt, iterCount)
  const aesCounter = crypto.randomBytes(16).readUInt16BE()
  const ciphertextBuf = aesEncrypt(dataBuf, keyBuf, aesCounter)
  return {
    ciphertext: ciphertextBuf.toString('hex'),
    salt: salt.toString('hex'),
    dataHash: sha256(dataBuf).toString('hex'),
    iterCount,
    aesCounter,
  }
}

/**
 * encryptedData - object of the following form: {
 *   ciphertext: String, hex-encoded
 *   salt: String, hex-encoded
 *   dataHash: String, hex-encoded
 *   iterCount: Number
 *   aesCounter: Number
 * }
 *
 * password - plaintext password, String
 */
function passwordDecryptData(encryptedData, password) {
  const ciphertextBuf = new Buffer(encryptedData.ciphertext, 'hex')
  const saltBuf = new Buffer(encryptedData.salt, 'hex')
  const keyBuf = deriveKey(password, saltBuf, encryptedData.iterCount)
  const dataBuf = aesDecrypt(ciphertextBuf, keyBuf, encryptedData.aesCounter)
  if (sha256(dataBuf).toString('hex') !== encryptedData.dataHash) {
    throw new UserError(`decryption failed`)
  }
  return dataBuf
}

/**
 * dataBuf - data to encrypt: Buffer, Array of bytes or Uint8Array
 * keyBuf - AES key: Buffer, Array of bytes or Uint8Array
 * aesCounter - AES counter: Buffer or integer Number (up to 16 bytes)
 *
 * Returns Buffer instance containing encrypted data.
 */
function aesEncrypt(dataBuf, keyBuf, aesCounter) {
  const counterInstance = new aesjs.Counter(aesCounter)
  const aesCtrMode = new aesjs.ModeOfOperation.ctr(keyBuf, counterInstance) // eslint-disable-line
  const ciphertextBytes = aesCtrMode.encrypt(dataBuf)
  return new Buffer(ciphertextBytes)
}

/**
 * ciphertextBuf - data to decrypt: Buffer, Array of bytes or Uint8Array
 * keyBuf - AES key: Buffer, Array of bytes or Uint8Array
 * aesCounter - AES counter: Buffer or integer Number (up to 16 bytes)
 *
 * Returns Buffer instance containing decrypted data.
 */
function aesDecrypt(ciphertextBuf, keyBuf, aesCounter) {
  const counterInstance = new aesjs.Counter(aesCounter)
  const aesCtrMode = new aesjs.ModeOfOperation.ctr(keyBuf, counterInstance) // eslint-disable-line
  const ciphertextBytes = aesCtrMode.decrypt(ciphertextBuf)
  return new Buffer(ciphertextBytes)
}

/**
 * Returns a Buffer instance.
 */
function sha256(dataBuf) {
  const hmac = crypto.createHmac('sha256', HMAC_SECRET_FOR_PASSWORD_ENCRYPT)
  return hmac.update(dataBuf).digest()
}

/**
 * Returns 0x-prefixed hex string.
 */
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
 *    encryptedKeyParts - array of encrypted keeper keys w/ 0x prefixes
 *    keyPartHashes - array of 0x sha3 solidity hashes of keeper keys
 *    shareLength - length of share string in hex characters
 *    legacyDataHash - 0x sha3 solidity hash of legacy data
 *    encryptedLegacyData - 0x hex string of encrypted legacy data
 *    aesCounter - 0x hex string of AES counter value
 *  }
 */
async function encryptData(legacyData, bobPublicKey, keeperPublicKeys, numKeepersToRecover) {
  const legacyDataHash = sha3(legacyData)
  const aesKeyBuffer = crypto.randomBytes(AES_KEY_LENGTH_BITS / 8)
  const aesCounterBuffer = crypto.randomBytes(16)

  let encryptedLegacyData = await encryptLegacy(
    legacyData,
    bobPublicKey,
    aesKeyBuffer,
    aesCounterBuffer,
  )

  encryptedLegacyData = prefixUtils.ensure0x(encryptedLegacyData)

  const keeperCount = keeperPublicKeys.length

  const encryptedKeyParts = Array(keeperCount)
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

    encryptedKeyParts[i] = packingUtils.packElliptic(encryptedKeyPart)
    keyPartHashes[i] = sha3(keeperSecret)
  }

  return {
    encryptedKeyParts,
    keyPartHashes,
    shareLength,
    legacyDataHash,
    encryptedLegacyData,
    aesCounter: '0x' + aesCounterBuffer.toString('hex'),
  }
}

async function encryptLegacy(legacyData, bobPublicKey, aesKey, aesCounter) {
  const encryptedForBob = await ecEncrypt(legacyData, bobPublicKey)
  const encryptedForBobBuffer = Buffer.from(
    prefixUtils.trim0x(packingUtils.packElliptic(encryptedForBob)),
    'hex',
  )
  const encryptedBuf = aesEncrypt(encryptedForBobBuffer, aesKey, aesCounter)
  return encryptedBuf.toString('hex')
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

async function decryptKeeperShare(encryptedSharesChunks, keeperIndex, keeperPrivateKey, shareHash) {
  const encryptedSharesArray = flatten(
    encryptedSharesChunks.map(sharesChunk => packingUtils.unpack(sharesChunk)),
  )

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
    const keyHex = secrets.combine(keyParts.map(kp => shareFromHex(kp.substr(0, shareLength + 2))))
    const keyBuf = Buffer.from(keyHex, 'hex')

    const dataBuf = Buffer.from(prefixUtils.trim0x(encryptedLegacyData), 'hex')
    const ctrBuf = Buffer.from(prefixUtils.trim0x(aesCounter), 'hex')

    const encryptedForBob = aesDecrypt(dataBuf, keyBuf, ctrBuf).toString('hex')

    const legacyData = await ecDecrypt(packingUtils.unpackElliptic(encryptedForBob), bobPrivateKey)
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
  makeEllipticKeyPair,
  passwordEncryptData,
  passwordDecryptData,
  aesEncrypt,
  aesDecrypt,
  ecEncrypt,
  ecDecrypt,
  encryptData,
  decryptData,
  decryptKeeperShare,
  checkLegacySha3,
}
