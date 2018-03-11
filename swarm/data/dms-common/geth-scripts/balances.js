var accounts = eth.accounts;

for (var i = 0; i < accounts.length; ++i) {
  console.log(accounts[i], eth.getBalance(accounts[i]));
}
