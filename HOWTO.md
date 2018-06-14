# How to

You can download bitcannery-cli binary from the [list of recent releases](/releases) or [click here](#...) to get the newest version.

1.  [Send secret message](#send-message)
2.  [Check-in](#delay-message)
3.  [Rotate Keepers](#rotate-keepers)
4.  [Cancel Keeper contract](#cancel-message)
5.  [Reveal message](#read-message)
6.  [Run as a Keeper](#run-keeping-client)

## Send secret message

To send a message, save it in a text file first and then do

```
./bitcannery-cli deploy <path-to-file>
```

App will ask you to import or generate new [BIP39 seed phrase](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) for your Ethereum address.

If you don't have enough ether on the address, you'll get a warning. Currently BitCannery works in Rinkeby network, so you can easily get ether with [Rinkeby faucet](https://www.rinkeby.io/#faucet) web service.

```
Your address: 0xba306c7d6a5943aa73e26a3fb941ff867df606e7
Network: Rinkeby test network
Registry: 0x109124f040f7b02d2e8b620ecc189f245176d1c2
Wallet balance: 0 wei

Account balance is too low, please add some ether to it.
```

Once you have enough ether on the account balance, run the command again:

```
./bitcannery-cli deploy <path-to-file>
```

App will ask you to choose name for the message delivery contract, password for your local message storage and check-in period duration. In app response you'll get contract address, which we recommend to back up in case you lose app config.

App will output `Waiting for keepers...`, and after some time it will ask to choose Keepers amount. Next app will deploy your new contract in Ethereum blockchain and print you **private key**. Pass it with your chosen contract name to person you want to receive the message. *Important* If your addressee will loose the key, there is no way to recover it and secret will be lost!

## Check-in

Secret is safe while you perform check-ins. Secret will be decoded after you stop your check-ins. Lets check-in with this command:

```
./bitcannery-cli checkin
```

App will ask you for a contract name and to confirm. If there's not enough active Keepers to keep the message safe, it'll offer you to do Keeper rotation.

## Rotate Keepers

Keeper rotation might be required to ensure you have enough Keepers. If active Keepers amount falls below 2/3, you should re-encode the message and assign new Keepers. To perform Keeper rotation, do:

```
./bitcannery-cli rotate-keepers <name-of-your-contract>
```

`<name-of-your-contract>` is the name you've chosen on contract activation. App will ask you for password and your confirmation. Later it will deploy new smart contract and start gathering new Keepers' proposals. After you assign new amount of Keepers, new smart contract will be activated and an old one will be [cancelled](#cancel-message).

## Cancel Keeper contract

In case you've changed your mind and don't want to keep the message anymore (without revealing it), you can cancel delivery contract. To cancel message delivery, run

```
./bitcannery-cli cancel <name-of-your-contract>
```

`<name-of-your-contract>` is the name you've chosen on contract activation. App will ask you for confirmation, and after this contract would close for any further actions.

## Reveal message

To get the message from the contract, you need to know it's name in BitCannery and **private key**. If you have both, run this command:

```
./bitcannery-cli decrypt <name-of-your-contract>
```

`<name-of-your-contract>` is the name of contract you've received with the private key. App will ask you for this key, and either decrypt the message or ask to wait for more keepers to send their message parts. In latter case try decrypting the message in a couple of hours.

## Run as a Keeper

To run your own Keeper node, you need to specify your keeping fee first.

```
./bitcannery-cli keeper set-fee <X_Gwei>
```

<X_Gwei> here is a daily fee in ether you want to receive for keeping. If integer is passed, it's treated as wei amount; you could pass in strings like `1000 wei`, `10 Gwei` or `1 ether`.

Then run this command to start keeper node:

```
./bitcannery-cli keeper run
```

If you hadn't set up Ethereum address, app would ask you to either import or generate new [BIP39 seed phrase](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki). Then Ethereum address will be set up, you'd need to have ether for sending proposals to keeping contracts. Currently BitCannery works in Rinkeby test network, and you could get ether in this network by using [Rinkeby faucet](https://www.rinkeby.io/#faucet) web service. If address has enough ether to pay gas price, you would have fully automated Keeper node. It will send proposals to new keeping contracts, receive message parts, check contracts, receive keeping fee and reveal message parts in case of missed checkins.
