import BigNumber from 'bignumber.js'

export function formatWei(weiAmount) {
  weiAmount = new BigNumber(weiAmount)
  const weiAmountAbs = weiAmount.abs()
  if (weiAmountAbs.greaterThanOrEqualTo('1e12')) {
    return weiAmount.shift(-18) + ' ETH'
  } else if (weiAmountAbs.greaterThanOrEqualTo('1e7')) {
    return weiAmount.shift(-9) + ' Gwei'
  } else {
    return weiAmount + ' wei'
  }
}
