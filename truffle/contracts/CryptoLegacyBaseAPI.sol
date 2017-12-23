pragma solidity 0.4.18;

interface CryptoLegacyBaseAPI {
  function getVersion() public view returns (uint);
  function getOwner() public view returns (address);
  function getContinuationContractAddress() public view returns (address);
  function isAcceptingKeeperProposals() public view returns (bool);
}
