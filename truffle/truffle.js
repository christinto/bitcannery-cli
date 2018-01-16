const GAS_LIMIT = 4712388
const GWEI = 1000000000

const RINKEBY_GAS_LIMIT = 6650000
const RINKEBY_GAS_PRICE = 20000000000
const RINKEBY_ADDR_TO_DEPLOY = "0x6da26a02b4364dcff7cfd58f8a8b9c6ce62a0c61"

module.exports = {
  networks: {
    local: {
      host: 'localhost',
      port: 9545,
      network_id: 1337,
      gas: GAS_LIMIT,
      gasPrice: 1 * GWEI,
    },
    rinkeby: {
      host: 'localhost',
      port: 9545,
      network_id: 4,
      gas: RINKEBY_GAS_LIMIT,
      gasPrice: RINKEBY_GAS_PRICE,
      from: RINKEBY_ADDR_TO_DEPLOY,
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
