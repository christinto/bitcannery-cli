const assert = require('chai').assert
const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')
const SafeMath = artifacts.require('./SafeMath.sol')

const {assertTxSucceeds, assertTxSucceedsGeneratingEvents, assertTxFails} = require('./helpers')
const {States, assembleKeeperStruct} = require('../utils/contract-api')
const {keeperPublicKeys} = require('./data')

// TODO: test that continuation contract cannot be announced in CallForKeys state
// TODO: test that continuation contract cannot be announced in Cancelled state

contract('CryptoLegacy, rotating Keepers:', (accounts) => {

  function getAddresses() {
    const [_, Alice, Bob, ...keeper] = accounts
    return {Alice, Bob, keeper}
  }

  const addr = getAddresses()
  const keepingFees = [100, 150, 200]

  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract
  let continuationContract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(contract.setVersion(2), `setting main version`);

    continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting cont version`);
  })

  it(`doesn't allow to announce continuation contract in CallForKeepers state`, async () => {
    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows first Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      keepingFees[0],
      {from: addr.keeper[0]})
    )
  })

  it(`allows second Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[1],
      keepingFees[1],
      {from: addr.keeper[1]})
    )
  })

  it(`allows third Keeper to submit a proposal`, async () => {
    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[2],
      keepingFees[2],
      {from: addr.keeper[2]})
    )
  })

  it(`doesn't allow to announce continuation contract in CallForKeepers state even when ` +
    `there are pending keeping proposals`, async () => {
    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows owner to accept selected Keeper proposals and activate the contract`, async () => {
    await assertTxSucceeds(contract.acceptKeepers(
      [0, 2], // selected proposal indices
      ['0x1122330000000000000000000000000000000000000000000000000000000000', // hashes of key parts
       '0x4455660000000000000000000000000000000000000000000000000000000000'],
      '0xaabbcc', // encrypted key parts, packed into byte array
      '0xabcdef', // encrypted data
      '0x0000110000000000000000000000000000000000000000000000000000000000', // hash of original data
      42, // counter value for AES CTR mode,
      {
        from: addr.Alice,
        value: keepingFees[0] + keepingFees[2]
      }
    ))
    assert.equal(await contract.state(), States.Active)
  })

  it(`doesn't allow non-owner to announce continuation contract`, async () => {
    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Bob}
    ), 'Bob')

    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.keeper[0]}
    ), 'a Keeper')
  })

  it(`doesn't allow to announce a non-existing continuation contract`, async () => {
    await assertTxFails(contract.announceContinuationContract(
      '0x1234567890abcdef000000000000000000000000',
      {from: addr.Alice}
    ))
  })

  it(`doesn't allow to announce a non-conforming continuation contract`, async () => {
    const safeMath = await SafeMath.new()

    await assertTxFails(contract.announceContinuationContract(
      safeMath.address,
      {from: addr.keeper[0]}
    ))
  })

  it(`doesn't allow to announce a continuation contract of a previous version`, async () => {
    const continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(1), `setting version`);

    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`doesn't allow to announce a continuation contract of a different owner`, async () => {
    const continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Bob})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting version`);

    await assertTxFails(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows to announce continuation contract in Active state, generating the event`, async () => {
    const expectedEvent = {
      name: 'ContinuationContractAnnounced', args: {
        continuationContractAddress: String(continuationContract.address)
      }
    }
    await assertTxSucceedsGeneratingEvents(
      contract.announceContinuationContract(continuationContract.address, {from: addr.Alice}),
      [expectedEvent]
    )
  })

  it(`records continuation contract address into the contract's state`, async () => {
    const continuationContractAddress = await contract.continuationContractAddress()
    assert.equal(String(continuationContractAddress), String(continuationContract.address))
  })

  it(`doesn't allow to change announced contract address`, async () => {
    const newContinuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(newContinuationContract.setVersion(2), `setting version`);

    await assertTxFails(contract.announceContinuationContract(
      newContinuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows owner to cancel a contract with announced continuation contract`, async () => {
    await assertTxSucceeds(contract.cancel({from: addr.Alice}))
    assert.equal(await contract.state(), States.Cancelled)
  })

})
