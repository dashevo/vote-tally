const dashcore = require('@dashevo/dashcore-lib');

// List of votes from vote-collector api (/validVotes route).
const votes = require('./data/votes.json');

// Candidates list from DashWatch, same json file from website
const candidateList = require('./data/candidates.json');

const buildValidCandidateIDMap = () => {
  let candidateIdentifiers = {};
  candidateList.forEach(obj => {
    candidateIdentifiers[obj.key] = 1;
  });
  return candidateIdentifiers;
};

// dash-cli masternodelist json 'ENABLED' > mnlist.json
const mnSnapshot = require('./data/mnlist.json');

// dte2019 = "Dash Trust Elections 2019"
const voteMsgPrefix = 'dte2019-';
const re = new RegExp(`^${voteMsgPrefix}`);

const buildValidMNCollateralMap = () => {
  let mnCollateral = {};
  for (let key in mnSnapshot) {
    let mnObj = mnSnapshot[key];
    if (mnObj.status === 'ENABLED') {
      mnCollateral[mnObj.payee] = 1;
    }
  }
  return mnCollateral;
};

const tooLate = 1554076800;  // 2019-04-01 00:00:00 UTC
const tallyVotes = () => {
  // List of valid MN collateral addresses which comes from the MN list
  // snapshot.
  const mnCollateralMap = buildValidMNCollateralMap();

  // Map of valid candidate identifiers.
  const candidateIDs = buildValidCandidateIDMap();

  // Keep a map of MNO collateral addresses to prove there wasn't an invalid
  // dataset.  An invalid dataset is one which contains multiple votes from the
  // same collateral address.
  let seenCollateral = {};

  // user identifier / count
  //
  // This is like an object where values default to zero.
  let candidateTally = new Proxy({}, {
      get(obj, prop) {
        return obj.hasOwnProperty(prop) ? obj[prop] : 0;
      },
  });

  votes.forEach(vote => {
    // log entire vote so we know which one if discarded
    console.log(`Vote <addr:${vote.addr}, msg:${vote.msg}, sig:${vote.sig}, ts:${vote.ts}>`);

    // duplicate MNO collateral addresses
    if (seenCollateral[vote.addr] !== undefined) {
      // go crazy here. invalid dataset.
      console.log("error: invalid dataset - duplicate collateral addresses detected")
      process.exit(1)
    }
    seenCollateral[vote.addr] = 1;

    // 0. Filter votes that came in after March 31st 2019, 23:59
    let ts = Math.trunc(Date.parse(vote.ts) / 1000);
    if (ts >= tooLate) {
      console.log(
        `Timestamp ${vote.ts} arrived post-deadline (cutoff == ${tooLate - 1}) -- vote discarded.`
      );
      return;
    }

    // 1. Verify the vote Dash address is in the valid MN snapshot.
    if (mnCollateralMap[vote.addr] === undefined) {
      console.log(
        `Address ${vote.addr} not in valid MN snapshot -- vote discarded.`
      );
      return;
    }

    // 2. Verify the message payload has our valid prefix & in proper format.
    // ensure vote.msg =~ /^dte2019-/
    let m = re.exec(vote.msg);
    if (m === null) {
      console.log(
        `Message ${
          vote.msg
        } does not match valid vote prefix -- vote discarded.`
      );
      return;
    }
    let candidateVoteStr = vote.msg.split(re)[1];

    // 3. Verify the signature matches the message.
    let isValidAddr = dashcore.Address.isValid(vote.addr, process.env.DASH_NETWORK);
    if (isValidAddr === false) {
      console.log(`Address ${vote.addr} is not valid -- vote discarded.`);
      return;
    }
    let message = dashcore.Message(vote.msg);
    let isValidSig = false;
    try {
      isValidSig = message.verify(vote.addr, vote.sig);
    } catch (err) {
      // no-op
    }
    if (isValidSig === false) {
      console.log(`Signature ${vote.sig} is not valid -- vote discarded.`);
      return;
    }

    // 4. Split the payload and assign votes per candidate.
    //    a. TamperGuard - Ensure no-one was trying to game the system by
    //       including some identifier multiple times.
    //    b. Tally votes for valid candidates.
    let candidates = candidateVoteStr.split('|');
    // let candidateVoteStr = vote.msg.split(re)[1];
    // 4a
    let isValidCandidateList = tamperGuard(candidates, candidateIDs);
    if (isValidCandidateList === false) {
      console.log(`Vote failed tamper guard -- vote discarded.`);
      return;
    }

    // 4b
    candidates.forEach(identifier => {
      candidateTally[identifier] += 1;
    });
  });

  return candidateTally;
};

const tamperGuard = (voteList, candidateIDMap) => {
  let seen = {};

  for (let i in voteList) {
    let v = voteList[i];

    // check duplicate candidate choices
    if (seen[v] !== undefined) {
      console.log('tamper guard - duplicate entry:', v);
      return false;
    }
    seen[v] = 1;

    // check invalid candidate choice
    if (candidateIDMap[v] === undefined) {
      console.log('tamper guard - invalid choice:', v);
      return false;
    }
  }

  return true;
};

envCheck = () => {
  const reqd = ["DASH_NETWORK"];
  let missing = false
  for (let i = 0; i < reqd.length; ++i) {
    if (!(reqd[i] in process.env)) {
      console.error(`error: required env var ${reqd[i]} not set`)
      missing = true;
    }
  }
  if (missing === true) {
    process.exit(1);
  }

  const net = process.env.DASH_NETWORK;
  if (net !== "testnet" && net !== "mainnet") {
    console.error(`error: unknown Dash network '${net}'`)
    console.error(`\texpected \"mainnet\" or \"testnet\"`)
    process.exit(1);
  }
};

// ensure required env vars set
envCheck();

const tally = tallyVotes();

// Build a lookup table of candidate ids => display names
const buildDisplayNameMap = () => {
  let candidateIdMap = {};
  candidateList.forEach(obj => {
    let displayName = obj.text;
    if (obj.alias.length > 0) {
      displayName += ` - ${obj.alias}`;
    }
    candidateIdMap[obj.key] = displayName;
  });
  return candidateIdMap;
};

const displayNames = buildDisplayNameMap();

// Sort the results by vote count and display them
const counts = {};
for (let userid in tally) {
  if (counts[tally[userid]] === undefined) {
    counts[tally[userid]] = [];
  }
  counts[tally[userid]] = [...counts[tally[userid]], userid];
}

const nums = Object.keys(counts);
nums.sort((a, b) => b - a);

for (let i in nums) {
  count = nums[i];
  for (let j in counts[count]) {
    let userid = counts[count][j];
    let name = displayNames[userid];
    console.log(`${count} - ${name}`);
  }
}
