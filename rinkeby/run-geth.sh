#!/bin/sh
set -e

UNLOCK='0,1'
DATADIR="~/.rinkeby"

geth \
  --datadir="$DATADIR" \
  --rinkeby \
  --rpc --rpcapi='db,eth,net,web3,personal' \
  --rpcport '9545' --rpcaddr '127.0.0.1' --rpccorsdomain '*' \
  --unlock "$UNLOCK" \
  --password rinkeby-passwords.txt \
  console
