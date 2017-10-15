const CryptoLegacy = artifacts.require('./CryptoLegacy.sol')

const keeperPublicKey = '0x02586d0100021eedad6d27cfe923635e17de7b30c93455724a5ebcfa68a414167f6383298b78e478ccae419bcaab4985e301c1891de77330998a38e5968874a9'

contract('CryptoLegacyTest.js', function(accounts) {

  const [Alice, Bob, ...keepers] = accounts

  const checkInInterval = 10
  const keepingFee = 1
  const finalReward = 10

  let contract

  it('should create a contract', async function() {
    const instance = await CryptoLegacy.new(checkInInterval, keepingFee, finalReward, {from: Alice})
    contract = instance
    assert.notEqual(contract, null, 'contract should exist')
    assert.notEqual(contract, undefined, 'contract should exist')
  })

  it('should start from 0 state', async function() {
    const state = await contract.state()
    assert.equal(state, '0', 'should have started in 0 state')
  })

  it('should have correct params', async function() {
    const owner = await contract.owner()
    assert.equal(owner, Alice, 'should have Alice as an owner')
    const _finalReward = await contract.finalReward()
    assert.equal(_finalReward, finalReward, `should have final reward ${finalReward}`)
    const _keepingFee = await contract.keepingFee()
    assert.equal(_keepingFee, `${keepingFee}`, `should have keeping fee ${keepingFee}`)
    const _checkInInterval = await contract.checkInInterval()
    assert.equal(_checkInInterval, checkInInterval, `should have chech-in interval ${checkInInterval}`)
  })

  it('receives proposal from keeper', async function() {
    await contract.submitKeeperProposal(keeperPublicKey, {from: keepers[0]})
    const proposal = await contract.keeperProposals(0)
    assert.equal(proposal[0], keepers[0], 'should have received proposal from the first keeper')
    assert.equal(proposal[1], keeperPublicKey, 'should have received keeper key in proposal')
  })

})
