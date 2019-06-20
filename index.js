const dashcore = require('@dashevo/dashcore-lib');

const MapAddrTxList = require('./lib/MapAddrTxList.js');

// List of votes from vote-collector api (/validVotes route).
const votes = require('./data/votes.json');

// Candidates list from DashWatch, same json file from website
const candidateList = require('./data/candidates.json');

const buildValidCandidateIDMap = () => {
  const candidateIdentifiers = {};
  candidateList.forEach((obj) => {
    candidateIdentifiers[obj.key] = 1;
  });
  return candidateIdentifiers;
};

// dash-cli masternodelist json > mnlist.json
const mnSnapshot = require('./data/mnlist.json');

// Note: This has to remain as-is for the DIF supervisors vote, because I
// forgot to change it before deploying the vote website.
//
// dte2019 = "Dash Trust Elections 2019"
const voteMsgPrefix = 'dte2019-';
const re = new RegExp(`^${voteMsgPrefix}`);

const buildMNMap = () => {
  const mnMap = new MapAddrTxList();

  for (const key in mnSnapshot) {
    const mnObj = mnSnapshot[key];
    const proTx = mnObj.proTxHash;

    // Allow MNs in ENABLED and POSE_BANNED status
    if (mnObj.status === 'ENABLED' || mnObj.status === 'POSE_BANNED') {
      // For owner, voting and collateral addresses, push to the proTxList per
      // address, while ensuring unique proTxes in the list
      mnMap.AddEntry(mnObj.owneraddress, proTx);
      mnMap.AddEntry(mnObj.votingaddress, proTx);
      mnMap.AddEntry(mnObj.collateraladdress, proTx);
    }
  }
  return mnMap;
};


const tooLate = 1562112000; // 2019-07-03 00:00:00 UTC

// Map of valid MN addresses => proTX list, which comes from the MN list
// snapshot.
const mnMap = buildMNMap();

const checkVoteValid = (vote) => {
  // 0. Filter votes that came in after the July 2nd 2019 cutoff
  const ts = Math.trunc(Date.parse(vote.ts) / 1000);
  if (ts >= tooLate) {
    // console.log(
    //   `Timestamp ${vote.ts} arrived post-deadline (cutoff == ${tooLate - 1}) -- vote invalid.`,
    // );
    return false;
  }

  // 1. Verify the vote Dash address is in the MN map
  if (mnMap.GetProTxList(vote.addr) === []) {
    // console.log(
    //   `Address ${vote.addr} not in MN snapshot -- vote discarded.`,
    // );
    return false;
  }

  // 2. Verify the message payload has our valid prefix & in proper format.
  // ensure vote.msg =~ /^dte2019-/
  const m = re.exec(vote.msg);
  if (m === null) {
    // console.log(
    //   `Message ${
    //     vote.msg
    //   } does not match valid vote prefix -- vote discarded.`,
    // );
    return false;
  }

  // 3. Verify the signature matches the message.
  const isValidAddr = dashcore.Address.isValid(vote.addr, process.env.DASH_NETWORK);
  if (isValidAddr === false) {
    // console.log(`Address ${vote.addr} is not valid -- vote discarded.`);
    return false;
  }
  const message = dashcore.Message(vote.msg);
  let isValidSig = false;
  try {
    isValidSig = message.verify(vote.addr, vote.sig);
  } catch (err) {
    // no-op
  }
  if (isValidSig === false) {
    // console.log(`Signature ${vote.sig} is not valid -- vote discarded.`);
    return false;
  }
  return true;
};

// tamperGuard detects any duplicates or invalid candidates in a vote
const tamperGuard = (voteList, candidateIDMap) => {
  const seen = {};

  for (const i in voteList) {
    const v = voteList[i];

    // check duplicate candidate choices
    if (seen[v] !== undefined) {
      // console.log('tamper guard - duplicate entry:', v);
      return false;
    }
    seen[v] = 1;

    // check invalid candidate choice
    if (candidateIDMap[v] === undefined) {
      // console.log('tamper guard - invalid choice:', v);
      return false;
    }
  }

  return true;
};


// tallyVotes
const tallyVotes = () => {
  // This maps ProTx => votes... each ProTx gets one vote.
  const mapProTxVotes = {};

  // Look thru each vote and discard invalid ones.
  votes.forEach((vote) => {
    // log entire vote so we know which one if discarded
    // console.log(`Vote <addr:${vote.addr}, msg:${vote.msg}, sig:${vote.sig}, ts:${vote.ts}>`);

    // If the vote is not valid, stop processing it and move on.
    if (!checkVoteValid(vote)) {
      return;
    }

    // Now assign votes to proTxMap. This is also where the weighting occurs
    // for keys with multiple MNs associated.
    const proTxList = mnMap.GetProTxList(vote.addr);
    proTxList.forEach((proTxHash) => {
      // Ensure only LATEST vote per-proTx.
      let mostRecentVote = vote;
      if (mapProTxVotes.hasOwnProperty(proTxHash)) {
        // prevVote is the EXISTING vote for the given ProTx to compare. It's
        // not "previous" by timestamp.
        const prevVote = mapProTxVotes[proTxHash];
        // If prevVote is newer, stay w/that one
        if (Date.parse(prevVote.ts) >= Date.parse(vote.ts)) {
          mostRecentVote = prevVote;
        }
      }

      // Most recent vote is the most recent by timestamp for a given ProTx.
      mapProTxVotes[proTxHash] = mostRecentVote;
    });
  });

  // Map of valid candidate identifiers.
  const candidateIDs = buildValidCandidateIDMap();

  // Map of candidate id => count
  // This is like an object where values default to zero.
  const candidateTally = new Proxy({}, {
    get(obj, prop) {
      return obj.hasOwnProperty(prop) ? obj[prop] : 0;
    },
  });

  // Now tally all ProTx votes. Since we have assigned one vote to each ProTx
  // identified w/a vote key, this eliminates duplicates.
  for (const proTxHash in mapProTxVotes) {
    const vote = mapProTxVotes[proTxHash];

    // 4. Split the payload and assign votes per candidate.
    //    a. TamperGuard - Ensure no-one was trying to game the system by
    //       including some identifier multiple times.
    //    b. Tally votes for valid candidates.
    const candidateVoteStr = vote.msg.split(re)[1];
    const candidates = candidateVoteStr.split('|');
    // 4a
    const isValidCandidateList = tamperGuard(candidates, candidateIDs);
    if (isValidCandidateList === false) {
      // console.log('Vote failed tamper guard -- vote discarded.');
      continue;
    }

    // 4b
    candidates.forEach((identifier) => {
      candidateTally[identifier] += 1;
    });
  }

  return candidateTally;
};

// envCheck ensures required environment variables are set
const envCheck = () => {
  const reqd = ['DASH_NETWORK'];
  let missing = false;
  for (let i = 0; i < reqd.length; i += 1) {
    if (!(reqd[i] in process.env)) {
      console.error(`error: required env var ${reqd[i]} not set`);
      missing = true;
    }
  }
  if (missing === true) {
    process.exit(1);
  }

  const net = process.env.DASH_NETWORK;
  if (net !== 'testnet' && net !== 'mainnet') {
    console.error(`error: unknown Dash network '${net}'`);
    console.error('\texpected "mainnet" or "testnet"');
    process.exit(1);
  }
};

// Build a lookup table of candidate ids => display names
const buildDisplayNameMap = () => {
  const candidateIdMap = {};
  candidateList.forEach((obj) => {
    let displayName = obj.text;
    if (obj.alias.length > 0) {
      displayName += ` - ${obj.alias}`;
    }
    candidateIdMap[obj.key] = displayName;
  });
  return candidateIdMap;
};

// ==== main logic

// const mnMap = buildMNMap();
// console.log("mnMap: ", mnMap);

// ensure required env vars set
envCheck();

// Get human-readable names
const displayNames = buildDisplayNameMap();

// Tally the votes using the files in data/
const tally = tallyVotes();

// Sort the results by vote count and display them
const counts = {};

// `counts` will be a map of counts => list of candidate IDs,
// example:
// 100 => ['candidateA, candidateB'],
//  90 => ['candidateC'],
// ... etc.
for (const userid in tally) {
  if (counts[tally[userid]] === undefined) {
    counts[tally[userid]] = [];
  }
  counts[tally[userid]] = [...counts[tally[userid]], userid];
}

// Sort the vote counts from the map above in descending order
const nums = Object.keys(counts);
nums.sort((a, b) => b - a);

// Now display the results, highest vote count first, with display names
for (const i in nums) {
  const count = nums[i];
  for (const j in counts[count]) {
    const userid = counts[count][j];
    const name = displayNames[userid];
    console.log(`${count} - ${name}`);
  }
}
