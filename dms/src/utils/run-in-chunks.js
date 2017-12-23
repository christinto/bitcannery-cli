//
export default async function runInChunks({chunkSize, dataLength, fn}) {
  let right = 0
  while (right < dataLength) {
    const left = right
    right = Math.min(left + chunkSize, dataLength)
    const chunkPromises = new Array(right - left).fill(0).map((_, i) => fn(left + i))
    await Promise.all(chunkPromises)
  }
}
