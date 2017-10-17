# CryptoLegacy

## Running tests

Go to `truffle` directory and run `npm install` (this needs to be done only once):

```shell
cd project_dir/truffle
npm install
```

Open two terminals. In the first one, run TestRPC, which is an Ethereum client that behaves like the real Ethereum client, but doesn't actually connect to the network and uses in-memory blockchain instead. We use it to make our tests run fast and allow doing weird things that are useful for testing, like changing block time faster than wall clock time progresses or rolling the whole blockchain back to some previously taken snapshot:

```shell
# Terminal 1
./run-testrpc.sh
```

In the second terminal, run the tests and watch the output:

```shell
# Terminal 2
npm test
```

That's it.
