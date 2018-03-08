export const MESSAGE_NEW_CONTRACT_STORE_PASSWORD =
  `You're going to deploy your first contract. Please read the information below ` +
  `carefully.\n\n` +
  `When you deploy a contract, a cryptographic key pair is generated: public key is used ` +
  `to encrypt the data, and private key is required to decrypt it, so you give private key ` +
  `to Bob so he can eventually do the decryption. Private key must be kept in secret from ` +
  `anyone except Bob.\n\n` +
  `The contract is also encrypted by another key, which is distributed between Keepers. ` +
  `Keepers are programs running by network participants, who receive fee for their service. ` +
  `Each Keeper stores only small portion of the key and cannot use it to decrypt the data. ` +
  `Sometimes, some Keepers disappear from the system, so you need to replace them with ` +
  `new ones. This is called "Keepers rotation". You will need to perform rotation from time ` +
  `to time (you will be notified when checking in). To perform rotation, the original legacy ` +
  `data is needed.\n\n` +
  `To simplify rotation procedure, original legacy data and Bob's private key will ` +
  `be stored in your config, so you won't need to specify them again. To protect them, you ` +
  `will need to come up with a password that will be used for this and all future contracts. ` +
  `Please use strong password, e.g. consisting more than 15 characters, with mutiple ` +
  `characters from each of these groups: small letters, capital letters, numbers, special ` +
  `symbols. Please don't use well-known phrases or citations from books. Don't use the same ` +
  `password you use to access Ethereum wallet, or any other service on the Internet. Best ` +
  `of all, use randomly generated password. The strong and unique password is critical ` +
  `to protect your data from illegitimate access. This password will be referred as ` +
  `"contract data store password". You will need to enter it each time you do Keepers ` +
  `rotation or deploy a new contract.\n`

export const MESSAGE_CONTRACT_STORE_PASSWORD_SET =
  `Contract store password set. Please write this password down on paper and make sure you ` +
  `don't lose it. This password will be referred as "contract data store password". You will ` +
  `need to enter it each time you do Keepers rotation or deploy a new contract.\n`
