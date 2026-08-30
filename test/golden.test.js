/**
 * Golden test for swimparse.
 *
 * Guards two things at once:
 *  1. Regression — each fixture must still parse to its committed golden snapshot.
 *  2. Cross-format agreement — the SDIF and HY3 files describe the SAME meet, so
 *     their parses must agree swim-for-swim. This is the check that caught the
 *     event-0 and medley-stroke bugs; it stays on permanently.
 *
 * Fixtures are synthetic (public figures, birth years shifted to match age
 * groups) — see fixtures/README.md. No real swimmer data.
 *
 * Run: `node --test` from the package root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, parseSetup } from '../src/index.js';

const dir = new URL('./fixtures/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'latin1');
const readJson = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));

const sd3 = parse(read('gg-at-ww.sd3'), { filename: 'gg-at-ww.sd3' });
const hy3 = parse(read('gg-at-ww.hy3'), { filename: 'gg-at-ww.hy3' });

// A NormalizedMeet's canonical form is its JSON; normalize away undefined-valued
// optional keys before comparing to the committed snapshot.
const asJson = (v) => JSON.parse(JSON.stringify(v));

test('SDIF fixture matches its golden snapshot', () => {
    assert.deepStrictEqual(asJson(sd3), readJson('gg-at-ww.sd3.golden.json'));
});

test('HY3 fixture matches its golden snapshot', () => {
    assert.deepStrictEqual(asJson(hy3), readJson('gg-at-ww.hy3.golden.json'));
});

test('both formats agree on meet identity', () => {
    assert.equal(sd3.meet.startDate, hy3.meet.startDate);
    assert.deepStrictEqual(
        sd3.teams.map((t) => t.code).sort(),
        hy3.teams.map((t) => t.code).sort(),
    );
    assert.equal(sd3.events.length, hy3.events.length);
    assert.equal(sd3.swimmers.length, hy3.swimmers.length);
});

test('both formats agree on course and event identity', () => {
    // The two files state the course in completely different places — SDIF in
    // B1 col 150 and beside each time, HY3 only in E2 col 12 — so agreement here
    // is a real check, not a tautology. `eventKey` is the join key consumers are
    // told to use, and it is worthless if the two adapters disagree on it.
    assert.equal(sd3.meet.course, 'SCM');
    assert.equal(hy3.meet.course, 'SCM');
    assert.deepStrictEqual(
        sd3.events.map((e) => e.eventKey).sort(),
        hy3.events.map((e) => e.eventKey).sort(),
    );
    assert.ok(sd3.events.every((e) => e.course === 'SCM'), 'every event carries its course');

    // A 25m pool, so distances read in metres. The same event at a yards meet
    // would say "50y" — descriptions are display text and follow the course.
    const key = 'individual:M:15-18:50:Freestyle:SCM';
    assert.equal(sd3.events.find((e) => e.eventKey === key).description, 'Boys 15-18 50m Freestyle');
    assert.equal(hy3.events.find((e) => e.eventKey === key).description, 'Boys 15-18 50m Freestyle');

    // Keys must be unique per event, or a join fans out silently.
    const keys = sd3.events.map((e) => e.eventKey);
    assert.equal(new Set(keys).size, keys.length, 'event keys are unique within a meet');
});

test('an open-ended age band is not degraded to "Open"', () => {
    // E1/F1 store min and max age as two right-justified 3-char columns. A
    // bounded band leaves a space between them ("  15 18"), an open-ended one
    // does not (" 15109"), so a whitespace split silently collapsed every
    // "15 & Over" event into "Open". This league's top band is 15-18, which is
    // exactly why it went unnoticed here — repack one entry to prove the fix.
    const lines = read('gg-at-ww.hy3').split(/\r?\n/);
    const i = lines.findIndex((l) => l.startsWith('E1') && l.slice(22, 28) === ' 15 18');
    assert.ok(i >= 0, 'expected a 15-18 entry in the fixture');
    lines[i] = `${lines[i].slice(0, 22)} 15109${lines[i].slice(28)}`;

    const meet = parse(lines.join('\r\n'), { format: 'hy3' });
    const ev = meet.events.find((e) => e.ageGroup.label === '15 & Over');
    assert.ok(ev, 'a packed 15/109 band must read as "15 & Over", not "Open"');
    assert.equal(ev.ageGroup.lower, 15);
    assert.ok(ev.eventKey.includes(':15-99:'), ev.eventKey);

    // The meet's genuinely open events — the unnumbered mixed relays — are
    // untouched. Repacking one band must not manufacture another "Open".
    const openCount = (m) => m.events.filter((e) => e.ageGroup.label === 'Open').length;
    assert.equal(openCount(meet), openCount(hy3), 'no event was collapsed into Open');
});

// The districts fixtures are one championship end to end: setup, cuts and
// swims. They are the only pair that can prove a join from a setup file to a
// result file, which is what `eventKey` exists for.
const dHy3 = parse(read('districts.hy3'), { filename: 'districts.hy3' });
const dCl2 = parse(read('districts.cl2'), { filename: 'districts.cl2' });

test('a setup file joins to its own results on eventKey', () => {
    const setup = parseSetup(read('districts.ev3'), { filename: 'districts.ev3' });
    const setupKeys = new Set(setup.events.map((e) => e.eventKey));
    for (const ev of dHy3.events) {
        assert.ok(setupKeys.has(ev.eventKey), `result event absent from its own setup: ${ev.eventKey}`);
    }
    // And the two result formats describe the same events as each other.
    assert.deepStrictEqual(
        dHy3.events.map((e) => e.eventKey).sort(),
        dCl2.events.map((e) => e.eventKey).sort(),
    );
    assert.equal(dHy3.meet.course, 'LCM');
    assert.equal(dCl2.meet.course, 'LCM');
    assert.equal(dHy3.swimmers.length, dCl2.swimmers.length);
});

test('KNOWN GAP: the formats disagree on result counts for a prelims meet', () => {
    // Not a desired outcome — a record of where the parser stands before rounds
    // are modelled. HY3 writes an E1/E2 pair per round, so a swimmer who made
    // finals appears twice with nothing to tell the rows apart; SDIF writes one
    // D0 per entry carrying both times, and only the finals time is read. Once
    // swims[] lands, both must report one result per entry and this flips.
    const count = (m) => m.events.reduce((n, e) => n + e.results.length, 0);
    assert.equal(count(dHy3), 66, 'HY3: one row per ROUND swum');
    assert.equal(count(dCl2), 50, 'SDIF: one row per ENTRY');
    assert.equal(dCl2.events.length, dHy3.events.length, 'the events themselves already agree');
});

// Index individual results by swimmer + event (identities are identical across files).
function individualIndex(meet) {
    const map = new Map();
    for (const ev of meet.events) {
        if (ev.type !== 'individual') continue;
        for (const r of ev.results) {
            map.set(`${r.swimmerName}|${ev.distance}|${ev.stroke}|${ev.gender}|${ev.ageGroup.label}`, r);
        }
    }
    return map;
}

test('SDIF and HY3 agree on every individual swim', () => {
    const a = individualIndex(sd3);
    const b = individualIndex(hy3);
    const keys = new Set([...a.keys(), ...b.keys()]);

    let matched = 0;
    let bothDq = 0;
    for (const k of keys) {
        const ra = a.get(k);
        const rb = b.get(k);
        assert.ok(ra, `only in HY3: ${k}`);
        assert.ok(rb, `only in SDIF: ${k}`);
        matched++;

        if (ra.disqualified && rb.disqualified) bothDq++;
        else assert.equal(ra.disqualified, rb.disqualified, `DQ mismatch: ${k}`);

        // Clean (non-DQ) swims must match to the hundredth.
        if (ra.finalTime && rb.finalTime) {
            assert.ok(Math.abs(ra.finalTime.seconds - rb.finalTime.seconds) < 0.005, `time mismatch: ${k}`);
        }
    }
    assert.equal(matched, 257, 'expected 257 individual swims in both files');
    assert.equal(bothDq, 21, 'expected 21 disqualifications agreed by both formats');
});

test('HY3 retains the swum time and a reason on a DQ; SDIF nulls the time', () => {
    // Cochran→"Newton, Isaac", Boys 15-18 50m Butterfly is a known DQ in this meet.
    const find = (meet) =>
        meet.events
            .flatMap((e) => e.results.map((r) => ({ e, r })))
            .find(({ r }) => r.swimmerName === 'Newton, Isaac' && r.disqualified);

    const h = find(hy3);
    const s = find(sd3);
    assert.ok(h && s, 'expected the DQ in both files');
    assert.ok(h.r.finalTime && h.r.finalTime.seconds > 0, 'HY3 keeps the DQ time');
    assert.ok(h.r.dqReason && h.r.dqReason.length > 0, 'HY3 carries a DQ reason');
    assert.equal(s.r.finalTime, null, 'SDIF nulls the DQ time');
});
