pragma solidity 0.4.18;

import "./CryptoLegacy.sol";

contract CryptoLegacyDebug is CryptoLegacy {

  function CryptoLegacyDebug(uint _checkInInterval) CryptoLegacy(_checkInInterval) public {
    // nop
  }

  // Time

  uint private debugTimestamp = 42;

  function increaseTimeBy(uint sec) external {
    debugTimestamp += sec;
  }

  function getBlockTimestamp() internal constant returns (uint) {
    return debugTimestamp;
  }

  // Version

  uint private debugVersion;

  function getVersion() public view returns (uint) {
    if (debugVersion == 0) {
      return VERSION;
    } else {
      return debugVersion;
    }
  }

  function setVersion(uint newVersion) external {
    debugVersion = newVersion;
  }

}
