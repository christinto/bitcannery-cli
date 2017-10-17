#!/bin/sh

exec geth --dev \
  --rpc --rpcapi="db,eth,net,web3,personal" \
  --rpcport "8545" --rpcaddr "127.0.0.1" --rpccorsdomain "localhost" \
  console
