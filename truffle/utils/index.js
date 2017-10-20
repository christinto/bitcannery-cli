const crypto = require('crypto')
const packingUtils = require('./pack')
const prefixUtils = require('./prefix')
const encryption = require('./encryption')

const {bobPrivateKey, bobPublicKey, keeperPrivateKeys, keeperPublicKeys,
        numKeepersToRecover, aesCounter} = require('./samples')

const legacyData = '0x42' // hex string w/ prefix 0x

async function run() {
  const legacy = await encryption.encryptData(
    legacyData,
    bobPublicKey,
    keeperPublicKeys,
    numKeepersToRecover,
    aesCounter
  )

  let keyParts = extractEncryptedKeys(prefixUtils.trim0x(legacy.encryptedKeyParts), 3)

  for (let i = 0; i < keyParts.length; ++i) {
    keyParts[i] = await encryption.ecDecrypt(
      keyParts[i],
      keeperPrivateKeys[i]
    )
  }

  const decryptedLegacyData = await encryption.decryptData(
    legacy.encryptedLegacyData,
    legacy.legacyDataHash,
    bobPrivateKey,
    keyParts.slice(0, 2),
    aesCounter
  )

  console.log('expected', legacyData)
  console.log('got', decryptedLegacyData)
}

function extractEncryptedKeys(encryptedKeyParts, keeperCount) {
  return packingUtils.unpack(encryptedKeyParts, keeperCount).map(k => packingUtils.unpackElliptic(k))
}

run()
