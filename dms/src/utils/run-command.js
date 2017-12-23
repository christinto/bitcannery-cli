import UserError from './user-error'

export default async function runCommand(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof UserError) {
      console.error(`\nError: ${err.message}`)
      process.exit(1)
    } else {
      console.error(err.stack)
      process.exit(2)
    }
  }
}
