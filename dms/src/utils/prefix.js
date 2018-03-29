export function trim0x(str) {
  if (str.substring(0, 2) === '0x') {
    return str.substring(2)
  }

  return str
}

export function ensure0x(str) {
  if (str.substring(0, 2) !== '0x') {
    return '0x' + str
  }

  return str
}
