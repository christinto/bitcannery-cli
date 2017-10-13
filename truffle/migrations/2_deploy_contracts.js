var CryptoLegacy = artifacts.require("./CryptoLegacy.sol");

module.exports = function(deployer) {
  deployer.deploy(CryptoLegacy);
};
