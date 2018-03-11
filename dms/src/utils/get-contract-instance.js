import EthereumAddress from 'ethereum-address'
import BigNumber from 'bignumber.js'

import getContractAPIs from './get-contract-apis'
import UserError from './user-error'
import {addressIsZero} from './web3'

export default async function getContractInstance(addressOrID) {
  const {LegacyContract, registry} = await getContractAPIs()
  let address

  if (EthereumAddress.isAddress(addressOrID)) {
    address = addressOrID
  } else {
    address = await registry.getContractAddress(addressOrID)
    if (addressIsZero(address)) {
      throw new UserError(`there is no contract with id "${addressOrID}"`)
    }
  }

  try {
    return await LegacyContract.at(address).then(x => x)
    // .then(x => x) is needed to get a real Promise, so errors can be catched
  } catch (err) {
    if (/ no code /.test(err.message)) {
      const message =
        address === addressOrID
          ? `there is no contract at address ${address}`
          : `contract with id "${addressOrID}" was deleted (no contract at address ${address})`
      throw new UserError(message, err)
    }
    throw err
  }
}
