const GAS_LIMIT = 4712388
const GWEI = 1000000000

module.exports = {
  networks: {
    local: {
      host: 'localhost',
      port: 9545,
      network_id: 1337,
      gas: GAS_LIMIT,
      gasPrice: 1 * GWEI,
    },
    ropsten: {
      host: 'localhost',
      port: 8545,
      network_id: 3,
      gas: GAS_LIMIT,
      gasPrice: 10 * GWEI,
    },
    live: {
      host: 'localhost',
      port: 8545,
      network_id: 1,
      gas: GAS_LIMIT,
      gasPrice: 1 * GWEI,
    },
  }
};
