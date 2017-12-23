//
export default function toNumber(promise) {
  return promise.then(x => x.toNumber())
}
