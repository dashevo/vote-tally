const assert = require('assert');
const MapAddrTxList = require('./MapAddrTxList.js');

// Define some test values...
const proTx1 = '474509fd3e5b100556bb3f33f2527baffffb1e4d4c4184b797aa06ca817df7c2';
const proTx2 = '9eff9c00e402800a9dd8fd4291af5458df3b9a0f70abe17f3a7817b0e4a2e083';
const proTx3 = '9575625c11d3b7e20f29d6c2c99b3487ff0b2140f1c56537ae622c2ea1f9e95e';

const addr1 = 'X1zzGeuwopZ9x5UZvux7xCzbkHJnqbuqBk';
const addr2 = 'XzkR4bzourNzgfkjtskK53owYVX5Q2t8XP';
const addr3 = 'XdvJPR1npDdguyN7aWVu2B3bvC75NuiYvu';

// Instantiate a new mnMap
const mnMap = new MapAddrTxList();

// Add some addr => proTx pairings...
mnMap.AddEntry(addr1, proTx1);
mnMap.AddEntry(addr2, proTx1);
mnMap.AddEntry(addr3, proTx1);

let txHashList;

// Ensure addr3 has one entry...
txHashList = mnMap.GetProTxList(addr3);
assert(txHashList.length === 1);

// Try and add an existing addr / proTx mapping...
mnMap.AddEntry(addr3, proTx1);

// addr3 should still have one entry b/c no duplicates allowed
txHashList = mnMap.GetProTxList(addr3);
assert(txHashList.length === 1);

// Add a few more entries
mnMap.AddEntry(addr2, proTx2);
mnMap.AddEntry(addr2, proTx3);
mnMap.AddEntry(addr3, proTx3);

// Test address lists now
txHashList = mnMap.GetProTxList(addr1);
assert(txHashList.length === 1);

txHashList = mnMap.GetProTxList(addr2);
assert(txHashList.length === 3);

txHashList = mnMap.GetProTxList(addr3);
assert(txHashList.length === 2);

// Try and get a nonsensical "address"
txHashList = mnMap.GetProTxList('7');
assert(txHashList.length === 0);
