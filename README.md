# swimparse

Reads swim-meet result files — **SDIF v3** (`.sd3`) and **Hy-Tek** (`.hy3`) — and emits
one `NormalizedMeet` JSON shape, so tools consume a single contract instead of
re-implementing fixed-width parsing twice.

- **Zero dependencies.** Plain ESM — browser, Node, and CI unchanged.
- **Lossless.** Every swim is kept: placing or not, exhibition, DQ, no-show — plus
  birthdates, seed times, relay legs, splits and DQ reasons.
- **Format-agnostic output.** SDIF and HY3 of the same meet parse to the same result.

## Scope

swimparse reads files and emits JSON. **That is all it does.** It has no concept of a
league: no age bands, no scoring rules, no team-code registry, no qualifying standards,
no synthesized meet names.

That boundary is deliberate. Those things differ per league and change over time, while
the file formats do not. Keeping them out means a summer-league scorer, a USA-Swimming
analyzer, and a championship-meet tool can share one parser and disagree about
everything else.

| Concern | Where it belongs |
|---|---|
| SDIF / HY3 record layouts, times, dates, format detection | **swimparse** |
| The `NormalizedMeet` contract | **swimparse** |
| Age bands, age-up date, age-group labels for swimmers | your league layer |
| Scoring: point values, which relays count, team totals | your league layer |
| Canonical team codes / alias mapping | your league layer |
| Stripping or aggregating PII | your league layer |
| Qualifying standards, records, personal bests | your application |

## Install

```sh
npm install swimparse
```

Zero dependencies, so there is nothing else to pull in.

Releases are published from CI with [provenance](https://docs.npmjs.com/generating-provenance-statements),
so every version on npm can be traced to the commit and workflow run that built it.

## Usage

```js
import { parse, detectFormat } from 'swimparse';

const meet = parse(fileText, { filename: 'GG_at_WW.hy3' }); // auto-detects format
const meet = parse(fileText, { format: 'sdif-v3' });        // or force one
```

CLI:

```bash
swimparse meet.hy3 --pretty       # NormalizedMeet JSON to stdout
swimparse meet.sd3 -o meet.json   # to a file
swimparse a.sd3 b.hy3 -d out/     # one <name>.json per input
```

## The NormalizedMeet contract

`{ format, source, meet, teams, swimmers, events }` — see [`src/model.js`](src/model.js)
for the full typedefs. Highlights:

- **Times** always carry both `{ text: "1:11.35", seconds: 71.35 }`.
- **Dates** are ISO `YYYY-MM-DD`.
- **`result.status`** is `ok | dq | ns | dnf | scratch | exhibition`.
- **`event.ageGroup`** is the *event's* age range as printed in the file (`"9-10"`,
  `"10 & Under"`, `"Open"`). It is **not** a swimmer's age group — computing that needs
  a birthdate and a league's bands, which is your layer's job.
- **`team.code`** has the two-letter LSC prefix stripped (`VAWW` → `WW`), an SDIF file
  convention; `team.fullCode` keeps the raw value. Mapping either onto a league's
  canonical code is your layer's job.
- **`result.points`** is whatever the file stored. SDIF carries points; HY3 does not, so
  it reads `0`. Deriving points from place is scoring, so it lives in your layer.

### Format differences worth knowing

| | SDIF (`.sd3`) | Hy-Tek (`.hy3`) |
|---|---|---|
| DQ time | nulled | **retained** (`finalTime` kept) |
| DQ reason | — | **`dqReason`** (e.g. "Arms: Underwater recovery") |
| Points | stored | absent (reads `0`) |
| Names | 28-char field | wider, less truncation |

## Privacy

The lossless rule means output carries **`swimmers[].birthDate` and `usasId` whenever the
file does.** At a youth meet that is PII for minors, so **treat every parse result as
confidential** until your application has stripped or aggregated it.

swimparse does not sanitize for you, on purpose: what counts as safe is a league decision
(a summer league publishes age-group labels and drops birthdates; a USA-Swimming tool
needs exact ages). Putting that choice in the parser would force one answer on everyone.

Test fixtures in this repo are synthetic — every identity is a public figure with a
shifted birth year; see [`test/fixtures/README.md`](test/fixtures/README.md).

## Tests

```bash
node --test    # golden snapshots + SDIF↔HY3 cross-agreement
```

## License

MIT
