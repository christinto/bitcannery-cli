export default class UserError extends Error {
  constructor(message, source) {
    super(message)

    Object.defineProperties(this, {
      name: {value: 'UserError'},
      source: {value: source},
    })

    Error.captureStackTrace(this, this.constructor)
  }

  static from(err, prependMessage) {
    return new UserError(
      prependMessage + ': ' + (err instanceof UserError ? err.message : err.stack),
      err,
    )
  }
}
