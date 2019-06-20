// MapAddrTxList is a custom object which is a map with Dash addresses as keys
// which map to a _list_ of ProTx hashes as the values.
//
// This list contains unique ProTx hashes.
//
// Example of structure:
//
// yXyMSUPNrkwh8cqjCQZb8ZmGCEY9su51KZ => [
//    "a36edfac56f7f1b0f58aa793115fbd53d792315857033fb32a862507a3f060ff",
//    "f718902044925ab8ba5089667a4c2a1e45b855eb4388d21c1b14e1d05bc1991f",
// ],
// yVQCPZ2kW6FyPguUriKRRLuBd1WqGbSgPR => [
//    "39c07d2c9c6d0ead56f52726b63c15e295cb5c3ecf7fe1fefcfb23b2e3cfed1f",
// ],
class MapAddrTxList {
  constructor() {
    this.obj = {};
  }

  // GetProTxList will add a ProTx hash to the list associated with the given
  // address.
  AddEntry(address, proTx) {
    const arr = this.GetProTxList(address);
    // This ensures that no duplicate ProTx entries exist in the list.
    if (arr.indexOf(proTx) === -1) {
      arr.push(proTx);
    }
    this.obj[address] = arr;
  }

  // GetProTxList will return a list of ProTx hashes for a given Dash address.
  GetProTxList(address) {
    return this.obj[address] || [];
  }
}

module.exports = MapAddrTxList;
