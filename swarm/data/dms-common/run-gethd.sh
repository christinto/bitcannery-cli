#!/bin/sh
set -e

ACCOUNTS_TO_UNLOCK=$(ls /root/.rinkeby/keystore | grep -Po '[0-9a-f]*$' | awk -vORS=, '{print "0x"$1""}' | sed 's/,$//')
DATADIR="/root/.rinkeby"

echo 'datadir:' ${DATADIR}
echo 'accounts:' ${ACCOUNTS_TO_UNLOCK}

/usr/bin/geth \
  --datadir="$DATADIR" \
  --rinkeby \
  --rpc --rpcapi='db,eth,net,web3,personal' \
  --rpcport '9545' --rpcaddr '127.0.0.1' --rpccorsdomain '*' \
  --password /root/passwords.txt \
  --unlock "$ACCOUNTS_TO_UNLOCK"
