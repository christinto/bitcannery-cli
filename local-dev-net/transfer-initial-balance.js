
for (var i = 1; i < accounts.length; ++i) {
  eth.sendTransaction({from: eth.accounts[0], to: eth.accounts[i], value: '1000000000000000000000'});
}
