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
  '0xE44c4cf797505AF1527B11e4F4c6f95531b4Be24'
  '0x69e1CB5cFcA8A311586e3406ed0301C06fb839a2'
  '0xF014343BDFFbED8660A9d8721deC985126f189F3'
  '0x0E79EDbD6A727CfeE09A2b1d0A59F7752d5bf7C9'
  '0x9bC1169Ca09555bf2721A5C9eC6D69c8073bfeB4'
  '0xa23eAEf02F9E0338EEcDa8Fdd0A73aDD781b2A86'
  '0xc449a27B106BE1120Bd1Fd62F8166A2F61588eb9'
  '0xF24AE9CE9B62d83059BD849b9F36d3f4792F5081'
  '0xc44B027a94913FB515B19F04CAf515e74AE24FD6'
  '0xcb0236B37Ff19001633E38808bd124b60B1fE1ba'
  '0x715e632C0FE0d07D02fC3d2Cf630d11e1A45C522'
  '0x90FFD070a8333ACB4Ac1b8EBa59a77f9f1001819'
  '0x036945CD50df76077cb2D6CF5293B32252BCe247'
  '0x23f0227FB09D50477331D2BB8519A38a52B9dFAF'
  '0x799759c45265B96cac16b88A7084C068d38aFce9'
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
