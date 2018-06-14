# BitCannery

BitCannery network command-line client

## Introduction

*BitCannery network* allows to keep a secret information in a plain sight on any Ethereum-compatible
blockchain. It uses agents aka 'keeper' nodes who holds chunks of the decryption key created via Shamir’s secret sharing algorithm. Keepers motivated by the fee which paid by the secret owner. Currently BitCannery network can be used via command-line client.

## Requirements

bitcannery-cli currently support only Linux and MacOS systems.  

## Building

You'll need Node v8+ and npm 5+.

```
git clone git@github.com:bitcannery/bitcannery-cli.git
cd bitcannery-cli
cd dms
npm install
npm run bundle
```

## Running Truffle tests

```
cd truffle
npm test
```

## More information

[How to use the system](/HOWTO.md).
