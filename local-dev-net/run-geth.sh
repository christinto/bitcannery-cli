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

GETH_MINIMUM_VERSION='1.7.3'

DEV_PERIOD=1
RESET=0
UNLOCK='1,2,3,4,5'

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
  --unlock "$UNLOCK" \
  --password geth-passwords.txt \
  console
