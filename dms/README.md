# dms

## Development

You'll need Node.js v8 or later.

```sh
$ cd dms
$ npm install

# Just checking that it runs
$ node index.js
```

Also, you'll need `geth` version `1.7.3` or later to run local test network.

## Setup

Run `geth` in development mode to setup a local test network:

```sh
$ cd local-dev-net
$ ./run-geth.sh
```

Alternatively, you can run `geth` manually and connect to `ropsten` or `main` network. In this case, make sure to pass these arguments to make it listen for RPC connections:

```
--rpc --rpcapi="db,eth,net,web3,personal" --rpcport "8545" --rpcaddr "127.0.0.1"
```

There are 9 accounts pre-generated on local development network. We'll use first one for Alice, and the next three for keepers.

Application supports having multiple configurations per machine. You can specify which config to use by setting `CONFIG_NAME` environment variable. This is mainly for development/testing purposes; we'll use this feature to run clients for Alice and three keepers on the same machine.

If you want to clear your config, just remove the directory (Linux, MacOS).
```
rm -rf ~/Library/Preferences/dms-nodejs
```

When you run `geth` using `run-geth` command, it starts RPC server on `http://localhost:9545`, which is a non-default port to prevent collision with your main `geth` instance. We need to tell our application to connect to this port instead of the default one. You can do it using `set-client-options` command:

```
$ node index.js set-client-options --rpc-connection 'http://localhost:9545'
JSON-RPC connection string set to: http://localhost:9545
```

We don't specity `CONFIG_NAME` when running Alice's client, so it uses the default config with account index 0.

Now let's setup three configurations for different keepers:

```sh
$ cd dms

# In terminal 1:
#
$ export CONFIG_NAME=keeper-1
$
$ node index.js set-client-options --rpc-connection 'http://localhost:9545' --account-index 1

Account index set to: 1
JSON-RPC connection string set to: http://localhost:9545

# In terminal 2:
#
$ export CONFIG_NAME=keeper-2
$
$ node index.js set-client-options --rpc-connection 'http://localhost:9545' --account-index 2

Account index set to: 2
JSON-RPC connection string set to: http://localhost:9545

# In terminal 3:
#
$ export CONFIG_NAME=keeper-3
$
$ node index.js set-client-options --rpc-connection 'http://localhost:9545' --account-index 3

Account index set to: 3
JSON-RPC connection string set to: http://localhost:9545
```


## Happy Path

Open three different terminals and run keepers:

```sh
# In terminal 1:
#
$ node index.js keeper

# In terminal 2:
#
$ node index.js keeper

# In terminal 3:
#
$ node index.js keeper
```

Open a new terminal and run Alice's client to deploy a contract:

```text
$ node index.js deploy sample_legacy.txt
Welcome to KeeperNet v2!

Address 0x8bff9474cfb5ab51b0710cdee6f54eed65f1b5f9 will be used to create a new
contract.

The automatically-generated random name for this contract is
"sleepy_shirley_29". Do you want to use it? [Y/n] y

Generated Bob's private key. You must send it to Bob using secure channel. If
you don't give it to Bob, he won't be able to decrypt the data. If you transfer
it using non-secure channel, anyone will be able to decrypt the data:

0x4d3ec6083fa31aefb8a6a3f2e5e4bed54a8de796ef76ff2e70786fbeec0632ce

Check-in every 1 minutes.
Your contract will be secured by 3 keepers.

Publishing a new contract...
Contract is published.
Contract address is 0x9b30b988365ed570553a4a58928c9a1723e5d0cc

Registering contract...
Done! Transaction hash:
0x72bec67ae811e77db7c7b4c4ffba3da28a2bb3ac64f1a298505402529bee538c
Paid for transaction: 122140 wei

System is calling for keepers, this might take some time...
```

Later we'll need two things from this output: name of the contract and Bob's private key. Watch keepers join:

```
2 keepers have joined...
3 keepers have joined...

You have enough keepers now.
You will pay 694.444444443 Gwei for each check-in interval. Do you want to
activate the contract? [Y/n] y
Activating contract...
Done! Transaction hash:
0xe96eaef5b54da28d4a5da7a42b28600b2bdfc5d98eb6bcfc15675cda69af59ff
Paid for transaction: 1290395 wei
```

Activate the contract by anwsering `Y`. Alice should check-in at least once in a minute (this is hard-coded in this iteration):

```sh
$ node index.js checkin sleepy_shirley_29
```

You can check status of a contract using `status` command:

```sh
$ node index.js status sleepy_shirley_29
```

Keepers will check in right after Alice checks in, or when Alice failed to check in in time.

Stop performing check-ins by Alice for at least 2 minutes and watch keepers decrypt and submit their key parts. Now Bob can decrypt the legacy:

```sh
$ node index.js decrypt sleepy_shirley_29
```
