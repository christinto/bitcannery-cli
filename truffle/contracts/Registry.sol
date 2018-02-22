pragma solidity 0.4.18;

import "./CryptoLegacyBaseAPI.sol";

contract Registry {
  event NewContract(string id, address addr, uint totalContracts);

  struct Contract {
    address initialAddress;
    address currentAddress;
  }

  mapping(address => string[]) internal contractsByOwner;
  mapping(string => Contract) internal contractsById;
  string[] public contracts;

  function getNumContracts() external view returns (uint) {
    return contracts.length;
  }

  function getContractAddress(string id) external view returns (address) {
    return contractsById[id].currentAddress;
  }

  function getContractInitialAddress(string id) external view returns (address) {
    return contractsById[id].initialAddress;
  }

  function getNumContractsByOwner(address owner) external view returns (uint) {
    return contractsByOwner[owner].length;
  }

  function getContractByOwner(address owner, uint index) external view returns (string) {
    return contractsByOwner[owner][index];
  }

  function addContract(string id, address addr) external {
    require(contractsById[id].initialAddress == 0);

    CryptoLegacyBaseAPI instance = CryptoLegacyBaseAPI(addr);
    address owner = instance.getOwner();

    require(msg.sender == owner);

    contracts.push(id);
    contractsByOwner[owner].push(id);
    contractsById[id] = Contract({initialAddress: addr, currentAddress: addr});

    NewContract(id, addr, contracts.length);
  }

  function updateAddress(string id) external {
    Contract storage ctr = contractsById[id];
    require(ctr.currentAddress != 0);

    CryptoLegacyBaseAPI instance = CryptoLegacyBaseAPI(ctr.currentAddress);
    require(instance.getOwner() == msg.sender);

    address continuationAddress = instance.getContinuationContractAddress();
    if (continuationAddress == 0) {
      return;
    }

    CryptoLegacyBaseAPI continuationInstance = CryptoLegacyBaseAPI(continuationAddress);
    require(continuationInstance.getOwner() == msg.sender);
    require(continuationInstance.getVersion() >= instance.getVersion());

    ctr.currentAddress = continuationAddress;

    // TODO: here we're adding the same id to the contracts array one more time; this allows Keeper
    // clients that didn't participate in the contract and that were offline at the moment to later
    // discover the continuation contract and send proposals.
    //
    // Ideally, we need to use logs/events filtering instead of relying on contracts array, but
    // currently filtering works unreliably with light clients.
    //
    contracts.push(id);
    NewContract(id, continuationAddress, contracts.length);
  }

}
