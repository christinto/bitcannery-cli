import prefixUtils from './prefix'

const ZERO_PADDING = '0000'
const SEGMENT_LENGTH_FIELD_LENGTH = ZERO_PADDING.length
const MAX_SEGMENT_LENGTH = Math.pow(16, SEGMENT_LENGTH_FIELD_LENGTH)

function pack(segments) {
  let result = ''

  for (let i = 0; i < segments.length; ++i) {
    let part = prefixUtils.trim0x(segments[i])

    if (part.length >= MAX_SEGMENT_LENGTH) {
      throw new Error(
        `length of each segment must be less than ${MAX_SEGMENT_LENGTH}, got ${part.length}`,
      )
    }

    result += (ZERO_PADDING + part.length.toString(16)).substr(-SEGMENT_LENGTH_FIELD_LENGTH)
    result += prefixUtils.trim0x(segments[i])
  }

  return '0x' + result
}

function unpack(data) {
  data = prefixUtils.trim0x(data)

  let i = 0
  let result = []
  const dataLength = data.length

  while (i < dataLength) {
    if (dataLength - i < SEGMENT_LENGTH_FIELD_LENGTH) {
      throw new Error(`malformed data`)
    }

    const segmentLength = parseInt(data.substr(i, SEGMENT_LENGTH_FIELD_LENGTH), 16)
    i += SEGMENT_LENGTH_FIELD_LENGTH

    if (!(segmentLength > 0) || dataLength - i < segmentLength) {
      throw new Error(`malformed data`)
    }

    const part = data.substr(i, segmentLength)
    i += segmentLength

    result.push('0x' + part)
  }

  return result
}

function packElliptic(encryptedData) {
  const segments = [
    encryptedData['iv'].toString('hex'),
    encryptedData['ephemPublicKey'].toString('hex'),
    encryptedData['ciphertext'].toString('hex'),
    encryptedData['mac'].toString('hex'),
  ]

  return pack(segments)
}

function unpackElliptic(packedElliptic) {
  const segments = unpack(packedElliptic, 4)

  return {
    iv: Buffer.from(prefixUtils.trim0x(segments[0]), 'hex'),
    ephemPublicKey: Buffer.from(prefixUtils.trim0x(segments[1]), 'hex'),
    ciphertext: Buffer.from(prefixUtils.trim0x(segments[2]), 'hex'),
    mac: Buffer.from(prefixUtils.trim0x(segments[3]), 'hex'),
  }
}

module.exports = {
  pack,
  unpack,
  packElliptic,
  unpackElliptic,
}
