# swimparse

Reads swim-meet result files — **SDIF v3** (`.sd3`) and **Hy-Tek** (`.hy3`) — and emits
one `NormalizedMeet` JSON shape, so tools consume a single contract instead of
re-implementing fixed-width parsing twice.

It also reads the other end of a meet: **Hy-Tek meet-setup files** (`.ev3` / `.hyv`) —
the event list, session schedule, entry fees and qualifying cuts — as a
`NormalizedMeetSetup`.

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
| SDIF / HY3 / EV3 / HYV record layouts, times, dates, format detection | **swimparse** |
| The `NormalizedMeet` and `NormalizedMeetSetup` contracts | **swimparse** |
| Age bands, age-up date, age-group labels for swimmers | your league layer |
| Scoring: point values, which relays count, team totals | your league layer |
| Canonical team codes / alias mapping | your league layer |
| Stripping or aggregating PII | your league layer |
| Whether a swimmer meets a cut, course conversions, records, personal bests | your application |

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

Meet-setup files go through `parseSetup` instead — they hold events, not results, so
they parse to a different shape rather than an empty `NormalizedMeet`:

```js
import { parseSetup, qualifyingStandards } from 'swimparse';

const setup = parseSetup(fileText, { filename: 'Meet Events-2026 Champs.ev3' });
setup.events[0].qualifyingTimes;   // { LCM, SCM, SCY } — the event's cut per course
qualifyingStandards(setup);        // flat cut table: one row per event that has one
```

`qualifyingTimes` is the file verbatim. `qualifyingStandards()` is the cut table you
would publish, and makes exactly one judgement the parse does not: a meet that does not
accept a course may fill that column with a placeholder (`0.01`, `1.00`) on every event
rather than leaving it blank, and those are dropped along with any row left with
nothing real.

If you are consuming the cuts, read
**[docs/qualifying-cuts.md](docs/qualifying-cuts.md)** first — the output shape, and the
four things that are easy to get wrong (course keys, what `null` means, comparing on
`seconds`, and where the meet's rules end and yours begin).

CLI:

```bash
swimparse meet.hy3 --pretty       # NormalizedMeet JSON to stdout
swimparse meet.sd3 -o meet.json   # to a file
swimparse a.sd3 b.hy3 -d out/     # one <name>.json per input
swimparse events.ev3 --pretty     # NormalizedMeetSetup JSON
swimparse events.ev3 --cuts       # just the qualifying-time table
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

## The NormalizedMeetSetup contract

`{ format, source, meet, sessions, events }` — see [`src/model.js`](src/model.js). A
setup file is the meet before anyone has entered it, so `events[]` here are event
*definitions*, not results.

- **`event.qualifyingTimes`** is `{ LCM, SCM, SCY }` — the same cut expressed in each
  course, each a `SwimTime` or `null`. A meet that sets no cuts (most invitationals)
  parses to all-null, and `qualifyingStandards()` returns `[]`. The two file flavours
  store those three columns in different orders — the `.hyv` rotates them to start at
  the meet's own course — so read them from here, keyed by course, rather than by
  column position.
- **`event.course`** is the event's own course as stated in the file (`.ev3` only).
- **`meet.qualifyingSince`** is the start of the period a cut may be swum in (`.ev3`
  only). Inferred from the files rather than from a spec — see `src/setup.js`.
- **`event.round`** is `finals` or `prelims`; `rounds` is 1 for timed finals, 2 for
  prelims-plus-finals (`.ev3` only).
- **`sessions`** is the day/start-time schedule, collapsed out of the per-event stamps.
  A session id may be alphanumeric (`"2G"` — session 2, girls). `.hyv` carries no
  schedule, so it parses to `[]`.
- **Event numbers keep their age-group letter** (`"1A"`, `"1B"`, `"1C"`).

### ev3 vs hyv

Meet Manager exports both together in one zip and they describe the same events. The
`.ev3` is the richer file — sessions, day, event order, start times, relay legs,
sanction number, venue address, entry deadline. The `.hyv` is the Team Manager import
file: events, ages, fees and cuts only. swimparse parses both, and the test suite
asserts they agree event-for-event.

Note that SDIF also defines an `.ev3` meet-events file, which is fixed-width and a
different format. Detection sniffs content, so a fixed-width `.ev3` still routes to
the SDIF adapter.

## Privacy

The lossless rule means output carries **`swimmers[].birthDate` and `usasId` whenever the
file does.** At a youth meet that is PII for minors, so **treat every parse result as
confidential** until your application has stripped or aggregated it.

swimparse does not sanitize for you, on purpose: what counts as safe is a league decision
(a summer league publishes age-group labels and drops birthdates; a USA-Swimming tool
needs exact ages). Putting that choice in the parser would force one answer on everyone.

Test fixtures in this repo are synthetic — every identity is a public figure with a
shifted birth year; see [`test/fixtures/README.md`](test/fixtures/README.md).

**Meet-setup files are the exception**: they contain no swimmers at all, so a
`NormalizedMeetSetup` is safe to publish as-is.

## Tests

```bash
node --test    # golden snapshots + SDIF↔HY3 and EV3↔HYV cross-agreement
```

## License

MIT
