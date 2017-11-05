pragma solidity ^0.4.15;

import "./CryptoLegacy.sol";

contract CryptoLegacyDebug is CryptoLegacy {

  uint private debugTimestamp = 42;

  function increaseTimeBy(uint sec) external {
    debugTimestamp += sec;
  }

  function getBlockTimestamp() internal constant returns (uint) {
    return debugTimestamp;
  }

  function CryptoLegacyDebug(uint _checkInInterval) CryptoLegacy(_checkInInterval) public {
    // nop
  }

}
