const env = process.env

export default {
  host: env.DMS_HOST || 'localhost',
  port: env.DMS_PORT || 8545,
}
