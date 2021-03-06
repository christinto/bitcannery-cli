pragma solidity ^0.4.18;

import "./SafeMath.sol";
import "./CryptoLegacyBaseAPI.sol";

contract CryptoLegacy is CryptoLegacyBaseAPI {

  // Version of the contract API.
  uint public constant VERSION = 1;

  event KeysNeeded();
  event ContinuationContractAnnounced(address continuationContractAddress);
  event Cancelled();

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

  modifier atEitherOfStates(States state1, States state2) {
    require(state == state1 || state == state2);
    _;
  }

  modifier ownerOnly() {
    require(msg.sender == owner);
    _;
  }

  modifier activeKeepersOnly() {
    require(isActiveKeeper(msg.sender));
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
    bytes16 aesCounter;
    bytes32 dataHash; // sha-3 hash
    uint16 shareLength;
    bytes[] suppliedKeyParts;
  }

  address public owner = msg.sender;

  // When owner wants to elect new Keepers, she cancels the contract and starts a new one.
  // This variable contains the address of the new continuation contract.
  address public continuationContractAddress = 0;

  uint public checkInInterval;
  uint public lastOwnerCheckInAt;

  States public state = States.CallForKeepers;

  bytes[] public encryptedKeyPartsChunks;
  EncryptedData public encryptedData;

  KeeperProposal[] public keeperProposals;
  mapping(address => bool) public proposedKeeperFlags;
  mapping(bytes32 => bool) private proposedPublicKeyHashes;

  mapping(address => ActiveKeeper) public activeKeepers;
  address[] public activeKeepersAddresses;

  // Sum of keeping fees of all active Keepers.
  uint public totalKeepingFee;

  // We need this because current version of Solidity doesn't support non-integer numbers.
  // We set it to be equal to number of wei in eth to make sure we transfer keeping fee with
  // enough precision.
  uint public constant KEEPING_FEE_ROUNDING_MULT = 1 ether;

  // Don't allow owner to specify check-in interval less than this when creating a new contract.
  uint public constant MINIMUM_CHECK_IN_INTERVAL = 1 minutes;


  // Called by the person who possesses the data they wish to transfer.
  // This person becomes the owner of the contract.
  //
  function CryptoLegacy(uint _checkInInterval) public {
    require(_checkInInterval >= MINIMUM_CHECK_IN_INTERVAL);
    checkInInterval = _checkInInterval;
  }


  function getVersion() public view returns (uint) {
    return VERSION;
  }


  function getOwner() public view returns (address) {
    return owner;
  }


  function getContinuationContractAddress() public view returns (address) {
    return continuationContractAddress;
  }


  function isAcceptingKeeperProposals() public view returns (bool) {
    return state == States.CallForKeepers;
  }


  function getNumProposals() external view returns (uint) {
    return keeperProposals.length;
  }


  function getNumKeepers() external view returns (uint) {
    return activeKeepersAddresses.length;
  }


  function getNumEncryptedKeyPartsChunks() external view returns (uint) {
    return encryptedKeyPartsChunks.length;
  }


  function getEncryptedKeyPartsChunk(uint index) external view returns (bytes) {
    return encryptedKeyPartsChunks[index];
  }


  function getNumSuppliedKeyParts() external view returns (uint) {
    return encryptedData.suppliedKeyParts.length;
  }


  function getSuppliedKeyPart(uint index) external view returns (bytes) {
    return encryptedData.suppliedKeyParts[index];
  }

  function isActiveKeeper(address addr) public view returns (bool) {
    return activeKeepers[addr].lastCheckInAt > 0;
  }

  function didSendProposal(address addr) public view returns (bool) {
    return proposedKeeperFlags[addr];
  }


  // Called by a Keeper to submit their proposal.
  //
  function submitKeeperProposal(bytes publicKey, uint keepingFee) external
    atState(States.CallForKeepers)
  {
    require(msg.sender != owner);
    require(!didSendProposal(msg.sender));
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

  // Calculates how much would it cost the owner to activate contract with given Keepers.
  //
  function calculateActivationPrice(uint[] selectedProposalIndices) public view returns (uint) {
    uint _totalKeepingFee = 0;

    for (uint i = 0; i < selectedProposalIndices.length; i++) {
      uint proposalIndex = selectedProposalIndices[i];
      KeeperProposal storage proposal = keeperProposals[proposalIndex];
      _totalKeepingFee = SafeMath.add(_totalKeepingFee, proposal.keepingFee);
    }

    return _totalKeepingFee;
  }

  // Called by owner to accept selected Keeper proposals.
  // May be called multiple times.
  //
  function acceptKeepers(
    uint[] selectedProposalIndices,
    bytes32[] keyPartHashes,
    bytes encryptedKeyParts
  ) external
    ownerOnly()
    atState(States.CallForKeepers)
  {
    require(selectedProposalIndices.length > 0);
    require(keyPartHashes.length == selectedProposalIndices.length);
    require(encryptedKeyParts.length > 0);

    uint timestamp = getBlockTimestamp();
    uint chunkKeepingFee = 0;

    for (uint i = 0; i < selectedProposalIndices.length; i++) {
      uint proposalIndex = selectedProposalIndices[i];
      KeeperProposal storage proposal = keeperProposals[proposalIndex];

      require(activeKeepers[proposal.keeperAddress].lastCheckInAt == 0);

      activeKeepers[proposal.keeperAddress] = ActiveKeeper({
        publicKey: proposal.publicKey,
        keyPartHash: keyPartHashes[i],
        keepingFee: proposal.keepingFee,
        lastCheckInAt: timestamp,
        balance: 0,
        keyPartSupplied: false
      });

      activeKeepersAddresses.push(proposal.keeperAddress);
      chunkKeepingFee = SafeMath.add(chunkKeepingFee, proposal.keepingFee);
    }

    totalKeepingFee = SafeMath.add(totalKeepingFee, chunkKeepingFee);
    encryptedKeyPartsChunks.push(encryptedKeyParts);
  }

  // Called by owner to activate the contract and distribute keys between Keepers
  // accepted previously using `acceptKeepers` function.
  //
  function activate(
    uint16 shareLength,
    bytes _encryptedData,
    bytes32 dataHash,
    bytes16 aesCounter
  ) payable external
    ownerOnly()
    atState(States.CallForKeepers)
  {
    require(activeKeepersAddresses.length > 0);

    uint balance = this.balance;
    require(balance >= totalKeepingFee);

    uint timestamp = getBlockTimestamp();
    lastOwnerCheckInAt = timestamp;

    for (uint i = 0; i < activeKeepersAddresses.length; i++) {
      ActiveKeeper storage keeper = activeKeepers[activeKeepersAddresses[i]];
      keeper.lastCheckInAt = timestamp;
    }

    encryptedData = EncryptedData({
      encryptedData: _encryptedData,
      aesCounter: aesCounter,
      dataHash: dataHash,
      shareLength: shareLength,
      suppliedKeyParts: new bytes[](0)
    });

    state = States.Active;
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


  // Calculates approximate price of a check-in, given that it will be performed right now.
  // Actual price may differ because
  //
  function calculateApproximateCheckInPrice() public view returns (uint) {
    uint keepingFeeMult = calculateKeepingFeeMult();
    uint requiredBalance = 0;

    for (uint i = 0; i < activeKeepersAddresses.length; i++) {
      ActiveKeeper storage keeper = activeKeepers[activeKeepersAddresses[i]];
      uint balanceToAdd = SafeMath.mul(keeper.keepingFee, keepingFeeMult) / KEEPING_FEE_ROUNDING_MULT;
      uint newKeeperBalance = SafeMath.add(keeper.balance, balanceToAdd);
      requiredBalance = SafeMath.add(requiredBalance, newKeeperBalance);
    }

    requiredBalance = SafeMath.add(requiredBalance, totalKeepingFee);
    uint balance = this.balance;

    if (balance >= requiredBalance) {
      return 0;
    } else {
      return requiredBalance - balance;
    }
  }


  // Returns: excess balance that can be transferred back to owner.
  //
  function creditKeepers(bool prepayOneKeepingPeriodUpfront) internal returns (uint) {
    uint keepingFeeMult = calculateKeepingFeeMult();
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


  function calculateKeepingFeeMult() internal view returns (uint) {
    uint timeSinceLastOwnerCheckIn = SafeMath.sub(getBlockTimestamp(), lastOwnerCheckInAt);
    require(timeSinceLastOwnerCheckIn <= checkInInterval);

    timeSinceLastOwnerCheckIn = ceil(timeSinceLastOwnerCheckIn, 600); // ceil to 10 minutes
    if (timeSinceLastOwnerCheckIn > checkInInterval) {
      timeSinceLastOwnerCheckIn = checkInInterval;
    }

    return SafeMath.mul(KEEPING_FEE_ROUNDING_MULT, timeSinceLastOwnerCheckIn) / checkInInterval;
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

    // Include one-period keeping fee that was held by contract in advance.
    uint toBeTransferred = SafeMath.add(keeper.balance, keeper.keepingFee);
    keeper.balance = 0;

    if (toBeTransferred > 0) {
      msg.sender.transfer(toBeTransferred);
    }
  }


  // Allows owner to announce continuation contract to all active Keepers.
  //
  // Continuation contract is used to elect new set of Keepers, e.g. to replace inactive ones.
  // When the continuation contract gets sufficient number of keeping proposals, owner will
  // cancel this contract and start the continuation one.
  //
  function announceContinuationContract(address _continuationContractAddress) external
    ownerOnly()
    atState(States.Active)
  {
    require(continuationContractAddress == 0);
    require(_continuationContractAddress != address(this));

    CryptoLegacyBaseAPI continuationContract = CryptoLegacyBaseAPI(_continuationContractAddress);

    require(continuationContract.getOwner() == getOwner());
    require(continuationContract.getVersion() >= getVersion());
    require(continuationContract.isAcceptingKeeperProposals());

    continuationContractAddress = _continuationContractAddress;
    ContinuationContractAnnounced(_continuationContractAddress);
  }


  // Cancels the contract and notifies the Keepers. Credits all active Keepers with keeping fee,
  // as if this was a check-in.
  //
  function cancel() payable external
    ownerOnly()
    atEitherOfStates(States.CallForKeepers, States.Active)
  {
    uint excessBalance = 0;

    if (state == States.Active) {
      // We don't require paying one keeping period upfront as the contract is being cancelled;
      // we just require paying till the present moment.
      excessBalance = creditKeepers({prepayOneKeepingPeriodUpfront: false});
    }

    state = States.Cancelled;
    Cancelled();

    if (excessBalance > 0) {
      msg.sender.transfer(excessBalance);
    }
  }


  // We can rely on the value of now (block.timestamp) for our purposes, as the consensus
  // rule is that a block's timestamp must be 1) more than the parent's block timestamp;
  // and 2) less than the current wall clock time. See:
  // https://github.com/ethereum/go-ethereum/blob/885c13c/consensus/ethash/consensus.go#L223
  //
  function getBlockTimestamp() internal view returns (uint) {
    return now;
  }


  // See: https://stackoverflow.com/a/2745086/804678
  //
  function ceil(uint x, uint y) internal pure returns (uint) {
    if (x == 0) return 0;
    return (1 + ((x - 1) / y)) * y;
  }

}
