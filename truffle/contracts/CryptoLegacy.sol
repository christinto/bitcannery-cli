pragma solidity ^0.4.15;

import "./SafeMath.sol";

contract CryptoLegacy {

  event KeysNeeded();

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
    require(activeKeepers[msg.sender].lastCheckInAt > 0);
    _;
  }

  struct KeeperProposal {
    address keeperAddress;
    bytes publicKey; // 64-byte
    uint keepingFee;
  }

  struct ActiveKeeper {
    bytes publicKey; // 64-byte
    bytes32 keyPartHash; // sha-3 hash
    uint keepingFee;
    uint balance;
    uint lastCheckInAt;
    bool keyPartSupplied;
  }

  struct EncryptedData {
    bytes encryptedData;
    uint aesCounter;
    bytes32 dataHash; // sha-3 hash
    bytes encryptedKeyParts; // packed array of key parts
    bytes[] suppliedKeyParts;
  }

  address public owner = msg.sender;
  uint public checkInInterval;

  uint public lastOwnerCheckInAt;

  States public state = States.CallForKeepers;

  EncryptedData public encryptedData;

  KeeperProposal[] public keeperProposals;
  mapping(address => bool) public proposedKeeperFlags;
  mapping(bytes32 => bool) private proposedPublicKeyHashes;

  mapping(address => ActiveKeeper) public activeKeepers;
  address[] public activeKeepersAddresses;

  // Sum of keeping fees of all active Keepers.
  uint totalKeepingFee;

  // We need this because current version of Solidity doesn't support non-integer numbers.
  // We set it to be equal to number of wei in eth to make sure we transfer keeping fee with
  // enough precision.
  uint public constant KEEPING_FEE_ROUNDING_MULT = 1 ether;

  // Don't allow owner to specify check-in interval less than this when creating a new contract.
  uint public constant MINIMUM_CHECK_IN_INTERVAL = 1 hours;


  // Called by the person who possesses the data they wish to transfer.
  // This person becomes the owner of the contract.
  //
  function CryptoLegacy(uint _checkInInterval) public {
    require(_checkInInterval >= MINIMUM_CHECK_IN_INTERVAL);
    checkInInterval = _checkInInterval;
  }


  function getNumProposals() external constant returns (uint) {
    return keeperProposals.length;
  }


  function getNumKeepers() external constant returns (uint) {
    return activeKeepersAddresses.length;
  }


  function getNumSuppliedKeyParts() external constant returns (uint) {
    return encryptedData.suppliedKeyParts.length;
  }


  function getSuppliedKeyPart(uint index) external constant returns (bytes) {
    return encryptedData.suppliedKeyParts[index];
  }


  // Called by a Keeper to submit their proposal.
  //
  function submitKeeperProposal(bytes publicKey, uint keepingFee) external
    atState(States.CallForKeepers)
  {
    require(msg.sender != owner);
    require(!proposedKeeperFlags[msg.sender]);
    require(publicKey.length <= 128);

    bytes32 publicKeyHash = keccak256(publicKey);
    require(!proposedPublicKeyHashes[publicKeyHash]);

    keeperProposals.push(KeeperProposal({
      keeperAddress: msg.sender,
      publicKey: publicKey,
      keepingFee: keepingFee
    }));

    proposedKeeperFlags[msg.sender] = true;
    proposedPublicKeyHashes[publicKeyHash] = true;
  }


  // Called by owner to accept selected proposals and activate the contract.
  //
  function acceptKeepers(
    uint[] selectedProposalIndices,
    bytes32[] keyPartHashes,
    bytes encryptedKeyParts,
    bytes _encryptedData,
    bytes32 dataHash,
    uint aesCounter
  ) payable external
    ownerOnly()
    atState(States.CallForKeepers)
  {
    encryptedData = EncryptedData({
      encryptedData: _encryptedData,
      aesCounter: aesCounter,
      dataHash: dataHash,
      encryptedKeyParts: encryptedKeyParts,
      suppliedKeyParts: new bytes[](0)
    });

    totalKeepingFee = writeKeepers(selectedProposalIndices, keyPartHashes);

    uint balance = this.balance;
    require(balance >= totalKeepingFee);

    state = States.Active;
    lastOwnerCheckInAt = getBlockTimestamp();
  }


  // Returns: sum of keeping fees of all selected Keepers.
  //
  function writeKeepers(
    uint[] selectedProposalIndices,
    bytes32[] keyPartHashes
  )
  internal returns (uint)
  {
    uint timestamp = getBlockTimestamp();
    uint totalKeepingFee = 0;

    for (uint i = 0; i < selectedProposalIndices.length; i++) {
      uint proposalIndex = selectedProposalIndices[i];
      KeeperProposal storage proposal = keeperProposals[proposalIndex];

      activeKeepers[proposal.keeperAddress] = ActiveKeeper({
        publicKey: proposal.publicKey,
        keyPartHash: keyPartHashes[i],
        keepingFee: proposal.keepingFee,
        lastCheckInAt: timestamp,
        balance: 0,
        keyPartSupplied: false
      });

      activeKeepersAddresses.push(proposal.keeperAddress);
      totalKeepingFee = SafeMath.add(totalKeepingFee, proposal.keepingFee);
    }

    return totalKeepingFee;
  }


  // Updates owner check-in time and credits all active Keepers with keeping fee.
  //
  function ownerCheckIn() payable external
    ownerOnly()
    atState(States.Active)
  {
    uint excessBalance = creditKeepers({prepayOneKeepingPeriodUpfront: true});

    lastOwnerCheckInAt = getBlockTimestamp();

    if (excessBalance > 0) {
      msg.sender.transfer(excessBalance);
    }
  }


  // Returns: excess balance that can be transferred back to owner.
  //
  function creditKeepers(bool prepayOneKeepingPeriodUpfront) internal returns (uint) {
    uint timestamp = getBlockTimestamp();

    uint timeSinceLastOwnerCheckIn = SafeMath.sub(timestamp, lastOwnerCheckInAt);
    require(timeSinceLastOwnerCheckIn <= checkInInterval);

    uint keepingFeeMult = SafeMath.mul(KEEPING_FEE_ROUNDING_MULT, timeSinceLastOwnerCheckIn) / checkInInterval;
    uint requiredBalance = 0;

    for (uint i = 0; i < activeKeepersAddresses.length; i++) {
      ActiveKeeper storage keeper = activeKeepers[activeKeepersAddresses[i]];
      uint balanceToAdd = SafeMath.mul(keeper.keepingFee, keepingFeeMult) / KEEPING_FEE_ROUNDING_MULT;
      keeper.balance = SafeMath.add(keeper.balance, balanceToAdd);
      requiredBalance = SafeMath.add(requiredBalance, keeper.balance);
    }

    if (prepayOneKeepingPeriodUpfront) {
      requiredBalance = SafeMath.add(requiredBalance, totalKeepingFee);
    }

    uint balance = this.balance;

    require(balance >= requiredBalance);
    return balance - requiredBalance;
  }


  // Pays the Keeper their balance and updates their check-in time. Verifies that the owner
  // checked in in time and, if not, transfers the contract into CALL_FOR_KEYS state.
  //
  // A Keeper can call this method to get his reward regardless of the contract state.
  //
  function keeperCheckIn() external
    activeKeepersOnly()
  {
    uint timestamp = getBlockTimestamp();

    ActiveKeeper storage keeper = activeKeepers[msg.sender];
    keeper.lastCheckInAt = timestamp;

    if (state == States.Active) {
      uint timeSinceLastOwnerCheckIn = SafeMath.sub(timestamp, lastOwnerCheckInAt);
      if (timeSinceLastOwnerCheckIn > checkInInterval) {
        state = States.CallForKeys;
        KeysNeeded();
      }
    }

    uint keeperBalance = keeper.balance;
    if (keeperBalance > 0) {
      keeper.balance = 0;
      msg.sender.transfer(keeperBalance);
    }
  }


  // Called by Keepers to supply their decrypted key parts.
  //
  function supplyKey(bytes keyPart) external
    activeKeepersOnly()
    atState(States.CallForKeys)
  {
    ActiveKeeper storage keeper = activeKeepers[msg.sender];
    require(!keeper.keyPartSupplied);

    bytes32 suppliedKeyPartHash = keccak256(keyPart);
    require(suppliedKeyPartHash == keeper.keyPartHash);

    encryptedData.suppliedKeyParts.push(keyPart);
    keeper.keyPartSupplied = true;

    uint toBeTransferred = keeper.balance;
    keeper.balance = 0;

    if (toBeTransferred > 0) {
      msg.sender.transfer(toBeTransferred);
    }
  }


  // Cancels the contract and notifies the Keepers. Credits all active Keepers with keeping fee,
  // as if this was a check-in.
  //
  // Pass continuationContractAddress to notify the Keepers that a new contract was started
  // instead of this one to elect new Keepers.
  //
  function cancel() payable external
    ownerOnly()
    atState(States.Active)
  {
    state = States.Cancelled;

    // We don't require paying one keeping period upfront as the contract is being cancelled;
    // we just require paying till the present moment.
    uint excessBalance = creditKeepers({prepayOneKeepingPeriodUpfront: true});

    if (excessBalance > 0) {
      msg.sender.transfer(excessBalance);
    }
  }

  // We can rely on the value of now (block.timestamp) for our purposes, as the consensus
  // rule is that a block's timestamp must be 1) more than the parent's block timestamp;
  // and 2) less than the current wall clock time. See:
  // https://github.com/ethereum/go-ethereum/blob/885c13c/consensus/ethash/consensus.go#L223
  //
  function getBlockTimestamp() internal constant returns (uint) {
    return now;
  }

}
