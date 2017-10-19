const crypto = require('crypto')
const packingUtils = require('./pack')
const prefixUtils = require('./prefix')
const encryption = require('./encryption')

const legacyData = '0x42' // hex string w/ prefix 0x

const bobPrivateKey = '0xe730a15f301798c2d938c463d4d88e303581b0151518cc3d465c924b7da5173d'
const bobPublicKey = '0x04edd14962584dfc0293af9b91e0d2ea9ad80859f97963419886d4b7cff9fd463c6a9b091f85eb9a097b8930658f558356588b9a92535811c33a654381120d9b98'

const keeperPrivateKeys = [
  '0xefe3554153962a2658215320b1feb4a68786bac8c3360f66cab13011c588bf73',
  '0xc0ac892cadd05649068eb6270c6def64caa6866a8d8ac92ba5b3f1fd766d74cd',
  '0xc49306a5858d34b3a1062e95bef2cf1ca8d7d6cf013f3ae5b81843d348e5c620',
]
const keeperPublicKeys = [
  '0x04f57f84ac80bed4758d51bd785d3900043d0799d5d7073d3f4fb9727c76f1e813fac54ccde14f4e7fe4bbd7c0c3c6b6774a22b4da7f0d20ed96d97989e1732b3a',
  '0x0402586d0100021eedad6d27cfe923635e17de7b30c93455724a5ebcfa68a414167f6383298b78e478ccae419bcaab4985e301c1891de77330998a38e5968874a9',
  '0x04b1e2387ed1c7d95f301deca995b58045409e363ebce8a9a2eb307cb6eb3620df6b36d90affef69eaa2813e5c7434ee36d2446f77cb27d7aff8eb36f3db02c3ce',
]

const numKeepersToRecover = 2
const aesCounter = 8

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
