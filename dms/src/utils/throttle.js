//
export default function throttle(timeout, fn) {
  let lastCalledAt = 0
  let result
  return (...args) => {
    const now = Date.now()
    if (now - lastCalledAt >= timeout) {
      result = fn(...args)
      lastCalledAt = now
    }
    return result
  }
}
