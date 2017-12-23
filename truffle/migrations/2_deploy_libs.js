var CryptoLegacy = artifacts.require('./CryptoLegacy.sol')
var SafeMath = artifacts.require('./SafeMath.sol')

module.exports = function(deployer) {
  deployer.deploy(SafeMath)
  deployer.link(SafeMath, CryptoLegacy)
}
