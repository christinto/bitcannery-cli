#!/bin/sh
set -e

print_help_and_exit() {
  echo "
./run-geth [-hRu] [-b N_SEC]

  -h | --help

     Print help and exit.

  -r | --reset

     Reset blockchain state.

  -u | --unlock

     Unlock specified accounts. If not passed, accounts 1—3 are unlocked.

  -b N_SEC | --block-each-sec N_SEC

     Mine block each N_SEC seconds. Pass 0 to mine a block only when there
     are pending transactions. Default is 1.
  "
  exit 1
}

function join {
  local IFS="$1";
  shift;
  echo "$*";
}

ACC=(
  '0x627306090abab3a6e1400e9345bc60c78a8bef57'
  '0xf17f52151ebef6c7334fad080c5704d77216b732'
  '0xc5fdf4076b8f3a5357c5e395ab970b5b54098fef'
  '0x821aea9a577a9b44299b9c15c88cf3087f3b5544'
  '0x0d1d4e623d10f9fba5db95830f7d3839406c6af2'
  '0x2932b7a2355d6fecc4b5c0b6bd44cc31df247a2e'
  '0x2191ef87e392377ec08e7c08eb105ef5448eced5'
  '0x0f4f2ac550a1b4e2280d04c21cea7ebd822934b5'
  '0x6330a553fc93768f612722bb8c2ec78ac90b3bbc'
  '0x5aeda56215b167893e80b4fe645ba6d5bab767de'
)

GETH_MINIMUM_VERSION='1.7.3'

DEV_PERIOD=1
RESET=0
ACCOUNTS_TO_UNLOCK=$(join , ${ACC[@]})

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_help_and_exit
      ;;
    -r|--reset)
      RESET=1
      shift
      ;;
    -b|--block-each-sec)
      DEV_PERIOD="$2"
      shift; shift
      ;;
    -u|--unlock)
      UNLOCK="$2"
      shift; shift
      ;;
    *)
      echo "Unexpected option: $1"
      print_help_and_exit
      ;;
  esac
done

geth_bin=$(command -v geth || echo '')

if [ -x './geth' ]; then
  geth_bin='./geth'
fi

if [ -z "$geth_bin" ]; then
  echo
  echo "No geth binary found. Please install geth version $GETH_MINIMUM_VERSION or later."
  echo "You can also build geth yourself and place the built binary into this directory."
  echo
  exit 1
fi

echo "Using geth found at $geth_bin"

function ver() {
  printf "%04d%04d%04d%04d" $(echo "$1" | tr '.' ' ')
}

geth_full_version=$("$geth_bin" version | grep -e '^Version:' | perl -pe 's/[^\d]*(\d.*)/\1/g')
geth_version=$(echo $geth_full_version | perl -pe 's/-.*//')

if [ $(ver "$GETH_MINIMUM_VERSION") -gt $(ver "$geth_version") ]; then
  echo
  echo "Error: the minimum geth version is $GETH_MINIMUM_VERSION, you have $geth_full_version."
  echo "Please update your geth and run this command again. You can also"
  echo "build geth yourself and place the built binary into this directory."
  echo
  exit 1
fi

if [ "$RESET" = 1 ]; then
  echo
  echo 'Resetting blockchain...'
  echo
  rm -rf .blockchain
  tar -xzf blockchain.tar.gz
else
  echo
  echo 'Not resetting blockchain'
  echo
  if ! [ -d '.blockchain' ]; then
    tar -xzf blockchain.tar.gz
  fi
fi

set -x

# For network id, see: https://github.com/ethereum/go-ethereum/blob/6d6a5a9/params/config.go#L92
#
exec "$geth_bin" \
  --dev \
  --networkid=1337 \
  --datadir='.blockchain' \
  --rpc --rpcapi='db,eth,net,web3,personal' \
  --rpcport '9545' --rpcaddr '127.0.0.1' --rpccorsdomain '*' \
  --mine \
  --dev.period="$DEV_PERIOD" \
  --password geth-passwords.txt \
  --unlock "$ACCOUNTS_TO_UNLOCK" \
  console
