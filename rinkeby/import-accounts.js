// account to deploy

var accounts = [
  "0x6da26a02b4364dcff7cfd58f8a8b9c6ce62a0c61",
  "0xbb2bced367d8c4712baac44616c1e61797f392a3"
];

var privateKeys = [
  'efe3554153962a2658215320b1feb4a68786bac8c3360f66cab13011c588bf73',
  'c0ac892cadd05649068eb6270c6def64caa6866a8d8ac92ba5b3f1fd766d74cd',
];

for (var i = 0; i < privateKeys.length; ++i) {
  console.log('Imported account ' + i);
  personal.importRawKey(privateKeys[i], '' + i);
}
