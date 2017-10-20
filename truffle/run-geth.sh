#!/bin/sh

rm -rf .blockchain
tar -xzf blockchain.tar.gz

nice -n 5 geth --dev \
  --datadir .blockchain \
  --rpc --rpcapi="db,eth,net,web3,personal" \
  --rpcport "8545" --rpcaddr "127.0.0.1" --rpccorsdomain "localhost" \
  --unlock '0,1,2,3,4,5,6,7,8' \
  --password geth-passwords.txt \
  --mine \
  console
