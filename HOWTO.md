# Pact How-to

Let's start with the use-case. Someone, let's call them Alice, wants to pass deferred secret
message to a recipient, which we will call Bob. Bob will be able to access the message
only after Alice fails to perform periodic check-in.

When Alice submits a message, it's encrypted, and encryption key gets split and distributed
between participants of the system called "keepers". Alice pays fixed fee to all involved
keepers when she publishes a message, and then each time she checks in.

Nobody, including keepers, can decrypt the message while Alice is performing regular check-ins.
Only Bob (possessor of the private key) can decrypt the message after Alice misses a check-in.

Ethereum smart contract is created for each message published in the system. Each contract
has a unique name which can be used to identify it.

* [Instructions for message sender](#message-sender-alice)
* [Instructions for message recipient](#message-recipient-bob)
* [Instructions for running keeper node](#running-keeper-node)


## Message sender (Alice)

### Submitting a message

To submit a message, prepare a text file with the message contents and run this command:

```
./dms deploy <path-to-file>
```

#### 1. Generate/import seed phrase

If this is your first use of the Pact system on this machine, you will be asked to import
or generate something called "BIP39 seed phrase". This is a sequence of 12 words that
gives you access to Ethereum network and, as a consequence, to Pact system (it is used to
generate Ethereum private key and its corresponding address).

If you already have BIP39 seed phrase, select Import using `Up`/`Down` arrow keys, then type
the phrase, space-separated, and press `Enter`. Re-using seed phrase that you use elsewhere,
e.g. in Metamask/MyEtherWallet, is not recommended.

If you didn't generate BIP39 seed phrase previously, select "Generate" using `Up`/`Down`
arrow keys, and press `Enter`. The random seed phrase will be generated and printed to the
console. Save this seed phrase in some safe place, preferably write it on paper. Anyone that
knows this seed will be able to spend your ether and to destroy your secret message.

#### 2. Populate your Ethereum account with ether

If you just generated new seed phrase, you will most probably see something like this
and the program will exit:

```
Your address: 0xba306c7d6a5943aa73e26a3fb941ff867df606e7
Network: Rinkeby test network
Registry: 0x109124f040f7b02d2e8b620ecc189f245176d1c2
Wallet balance: 0 wei

Account balance is too low, please add some ether to it.
```

It says that your newly-generated Ethereum address for using with Pact is
`0xba306c7d6a5943aa73e26a3fb941ff867df606e7`, and its balance is zero. Since publishing
a secret message requires spending ether, program exits. This is because publishing
a message is done my sending a sequence of Ethereum transactions, and each transaction
in Ethereum costs some ether. Moreover, you will need to leave a prepay for the keepers.

So you need to populate your account with ether. If you're currently playing with the
system in Rinkeby test Ethereum network, like in the example above (notice "Network:
Rinkeby test network" line), use https://www.rinkeby.io/#faucet to get free test ether.
If you're using main Ethereum network, buy ether on an exchange like https://www.coinbase.com
and deposit it to your Pact-associated Ethereum address. Once you have enough ether on the
account balance, run the command again (`./dms deploy <path-to-file>`).

#### 3. Choose contract name

Next you will be asked about contract name. Pact creates Ethereum smart contract for each
encrypted message you publish, and contract name will be used to identify this message among
all other messages in the system.

The automatically-generated contract name will be suggested. If you're ok with it, type `Y`
and press `Enter`. Otherwise, type `n`, press `Enter`, type your custom contract name and press
`Enter` once again. Custom name can contain alphanumeric characters without spaces (`-` and `_`
are allowed), but must be unique across the whole Pact system. If you enter non-unique name, you
will be asked to enter another one.

#### 4. Choose/enter data store password

After entering contract name, you will be asked to enter data store password. Data store
resides on your computer and is used to store sensitive data related to your published
messages. This sensitive data is stored encrypted, and data store password is used for
this. If this is the first time you publish Pact message, you need to come up with strong
password and store it in a safe place. This password will be required to publish new Pact
messages and to perform keepers rotation (explained below).

#### 5. Specify check-in interval

Then, you'll need to specify check-in interval. After publishing message, you will be
required to check in once each check-in interval. For example, if check-in interval
is 30 days, you will need to check at least once each 30 days. If you fail doing this,
the message recipient will be able to decrypt your message. Each time you check in,
you must pay keeping fee to all keepers involved in keeping your message encrypted.
Check-in interval doesn't affect how much you will pay keepers per year/month: if you
check in more frequently, you'll just pay less per each check-in. There is a small
overhead for more frequent check-ins, though: each check-in is a transaction, and
it costs some fixed amount of ether. But check-in transaction cost is usually much
less than keeping fee, unless you're checking in multiple times a day.

After this, Ethereum smart contract dedicated for your message will be published and its
address printed. Write this address in some place in case you loose your configuration.

#### 6. Accept keepers

Then, keepers will start sending their proposals. After some keepers send proposals, you
will be asked to choose number of keepers that your message encryption key will be split
between. The more this number, the more secure your message will be stored, and the more
you will pay each time you check in. The minimum allowed number of keepers is 3. You can
either choose recommended number, or enter any other number. Keep in mind that using low
number will make it more probable that message recipient (Bob) can bribe sufficient number
of the keepers and decrypt the message before he is allowed to do this.

After you choose the number of keepers and confirm keeping fee, the message will be encrypted
and written to blockchain.

#### 7. Send private key securely to message recipient

You will see a pair of keys (Bob's private and public key) printed. Bob's private key is
required for recipient to decrypt your message, so you should pass it to the recipient using
a secure channel. Anyone who knows this key will be able to decrypt the message once you fail
to check in in time. Also, it's a good idea to write this key down on paper in case you lose
your local configuration.

### Checking in

In order to keep the message encrypted, you need to check in at least once each check-in
interval (which you specified when publishing the encrypted message).

For example, suppose that you chose 10-day check in interval. You have 10 days after publishing
the message to perform your first check-in. When you check in, the next 10-day interval starts.
So, if you published the message on April 1st, you'll need to check in until April 10th,
inclusively. Now, if you check in on April 5th, then the next check-in due date will be on April
15th, and so on.

To check in, use this command:

```
./dms checkin
```

You will be asked which contract to use. After you choose one and confirm that you're willing
to perform the check-in and pay associated fee, the Ethereum transaction will be sent and
included in blockchain. You'll see when you need to check in next time, what amount of keepers
you have and how many of them are still reliable.

When a keeper is reported as unreliable, it means that they didn't appear for some time, and
the probability that they won't be able to participate in your message decryption when you
fail to check in in time is high. Since it's required that at least 2/3 of keepers participate
in decryption in order for recipient to be able to obtain the decrypted message, you will need
to replace non-reliable keepers with new ones once the number of non-reliable keepers becomes
sufficiently high. In this case, after the check-in you will be suggested to perform keepers
rotation procedure (see below). It's recommended to not ignore this hint and to perform rotation
as soon as possible.

When you fail to check in in time, your keepers will publish their key parts to the smart
contract. After the sufficient number of key parts is published, Bob, the recipient of
the message, will be able to decrypt it. He will be required to enter Bob's private key
that you sent him after publishing the message. There is no way of decrypting the message
without providing Bob's private key.

### Rotating keepers

_TODO_


## Message recipient (Bob)

When Alice (message sender) publishes message to the system, it gets encrypted and written
to the Ethereum blockchain. You cannot decrypt this message while message sender performs
regular check-ins to the system.

When Alice fails to perform check-in in time, special participants of the system called
"keepers" write parts of encryption key to the blockchain. These parts, combined, allow you
to remove the first encryption layer. To remove the second layer, you need to provide a string
called "private key". This key should have been provided to you by Alice. Without this key,
nobody can decrypt the message.

### Receiving contract name and private key

After Alice publishes a message to Pact system, she needs to provide you with two strings
using a secure communication channel:

1. Name of the contract.
2. Private key.

After receiving these strings, please store them in a secure place. You will need to provide
name of the contract each time you check whether you can decrypt the message, and you will
need private key to actually decrypt it.

Please keep in mind that anyone who possesses private key will be able to read the message
after Alice fails to check in in time. So store it in a very secure place and make sure nobody
can intercept your communication with Alice while you're receiving the key.

### Decrypting the message

Run this command:

```
./dms decrypt "Name of the contract"
```

Replace "Name of the contract" with the actual name you received from Alice. If it says that
message can't be decrypted yet, it means that Alice is performing check-ins on a regular basis,
so you cannot decrypt the message.

If it asks for private key, then it means that Alice missed check-in and now you can try
decrypting the message. Enter your private key and press `Enter`. If decryption goes ok, the
decrypted message will be printed on the screen.

If it says that decryption failed, there might be several reasons for this. First of all, please
check that you entered correct private key. Then, it might be that some of the keepers didn't
submit their private keys yet. Wait couple of hours and try again. If is still fails to decrypt
after a day of waiting, then it means that either your private key is incorrect or too much
keepers have disappeared from the system. In the latter case, the message is probably lost. That
said, it might be that these keepers will later re-appear in the system and you will be able to
decrypt the message, so trying again the next week/month makes sense. To avoid this situation,
Alice is required to periodically replace keepers that disappeared with new ones.


## Running keeper node

_TODO_
