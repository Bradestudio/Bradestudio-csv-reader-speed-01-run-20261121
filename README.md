[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Bradestudio/Bradestudio-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Bradestudio/Bradestudio-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast csv-reader drop-in

A faster drop-in for make.fun's own csv-reader 1.0.0, for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty ("Read broken CSV files faster, 21 November 2026").

`solve.js` exports `run(input)`, which returns exactly csv-reader 1.0.0's
answer `{columns, rows, errors}` for `{text, header}` — including its broken
row policy (stray CRs, quote junk, unterminated quotes, short/long rows).
`main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## How it is faster

The reference walks one character at a time and builds every field a
character at a time. This reader jumps with native `String.indexOf` and
slices fields whole. A record whose first line holds no quote and no stray
CR — the common case in the drawn sets — is split in one native
`String.split(',')` call; quoted and broken records fall back to a per-field
scanner that still jumps field to field. Nothing is cached across cases:
every case is answered alone.

## Layout

- `solve.js` — the entry (dependency-free ES module)
- `main.ts` — the harness driver (unchanged from the house baseline's driver)
- `LICENSE` — MIT

## License

MIT — see `LICENSE`.

---
Built for [make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121?ref=qjs4e9sj).
