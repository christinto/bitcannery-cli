import UserError from './user-error'

export default async function runCommand(fn, exitOnError = true) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof UserError) {
      console.error(`\nError: ${err.message}`)
      if (err.source && process.env.DEBUG && process.env.DEBUG != '0') {
        console.error(err.source.stack)
      }
      if (exitOnError) {
        process.exit(1)
      }
    } else {
      console.error(err.stack)
      if (exitOnError) {
        process.exit(2)
      }
    }
  }
}
