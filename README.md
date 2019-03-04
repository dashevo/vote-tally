# vote-tally

> Tally MNO votes from the Dash Trust Protector Election

## Table of Contents
- [Install](#install)
- [Usage](#usage)
- [TODO](#todo)
- [Contributing](#contributing)
- [License](#license)

## Install

```sh
npm install
```

## Usage

You will need a few external files, placed in the `data/` folder:

* The candidate list from the voting website (included in this repo)
* A snapshot of the valid masternode list (saved to `data/mnlist.json`)
* A list of all the votes from the database in JSON format (obtained via the API using the `/validVotes` route and saved to `data/votes.json`)

After you've gathered the required files, you can run the tally:

```sh
node index.js
```

The output will show all votes, any rejected votes w/rejection reason, and a list of candidate names and vote tallies at the end.

## TODO

* Tests! We need test data (fixtures) and to ensure adequate automated test coverage.

## Contributing

Feel free to dive in! [Open an issue](https://github.com/dashevo/vote-tally/issues/new) or submit PRs.

## License

[MIT](LICENSE) &copy; Dash Core Group, Inc.
