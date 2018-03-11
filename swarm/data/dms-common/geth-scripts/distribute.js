function send(i, wei) {
  var tx = {
    from: accounts[0],
    to: accounts[i],
    value: wei,
    gas: 200000
  };

  return eth.sendTransaction(tx);
}

var accounts = eth.accounts;
var accountsNumber = accounts.length;
var wei = eth.getBalance(accounts[0]).div(accountsNumber);

personal.unlockAccount(accounts[0], '0', 60);

for (var i = 1; i < accounts.length; ++i) {
  send(i, wei);
  console.log('Sent', web3.fromWei(wei), 'to', i, 'account');
}
