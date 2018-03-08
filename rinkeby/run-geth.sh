#!/bin/sh
set -e

function join {
  local IFS="$1";
  shift;
  echo "$*";
}

ACC=(
  '0x6da26a02b4364dcff7cfd58f8a8b9c6ce62a0c61'
  '0xbb2bced367d8c4712baac44616c1e61797f392a3'
  '0xc712deae0ab6abf65285ed42400b127056f3c664'
  '0x80433df99abe278680a20f0bc70bbf243d51c803'
)
ACCOUNTS_TO_UNLOCK=$(join , ${ACC[@]})
DATADIR="~/.rinkeby"

geth \
  --datadir="$DATADIR" \
  --rinkeby \
  --rpc --rpcapi='db,eth,net,web3,personal' \
  --rpcport '9545' --rpcaddr '127.0.0.1' --rpccorsdomain '*' \
  --password rinkeby-passwords.txt \
  --unlock "$ACCOUNTS_TO_UNLOCK" \
  console
