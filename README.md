# CryptoLegacy

[How to use the system](/HOWTO.md).

## Running tests

Install [`geth` client](https://ethereum.org/cli). On OS X, you can use `brew`:

```
brew tap ethereum/ethereum
brew install ethereum
```

Go to `truffle` directory and run `npm install` (this needs to be done only once):

```shell
cd project_dir/truffle
npm install
```

Open two terminals. In the first one, run geth (keep in mind that this command runs geth in special development mode):

```shell
# Terminal 1
./run-geth.sh
```

Wait until `geth` starts and unlocks all accounts (should take 15-20 seconds). In the second terminal, run the tests and watch the output:

```shell
# Terminal 2
npm test
```

That's it.
