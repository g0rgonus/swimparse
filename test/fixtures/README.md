# Test fixtures — synthetic, safe to commit

`gg-at-ww.sd3` and `gg-at-ww.hy3` are the **same summer-league dual meet** exported in the
two supported formats (SDIF v3 and Hy-Tek), used by `golden.test.js` to prove the
two adapters agree swim-for-swim.

## These contain NO real swimmer data

They were derived from a real meet file, but **every swimmer identity was replaced
with a public figure** (Einstein, Curie, Ledecky, …). For each swimmer:

- name → a public figure of the same sex,
- birth **year** → shifted so the figure's age (as of June 1) matches the age group
  that swimmer competes in (month/day are the figure's real-ish birthday),
- USA-S ID / registration codes → regenerated from the fake name + date.

Everything else — times, places, DQs and reasons, event structure, relay legs — is
preserved exactly, so the files remain a faithful parser test. The generator
verifies that no real surname survives in any name field.

## One deliberate edit: a cleared time

Presley, Elvis's **Boys 15-18 50m Butterfly** win (place 1) has its **final time
blanked in both files** — SDIF `D0` cols `[115,123)` and HY3 `E2` cols `[4,11)`,
place preserved. This mirrors a real *cleared time*: when a timing issue leaves a
placed swim with no usable time and no backup, the scorekeeper clears the time in
Meet Maestro. Both parsers render it as `finalTime: null, status: "ok"` (a no-time,
**not** a DQ) rather than inventing a zero. Do not "restore" this time — it is the
fixture's only cleared time, and it is what proves both adapters distinguish "no time
recorded" from "disqualified".

## Golden snapshots

`*.golden.json` are the expected `NormalizedMeet` outputs. Regenerate them only
when a parser change is intentional:

```bash
node -e "import('../src/index.js').then(async m=>{const {readFileSync,writeFileSync}=await import('node:fs');
for(const f of ['gg-at-ww.sd3','gg-at-ww.hy3']){
  const meet=m.parse(readFileSync(f,'latin1'),{filename:f});
  writeFileSync(f+'.golden.json', JSON.stringify(meet,null,2));}})"
```

Then review the diff and run `node --test`.

---

# Meet-setup fixtures — real files, no personal data

`sc-agchamps.*`, `lc-agchamps.*`, `ez-agchamps.*` and `blastoff.*` are four **real,
public meet setups**, each the `.ev3` and `.hyv` pair Meet Manager exports together,
used by `setup.test.js`.

A setup file is the meet before anyone has entered it — events, sessions, fees and
qualifying cuts. **There are no swimmers in it**, so unlike the result fixtures above
there was nothing to sanitize; these are the files as exported.

| Fixture | Meet | Exercises |
|---|---|---|
| `sc-agchamps.ev3` / `.hyv` | 2026 Virginia Swimming SC Age Group Champions | an **SCY** meet: qualifying cuts in three courses, prelims, gendered sessions, sanction number |
| `lc-agchamps.ev3` / `.hyv` | 2026 Virginia Swimming LC Age Group Champions | an **LCM** meet running the same standards — the hyv's rotated cut columns |
| `ez-agchamps.ev3` / `.hyv` | 2026 Eastern Zone LC Age Group Championship | placeholder cuts (`0.01`/`1.00`) filling an unaccepted course, twelve sessions over four days, six events left properly uncut |
| `blastoff.ev3` / `.hyv` | 2026 SwimRVA Blastoff Meet | timed finals, letter-suffixed event numbers (`1A`/`1B`/`1C`), relays, five sessions, no cuts |

## The cut columns are pinned by a published table, in two courses

`setup.test.js` asserts that Girls 13-14 50 Free reads LCM 29.49 / SCM 28.89 / SCY 25.89,
which is exactly that row of Virginia Swimming's published *2025-2028 Age Group
Championship QTs*. That assertion is the evidence for the column-to-course mapping —
if it ever fails, re-derive the mapping against the published table rather than
re-recording the golden.

**Why the LC pair earns its place:** the SC and LC championships run the same
standards, so a shared event must parse to the same three times against the same three
course keys. It does not fall out for free — the `.ev3` fixes its columns at
LCM/SCM/SCY, while the `.hyv` **rotates** them to start at the meet's own course. Two
meets in one course cannot tell those two rules apart; these two, in different courses,
can. Do not drop either meet from the fixture set.

# Round fixtures — hand-built

`rounds.sd3` and `rounds.hy3` are the **same invented meet** written in both formats:
three swimmers in one event, chosen to cover every round shape a file can hold.

| Swimmer | Rounds | Covers |
|---|---|---|
| Lovelace, Ada | prelim + final | the ordinary championship swim — an `E2P`/`E2F` pair in HY3, two filled slots in SDIF |
| Hopper, Grace | prelim + swim-off + final | a `D0` with all four times, seed included |
| Johnson, Katherine | prelim only | a blank swim-off and final — **absent, not zero** |

No club data, no real swimmers, no source export: `build-rounds.py` writes both files
from the table at the top of it, laying each record out by column. Extend the table to
extend the fixtures.

They exist to hold one property, which is what a consumer reconciling deck-entered times
against official results depends on: **asking either file for a swimmer's prelims time in
an event gives the same answer.**

# Prelims/finals result fixtures — sanitized

`districts.hy3` and `districts.cl2` are the **results of the same meet** as `districts.ev3`
/ `.hyv`, so the four together are one championship end to end: its event list, its
qualifying setup, and its swims. That makes them the only fixtures that can prove an
`eventKey` join from a setup file to a result file, and the only real-file evidence that
the two formats agree round by round.

**Nothing in them identifies anyone.** The swimmers were replaced first; the clubs, their
short names and street addresses, the meet's name, venue, sanction number and licensee
went the same way afterwards. Eight invented clubs (AQUA, BLUE, CRES, DELT, ECHO, FALC,
GULL, HARB) at an invented venue. What remains is structure — events, rounds, times,
places, heats, lanes, dates — which is the whole reason the files are here.

They are a **three-event subset** — two individual events with prelims, finals and DQs,
plus one relay — because the real export is 10,041 lines and its golden would be ~2.6 MB.

## What was removed

Both source exports are **WODOB** (no date of birth anywhere — only ages), which is how
Meet Manager exports when privacy filtering is on, so there were no birthdates to
sanitize. Every identity was replaced: club and meet identity as described above, and
for swimmers their names, preferred names, middle initials and registration ids,
consistently across both formats, including the places they repeat — the 5-character surname prefixes in `E1`, the relay-leg fragments in `F3`,
the name and id echoed in every SDIF `G0` split record, and the second id/name block in
`F0`. Ages are untouched, so every age group stays valid. Club addresses (`C2`) and
contacts (`C3`) are dropped: unread by the parsers, and no reason to ship them.

**No sanitizer ships here.** swimparse does not touch personal data — it emits what a
file contains and leaves handling it to the consumer — so a sanitizing tool has no place
in this repo either. These fixtures were generated outside it from an export that is not
in this repo and must not be. If they ever need regenerating, that happens outside too.

## What they are for

The two formats describe the same meet and must agree, but a prelims meet is where they
structurally differ: HY3 writes an `E1`/`E2` pair per round, SDIF writes one `D0` per
entry holding both times. The fixture preserves that difference in miniature.

## Golden snapshots

Same rule as above — regenerate only when a parser change is intentional:

```bash
node -e "import('../../src/index.js').then(async m=>{const {readFileSync,writeFileSync}=await import('node:fs');
for(const f of ['sc-agchamps.ev3','sc-agchamps.hyv','lc-agchamps.ev3','lc-agchamps.hyv','ez-agchamps.ev3','ez-agchamps.hyv','blastoff.ev3','blastoff.hyv']){
  const s=m.parseSetup(readFileSync(f,'latin1'),{filename:f});
  writeFileSync(f+'.golden.json', JSON.stringify(s,null,2)+'\n');}})"
```
