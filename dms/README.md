# dms

## Development

Here is a commands for getting started.

```
cd dms
npm install
node index.js
```

## Setup
In a separate terminal tab please run `geth`

```
> cd truffle
> ./run-geth.sh // geth in dev mode
```
There is 9 accounts: 0,1,2,3,4,5,6,7,8

0 for Alice
1 for keeper-1
2 for keeper-2
3 for keeper-3

Let setup the environment for keepers
```
> cd dms
> CONFIG_NAME=keeper-1 node index.js
Using config file: ~/Library/Preferences/dms-nodejs/keeper-1.json
```

Change `accountIndex` in json for `keeper-1` to 1

```
> vim ~/Library/Preferences/dms-nodejs/keeper-1.json
{
        "rpcConnection": "http://localhost:8545",
        "accountIndex": <change this to keeper's index>,
        "keeper": {
          ...
        }
}
```
Do the same for `keeper-2` and `keeper-3`.


## Happy Path
Please use different tabs for Alice and Keepers.

Create the legacy contract
```
> node index.js deploy -f sample_legacy.txt
...
Generated Bob's private key... (you must give it to Bob)
0x2f0d197dc3a62fc8c23cc19c55c1efe85615f87229fd9c304bd43110a3d01a26

Check-in every 2 minutes
Your contract will be secured by 3 keepers
Publishing a new contract...
Contract is published.
Contract address is 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0

```

Save the contract address and Bob's private key.


In different tabs run keepers
```
CONFIG_NAME=keeper-1 node index.js keeper --contract 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

After running 3 keepers switch back to Alice's tab and finish the contract creation.
Alice should check-in at least once in 2 minutes.

```
node index.js checkin -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

You can also check status of contract with `status` command.

```
node index.js status -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

Keepers watch over the contract and perform check-ins to collect ether.
Stop check-ins and waiting for contract expiration.

Decrypt the legacy
```
node index.js decrypt -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```
