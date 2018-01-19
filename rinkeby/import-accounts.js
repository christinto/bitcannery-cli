// account to deploy 0x6da26a02b4364dcff7cfd58f8a8b9c6ce62a0c61

var accounts = [
  "0x6da26a02b4364dcff7cfd58f8a8b9c6ce62a0c61",
  "0xbb2bced367d8c4712baac44616c1e61797f392a3",
  "0xc712deae0ab6abf65285ed42400b127056f3c664",
  "0x80433df99abe278680a20f0bc70bbf243d51c803"
];

var privateKeys = [
  'efe3554153962a2658215320b1feb4a68786bac8c3360f66cab13011c588bf73',
  'c0ac892cadd05649068eb6270c6def64caa6866a8d8ac92ba5b3f1fd766d74cd',
  'c49306a5858d34b3a1062e95bef2cf1ca8d7d6cf013f3ae5b81843d348e5c620',
  'e730a15f301798c2d938c463d4d88e303581b0151518cc3d465c924b7da5173d'
];

for (var i = 0; i < privateKeys.length; ++i) {
  console.log('Imported account ' + i);
  personal.importRawKey(privateKeys[i], '' + i);
}
