var CryptoLegacy = artifacts.require("./CryptoLegacy.sol");
var SafeMath = artifacts.require("./SafeMath.sol");

module.exports = function(deployer) {
  deployer.link(SafeMath, CryptoLegacy);
  deployer.deploy(CryptoLegacy);
};
