# dms

## Development

You'll need Node.js v8 or later.

```sh
$ cd dms
$ npm install

# This is a nop at the moment; just checking that it runs
$ node index.js
```

## Setup

Run `geth` in development mode to setup a local test network:

```sh
$ cd truffle
$ ./run-geth.sh
```

Alternatively, you can run geth manually and connect to ropsten or live network. In this case, make sure to pass these arguments to make it listen for RPC connections:

```
--rpc --rpcapi="db,eth,net,web3,personal" --rpcport "8545" --rpcaddr "127.0.0.1"
```

There are 9 accounts pre-generated on local development network. We'll use first one for Alice, and the next three for keepers.

Application uses config file to store configuration (see [here](dms/src/config.js#L13) for default configuration). Config files are stored in an OS-dependent location, which is printed when app starts.

Application supports having multiple configurations per machine. You can specify which config to use by setting `CONFIG_NAME` environment variable. We'll use this feature to run clients for Alice and three keepers on the same machine.

Let's setup three configurations for different keepers:

```sh
$ cd dms
$ CONFIG_NAME=keeper-1 node index.js
Using config file: ~/Library/Preferences/dms-nodejs/keeper-1.json
```

This will generate `keeper-1.json` config file containing default configuration, and also containing a unique keeper keypair. Since we'll use account with index `0` for Alice, let's edit `keeper-1.json` and change account index to `1`:

```text
$ vim ~/Library/Preferences/dms-nodejs/keeper-1.json
{
  "rpcConnection": "http://localhost:8545",
  "accountIndex": 1,
  "keeper": {
    ...
  }
}
```

Repeat the same for keeper 2 (`CONFIG_NAME=keeper-2`, `accountIndex: 2`) and keeper 3 (`CONFIG_NAME=keeper-3`, `accountIndex: 3`).

We won't specity `CONFIG_NAME` when running Alice's client, so it will use config with name `default` with `accountIndex: 0`, which is the default setting.


## Happy Path

Open a new terminal and run Alice's client to deploy a contract:

```sh
$ echo 'The answer is 42' > sample_legacy.txt
$ node index.js deploy -f sample_legacy.txt
...
Generated Bob's private key... (you must give it to Bob)
0x2f0d197dc3a62fc8c23cc19c55c1efe85615f87229fd9c304bd43110a3d01a26

Check-in every 2 minutes
Your contract will be secured by 3 keepers
Publishing a new contract...
Contract is published.
Contract address is 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0

```

We'll need two things from this output: address of the contract and Bob's private key. Now, open three more terminals and run keepers:

```sh
$ CONFIG_NAME=keeper-1 node index.js keeper -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
$ CONFIG_NAME=keeper-2 node index.js keeper -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
$ CONFIG_NAME=keeper-3 node index.js keeper -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

Right now each keeper can only handle one contract which is passed using `-c` option. This will be changed in the next iteration.

Switch back to Alice's terminal and activate the contract by anwsering `Y`. Alice should check-in at least once in 2 minutes (this is hard-coded in this iteration):

```sh
$ node index.js checkin -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

You can check status of a contract using `status` command:

```sh
$ node index.js status -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```

Keepers will check in right after Alice checks in, or when Alice failed to check in in time.

Stop performing check-ins by Alice for at least 2 minutes and watch keepers decrypt and submit their key parts. Now Bob can decrypt the legacy:

```sh
$ node index.js decrypt -c 0xfd8351c59cfd8bd4f332426cbe0734ec6bf17ce0
```
