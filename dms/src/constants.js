export const MIN_CHECKIN_INTERVAL_IN_DAYS = 1 / (60 * 24) // 1 min
export const MAX_CHECKIN_INTERVAL_IN_DAYS = 365 * 3 // 3 years
export const MIN_KEEPERS_NUMBER = 2
export const DEFAULT_KEEPERS_NUMBER = 2

// Maximum number of keepers that can be added using single `acceptKeepers` TX.
// This limit is needed to avoid exceeding block gas limit. Depends on and should
// be adjusted in accordance with amount of gas consumed by accepting single keeper.
export const MAX_KEEPERS_IN_CHUNK = 10
