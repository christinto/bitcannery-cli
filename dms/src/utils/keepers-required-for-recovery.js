export default function keepersRequiredForRecovery(keepersCount) {
  return Math.max(Math.floor(keepersCount * 2 / 3), 2)
}
