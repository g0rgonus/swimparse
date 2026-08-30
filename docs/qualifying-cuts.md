# Qualifying cuts from a meet-setup file

What `qualifyingStandards()` gives you, what it deliberately does not, and the four
mistakes that are easy to make with it.

## The shape

One row per event that states a real cut. This is verbatim output, not an illustration:

```json
{
  "eventNumber": "55",
  "eventKey": "individual:F:13-14:50:Freestyle:SCY",
  "description": "Girls 13-14 50y Freestyle",
  "gender": "F",
  "ageGroup": { "label": "13-14", "lower": 13, "upper": 14 },
  "distance": 50,
  "stroke": "Freestyle",
  "LCM": { "text": "29.49", "seconds": 29.49 },
  "SCM": { "text": "28.89", "seconds": 28.89 },
  "SCY": { "text": "25.89", "seconds": 25.89 }
}
```

`LCM` / `SCM` / `SCY` are the same standard stated three ways — one per course — each a
`SwimTime` (`{ text, seconds }`) or `null`. Every other field describes the event and
matches what the result adapters emit for the same event.

**Join on `eventKey`.** It is built from what an event *is* — type, gender, age range,
distance, stroke, course — and the result adapters build it with the same function, so a
cut row and the swims in that event carry byte-identical keys. `description` is display
text whose wording may change, and `eventNumber` is only unique within one meet.

```js
import { parseSetup, qualifyingStandards } from 'swimparse';

const setup = parseSetup(readFileSync('Meet Events-2026 Champs.ev3', 'latin1'));
const cuts = qualifyingStandards(setup);
```

Or from the CLI — `swimparse events.ev3 --cuts`, which is the same array. To publish it
as a table:

```bash
swimparse events.ev3 --cuts \
  | jq -r '["Event","LCM","SCM","SCY"], (.[] | [.description, .LCM.text, .SCM.text, .SCY.text]) | @csv'
```

## Five things to get right

**1. Read by course key, never by column position.** The `.ev3` and `.hyv` of the same
meet order their three time columns differently — the `.hyv` rotates them to start at
the meet's own course. swimparse resolves that for you; downstream code that
re-flattens these rows back into a fixed 3-column layout must carry the course label
with each value or it will re-introduce the bug.

**2. `null` means the meet stated no cut in that course.** It does not mean "any time
qualifies", and it is not an invitation to convert a time from another course.
**swimparse never converts between courses** — a converted time is a rule the meet
either accepts or does not, and only the meet announcement says which. If a swimmer's
only time is SCY and the SCY cut is `null`, the honest answer to "do they qualify" is
*this file cannot tell you*.

A course can also be refused loudly rather than left blank: a meet may fill a column it
does not accept with a placeholder like `0.01`. `qualifyingStandards()` drops those, so
they arrive as `null` here — but `setup.events[].qualifyingTimes` keeps them verbatim,
which is where to look if you need to know the difference between "not stated" and
"stated as unusable".

**3. `description` is for humans; `eventKey` is for code.** The unit in a description
follows the meet's course — `50y` for a yards meet, `50m` for a metre one. That is
display detail, and it means the same standards table renders differently for the short-
course-yards and long-course-metres editions of a championship. Do not pattern-match it.

**4. Compare on `seconds`, display `text`.** `seconds` is a float rounded to hundredths;
`text` is the canonical `M:SS.ss` form. Never string-compare times.

**5. Meeting a cut is your rule, not the file's.** swimparse reports the standard; it
has no opinion on whether a swimmer meets it. Whether an equal time qualifies, whether a
bonus or unqualified entry is allowed, how many events a swimmer may enter, and whether
the swim happened inside the eligible period are all meet rules that live in the meet
announcement. `meet.qualifyingSince` is the file's own start-of-period date when it
states one — it is inferred from sample files rather than from a published spec, so
treat it as a hint to check against the announcement, not as authority.

```js
// The comparison itself is one line; the judgement around it is yours.
const qualifies = (swimSeconds, cut) => cut != null && swimSeconds <= cut.seconds;
```

## What is absent, and why

Relays usually carry no cut at all, so they usually do not appear in this table. Events
a meet deliberately leaves open — bonus or unqualified events — do not appear either,
and are indistinguishable here from events the meet forgot to configure. If you need
every event whether cut or not, iterate `setup.events` instead and read
`qualifyingTimes` yourself; `qualifyingStandards()` is the convenience view, not the
whole file.

## Stability

The field names above are the contract. Additions are possible; renames or a change of
meaning are not, without a major version. Two rules will not change:
`qualifyingStandards()` stays filtered and `events[].qualifyingTimes` stays verbatim.
