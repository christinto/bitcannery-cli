const ZERO_PADDING_LENGTH = 3
const ZERO_PADDING = '000'

function splitStringBySegmentLength (str, segmentLength) {
  if (segmentLength <= 0) {
    throw Error('segmentLength should be greater then 0')
  }

  const target = []
  const array = Array.from(str)

  while (array.length > 0) {
    const segment = array.splice(0, segmentLength).join('')
    target.push(segment)
  }

  return target
}

function pack (segments) {
  let result = ''
  for (let i = 0; i < segments.length; ++i) {
    let part = segments[i]

    if (part.length >= Math.pow(16, ZERO_PADDING_LENGTH)) {
      throw Error(`one of part's length is greater of equal than ${Math.pow(16, ZERO_PADDING_LENGTH)}`)
    }

    result += (ZERO_PADDING + part.length.toString(16)).substr(-ZERO_PADDING_LENGTH)
  }

  for (let i = 0; i < segments.length; ++i) {
    result += segments[i]
  }

  return result
}

function unpack (data, segmentCount) {
  let result = []
  let substringWithLengths = data.substring(0, segmentCount * ZERO_PADDING_LENGTH)

  let segmentLengths =
    splitStringBySegmentLength(substringWithLengths, ZERO_PADDING_LENGTH)
    .map(s => parseInt(s, 16))

  let currentPos = segmentCount * ZERO_PADDING_LENGTH
  for (let i = 0; i < segmentLengths.length; ++i) {
    let part = data.substring(currentPos, currentPos + segmentLengths[i])
    result.push(part)
    currentPos = currentPos + segmentLengths[i]
  }

  return result
}

function packElliptic (encryptedData) {
  const segments = [
    encryptedData['iv'].toString('hex'),
    encryptedData['ephemPublicKey'].toString('hex'),
    encryptedData['ciphertext'].toString('hex'),
    encryptedData['mac'].toString('hex')
  ]

  return pack(segments)
}

function unpackElliptic (packedElliptic) {
  const segments = unpack(packedElliptic, 4)

  return {
    iv: Buffer.from(segments[0], 'hex'),
    ephemPublicKey: Buffer.from(segments[1], 'hex'),
    ciphertext: Buffer.from(segments[2], 'hex'),
    mac: Buffer.from(segments[3], 'hex')
  }
}

function unpackEllipticParts (packedEllipticParts, partsCount) {
  return unpack(packedEllipticParts, partsCount).map(unpackElliptic)
}

module.exports = {
  pack,
  unpack,
  packElliptic,
  unpackElliptic,
  unpackEllipticParts
}
