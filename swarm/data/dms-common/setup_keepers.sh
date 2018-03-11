#!/bin/bash

for i in {1..8}
do
  echo "Setuping keeper-${i}..."

  BASIC_KEEPER_FEE_FINNEY=50
  RANDOM_ADDITION_FINNEY=$(awk 'BEGIN{srand();print int(rand()*(100-20))+20 }')
  KEEPER_FEE=$((BASIC_KEEPER_FEE_FINNEY+RANDOM_ADDITION_FINNEY))

  echo "Keeper price (finney):" ${KEEPER_FEE}

  CONFIG_NAME="keeper-${i}" /usr/bin/node /root/crypto-legacy/dms/index.js \
    set-client-options --rpc-connection 'http://localhost:9545' --account-index $((i-1))

  CONFIG_NAME="keeper-${i}" /usr/bin/node /root/crypto-legacy/dms/index.js \
    keeper set-fee ${KEEPER_FEE} finney

done
