import BigNumber from 'bignumber.js'

export function formatWei(weiAmount) {
  weiAmount = new BigNumber(weiAmount)
  if (weiAmount.greaterThanOrEqualTo('1e9')) {
    return weiAmount.shift(-18) + ' ETH'
  } else {
    return weiAmount.shift(-9) + ' Gwei'
  }
}
