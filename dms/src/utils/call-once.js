const NONE = {}

export default function callOnce(fn) {
  let result = NONE
  return (...args) => {
    if (result === NONE) {
      result = fn(...args)
    }
    return result
  }
}
