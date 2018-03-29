import {States, assembleKeeperStruct} from '../../dms/src/utils/contract-api'

import {getAddresses,
  assert,
  assertTxSucceeds,
  assertTxSucceedsGeneratingEvents,
  assertTxReverts,
  acceptKeepersAndActivate} from './helpers'

import {keeperPublicKeys} from './data'

const CryptoLegacy = artifacts.require('./CryptoLegacyDebug.sol')
const SafeMath = artifacts.require('./SafeMath.sol')


contract('CryptoLegacy, rotating Keepers:', (accounts) => {

  const addr = getAddresses(accounts)
  const keepingFees = [100, 150, 200]
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract
  let continuationContract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(contract.setVersion(2), `setting main version`);

    continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting continuation version`)
  })

  it(`doesn't allow to announce continuation contract in CallForKeepers state`, async () => {
    await assertTxReverts(contract.announceContinuationContract(
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
    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows owner to accept selected Keeper proposals and activate the contract`, async () => {

    await acceptKeepersAndActivate(contract, {
      selectedProposalIndices: [0, 2],
      keyPartHashes: [
        '0x1122330000000000000000000000000000000000000000000000000000000000',
        '0x4455660000000000000000000000000000000000000000000000000000000000'],
      encryptedKeyParts: '0xabcdef',
      shareLength: 42,
      encryptedLegacyData: '0x123456',
      legacyDataHash: '0x678901',
      aesCounter: 43
    }, {
      from: addr.Alice,
      value: keepingFees[0] + keepingFees[2]
    })

    assert.equal(await contract.state(), States.Active, `contract state`)
  })

  it(`doesn't allow non-owner to announce continuation contract`, async () => {
    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Bob}
    ), 'Bob')

    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.keeper[0]}
    ), 'a Keeper')
  })

  it(`doesn't allow to announce a non-existing continuation contract`, async () => {
    await assertTxReverts(contract.announceContinuationContract(
      '0x1234567890abcdef000000000000000000000000',
      {from: addr.Alice}
    ))
  })

  it(`doesn't allow to announce a non-conforming continuation contract`, async () => {
    const safeMath = await SafeMath.new()

    await assertTxReverts(contract.announceContinuationContract(
      safeMath.address,
      {from: addr.keeper[0]}
    ))
  })

  it(`doesn't allow to announce a continuation contract of a previous version`, async () => {
    const continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(1), `setting version`);

    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`doesn't allow to announce a continuation contract of a different owner`, async () => {
    const continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Bob})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting version`);

    await assertTxReverts(contract.announceContinuationContract(
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

    await assertTxReverts(contract.announceContinuationContract(
      newContinuationContract.address,
      {from: addr.Alice}
    ))
  })

  it(`allows owner to cancel a contract with announced continuation contract`, async () => {
    await assertTxSucceeds(contract.cancel({from: addr.Alice}))
    assert.equal(await contract.state(), States.Cancelled)
  })

})


contract('CryptoLegacy, rotating Keepers:', (accounts) => {

  const addr = getAddresses(accounts)
  const keepingFees = [100, 150, 200]
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract
  let continuationContract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(contract.setVersion(1), `setting main version`);

    continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting continuation version`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[0],
      keepingFees[0],
      {from: addr.keeper[0]}),
      `submitting first proposal`)

    await assertTxSucceeds(contract.submitKeeperProposal(
      keeperPublicKeys[1],
      keepingFees[1],
      {from: addr.keeper[1]}),
      `submitting second proposal`)

    await acceptKeepersAndActivate(contract, {
      selectedProposalIndices: [0, 1],
      keyPartHashes: [
        '0x1122330000000000000000000000000000000000000000000000000000000000',
        '0x4455660000000000000000000000000000000000000000000000000000000000'],
      encryptedKeyParts: '0xabcdef',
      shareLength: 42,
      encryptedLegacyData: '0x123456',
      legacyDataHash: '0x678901',
      aesCounter: 43
    }, {
      from: addr.Alice,
      value: keepingFees[0] + keepingFees[1]
    })

    await assertTxSucceeds(contract.increaseTimeBy(checkInIntervalSec + 1), `increasing time`)
    await assertTxSucceeds(contract.keeperCheckIn({from: addr.keeper[0]}), `keeper checks in`)

    assert.equal(+await contract.state(), States.CallForKeys, `contract state`)
  })

  it(`doesn't allow to announce continuation contract in CallForKeys state`, async () => {
    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })

})


contract('CryptoLegacy, rotating Keepers:', (accounts) => {

  const addr = getAddresses(accounts)
  const checkInIntervalSec = 2 * 60 * 60 // 2 hours

  let contract
  let continuationContract

  before(async () => {
    contract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(contract.setVersion(1), `setting main version`);

    continuationContract = await CryptoLegacy.new(checkInIntervalSec, {from: addr.Alice})
    await assertTxSucceeds(continuationContract.setVersion(2), `setting continuation version`)

    await assertTxSucceeds(contract.cancel({from: addr.Alice, value: 0}), `cancelling contract`)
    assert.equal(+await contract.state(), States.Cancelled, `contract state`)
  })

  it(`doesn't allow to announce continuation contract in Cancelled state`, async () => {
    await assertTxReverts(contract.announceContinuationContract(
      continuationContract.address,
      {from: addr.Alice}
    ))
  })
})
