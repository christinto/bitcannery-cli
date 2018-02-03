export default class AsyncSerialQueue {
  constructor() {
    this._queue = []
  }

  enqueueAndWait(fn) {
    let onSuccess, onError

    const promise = new Promise((resolve, reject) => {
      onSuccess = resolve
      onError = reject
    })

    const newLength = this._queue.push({fn, onSuccess, onError})
    if (newLength === 1) {
      this._run().catch(this._onError)
    }

    return promise
  }

  async _run() {
    while (this._queue.length) {
      const {fn, onSuccess, onError} = this._queue[0]
      try {
        const result = await fn()
        onSuccess(result)
      } catch (err) {
        onError(err)
      } finally {
        this._queue.shift()
      }
    }
  }

  _onError = err => {
    setImmediate(() => {
      throw err
    })
  }
}
