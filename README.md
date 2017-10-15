# CryptoLegacy

##Running tests

Open two console windows.

In the first one run testrpc:
```
testrpc - --account="0xefe3554153962a2658215320b1feb4a68786bac8c3360f66cab13011c588bf73,2222000000000000000000" --account="0xc0ac892cadd649068eb6270c6def64caa6866a8d8ac92ba5b3f1fd766d74cd,123000000000000000000" --account="0xc49306a5858d34b3a1062e95bef2cf1ca8d7d6cf013f3ae5b81843d348e5c620,222000000000000000000" -b 1
```

This command starts local in-memory blockchain with three accounts. First one would be our Alice, second — Bob, all others are for Keepers. `-b 1` flag starts auto-mining, so this network would be availible for migrations and testing.

In the second console window run
```
truffle migrate
truffle test
```

First command will build and deploy smart contracts from `./contracts` directory, second one will run tests from `./test` directory.