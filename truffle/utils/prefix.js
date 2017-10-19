function trim0x(str) {
  if (str.substring(0, 2) == '0x') {
    return str.substring(2)
  }

  return str
}

function ensure0x(str) {
  if (str.substring(0, 2) != '0x') {
    return '0x' + str
  }

  return str
}

module.exports = {
  trim0x,
  ensure0x,
}
