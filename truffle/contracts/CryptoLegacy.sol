pragma solidity ^0.4.12;

contract CryptoLegacyContract {

  event DebugEvent(string debug);

  enum States {
    CallForKeepers,
    Active,
    CallForKeys,
    Cancelled
  }

  modifier atState(States _state) {
    require(state == _state);
    _;
  }

  modifier ownerOnly() {
    require(msg.sender == owner);
    _;
  }

  modifier activeKeepersOnly() {
    require(activeKeepers[msg.sender].lastCheckInTime > 0);
    _;
  }

  struct KeeperProposal {
    address keeperAddress;
    bytes publicKey; // 64-byte
  }

  struct ActiveKeeper {
    bytes publicKey; // 64-byte
    bytes32 keyPartHash; // sha-3 hash
    uint lastCheckInTime;
    uint balance;
  }

  struct EncyptedData {
    bytes encryptedData;
    bytes32 dataHash; // sha-3 hash
    bytes encryptedKeyParts; // packed array of key parts
  }

  address public owner = msg.sender;
  uint public checkInInterval;
  uint public keepingFee;
  uint public finalReward;

  States public state = States.CallForKeepers;

  EncyptedData public encyptedData;

  KeeperProposal[] public keeperProposals;
  mapping(address => uint8) public proposedKeeperFlags;

  mapping(address => ActiveKeeper) public activeKeepers;
  address[] public activeKeepersAddresses; // TODO: make internal


  // Called by Alice.
  //
  function CryptoLegacyContract(uint _checkInInterval, uint _keepingFee, uint _finalReward) public {
    checkInInterval = _checkInInterval;
    keepingFee = _keepingFee;
    finalReward = _finalReward;
  }


  // Called by a Keeper to submit their proposal.
  //
  function submitKeeperProposal(bytes publicKey) external
    atState(States.CallForKeepers)
  {
    require(msg.sender != owner);
    require(proposedKeeperFlags[msg.sender] == 0);

    keeperProposals.push(KeeperProposal({
      keeperAddress: msg.sender,
      publicKey: publicKey
    }));

    proposedKeeperFlags[msg.sender] = 1;
  }


  // Called by Alice to accept selected proposals and activate the contract.
  //
  function acceptKeepers(
    uint[] selectedProposalIndices,
    bytes32[] keyPartHashes,
    bytes encryptedKeyParts,
    bytes encryptedData,
    bytes32 dataHash) external
    atState(States.CallForKeepers) ownerOnly()
  {
    encyptedData = EncyptedData({
      encryptedData: encryptedData,
      dataHash: dataHash,
      encryptedKeyParts: encryptedKeyParts
    });

    for (uint i = 0; i < selectedProposalIndices.length; i++) {
      uint proposalIndex = selectedProposalIndices[i];
      KeeperProposal storage proposal = keeperProposals[proposalIndex];

      activeKeepers[proposal.keeperAddress] = ActiveKeeper({
        publicKey: proposal.publicKey,
        keyPartHash: keyPartHashes[i],
        lastCheckInTime: now,
        balance: 0
      });

      activeKeepersAddresses.push(proposal.keeperAddress);
    }

    state = States.Active;
  }


  function ownerCheckIn() payable external
    ownerOnly()
    atState(States.Active)
  {
    // TODO: implement
  }


  function keeperCheckIn() external
    activeKeepersOnly()
    atState(States.Active)
  {
    // TODO: implement
  }


  function supplyKey(bytes keyPart) external
    activeKeepersOnly()
    atState(States.CallForKeys)
  {
    // TODO: implement
  }


  function cancel() external
    ownerOnly()
    atState(States.Active)
  {
    // TODO: implement
  }

}
