/**
 * Golden test for the meet-SETUP adapters (.ev3 / .hyv).
 *
 * Same two guards as golden.test.js, one level up the pipeline:
 *  1. Regression — each fixture still parses to its committed snapshot.
 *  2. Cross-format agreement — Meet Manager exports the .ev3 and .hyv of a meet
 *     together, so they describe the SAME events and must parse alike.
 *
 * Fixtures are three real, public meet setups (see fixtures/README.md), one of
 * them LCM — the pair of championships is what pins the qualifying-time columns
 * to courses rather than to positions. Setup files hold no swimmers, so unlike
 * the result fixtures there is nothing to sanitize.
 *
 * Run: `node --test` from the package root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, parseSetup, detectFormat, qualifyingStandards } from '../src/index.js';

const dir = new URL('./fixtures/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'latin1');
const readJson = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const load = (name) => parseSetup(read(name), { filename: name });

// A championship meet: prelims, gendered sessions, and qualifying cuts.
const champsEv3 = load('sc-agchamps.ev3');
const champsHyv = load('sc-agchamps.hyv');
// The same championship the other half of the year — an LCM meet, which is what
// proves the qualifying-time columns are read by course and not by position.
const lcEv3 = load('lc-agchamps.ev3');
const lcHyv = load('lc-agchamps.hyv');
// A zone championship: cuts again, but with its SCM column blanket-filled with
// placeholders, and twelve sessions across four days.
const ezEv3 = load('ez-agchamps.ev3');
const ezHyv = load('ez-agchamps.hyv');
// A district championship: prelims and finals, and a meet whose header states
// no course at all — only its event rows do.
const districtsEv3 = load('districts.ev3');
const districtsHyv = load('districts.hyv');
// An invitational: timed finals, letter-suffixed events, relays, no cuts.
const blastoffEv3 = load('blastoff.ev3');
const blastoffHyv = load('blastoff.hyv');

const asJson = (v) => JSON.parse(JSON.stringify(v));

for (const name of ['sc-agchamps.ev3', 'sc-agchamps.hyv', 'lc-agchamps.ev3', 'lc-agchamps.hyv', 'ez-agchamps.ev3', 'ez-agchamps.hyv', 'districts.ev3', 'districts.hyv', 'blastoff.ev3', 'blastoff.hyv']) {
    test(`${name} matches its golden snapshot`, () => {
        assert.deepStrictEqual(asJson(load(name)), readJson(`${name}.golden.json`));
    });
}

test('setup formats are detected by content, not extension', () => {
    assert.equal(detectFormat(read('sc-agchamps.ev3')), 'ev3');
    assert.equal(detectFormat(read('sc-agchamps.hyv')), 'hyv');
    // A result file must not be mistaken for a setup file, or vice versa.
    assert.equal(detectFormat(read('gg-at-ww.hy3'), 'gg-at-ww.hy3'), 'hy3');
    assert.equal(detectFormat(read('gg-at-ww.sd3'), 'gg-at-ww.sd3'), 'sdif-v3');
});

test('parse() and parseSetup() refuse each other\'s files with a useful message', () => {
    assert.throws(() => parse(read('sc-agchamps.ev3'), { filename: 'x.ev3' }), /setup file.*parseSetup/is);
    assert.throws(() => parseSetup(read('gg-at-ww.hy3'), { filename: 'x.hy3' }), /result file.*parse\(\)/is);
});

// The .ev3 carries sessions, day, event order and relay legs; the .hyv does not.
// Everything else must agree event-for-event, in the same order.
const shared = (e) => ({
    number: e.number,
    type: e.type,
    round: e.round,
    gender: e.gender,
    distance: e.distance,
    stroke: e.stroke,
    course: e.course,
    ageGroup: e.ageGroup,
    description: e.description,
    eventKey: e.eventKey,
    entryFee: e.entryFee,
    qualifyingTimes: e.qualifyingTimes,
});

// districts is deliberately absent: its hyv states no course, so its events
// cannot label or key identically to its ev3's. That asymmetry has its own test.
for (const [meet, ev3, hyv] of [['sc-agchamps', champsEv3, champsHyv], ['lc-agchamps', lcEv3, lcHyv], ['ez-agchamps', ezEv3, ezHyv], ['blastoff', blastoffEv3, blastoffHyv]]) {
    test(`${meet}: the ev3 and hyv describe the same events`, () => {
        assert.equal(ev3.meet.name, hyv.meet.name);
        assert.equal(ev3.meet.startDate, hyv.meet.startDate);
        assert.equal(ev3.meet.course, hyv.meet.course);
        assert.equal(ev3.events.length, hyv.events.length);
        assert.deepStrictEqual(asJson(ev3.events.map(shared)), asJson(hyv.events.map(shared)));
    });
}

test('sessions are collapsed out of the per-event stamps (ev3 only)', () => {
    assert.deepStrictEqual(
        champsEv3.sessions.map((s) => [s.id, s.day, s.startTime, s.eventCount]),
        [
            ['1G', 1, '16:15', 4], ['1B', 1, '16:15', 4],
            ['2G', 2, '08:30', 17], ['2B', 2, '08:30', 17],
            ['4G', 3, '08:30', 20], ['4B', 3, '08:30', 20],
            ['6G', 4, '08:30', 17], ['6B', 4, '08:30', 17],
        ],
    );
    assert.deepStrictEqual(champsHyv.sessions, [], 'the hyv carries no session schedule');
    assert.equal(blastoffEv3.sessions.length, 5);
    assert.equal(ezEv3.sessions.length, 12, 'four days of prelims, finals and timed-final sessions');
    assert.deepStrictEqual([...new Set(ezEv3.sessions.map((s) => s.day))], [1, 2, 3, 4]);
    assert.equal(blastoffEv3.sessions.reduce((n, s) => n + s.eventCount, 0), blastoffEv3.events.length);
});

test('event shape: prelims, relays, letter-suffixed numbers, open-ended ages', () => {
    const ev = (setup, number) => setup.events.find((e) => e.number === number);

    // Prelims feeding a final; rounds=2 in the ev3, unstated in the hyv.
    assert.equal(ev(champsEv3, '9').round, 'prelims');
    assert.equal(ev(champsEv3, '9').rounds, 2);
    assert.equal(ev(champsHyv, '9').round, 'prelims');
    assert.equal(ev(champsHyv, '9').rounds, null);

    // A relay: stroke E means Medley for a relay, IM for an individual.
    const relay = ev(blastoffEv3, '117');
    assert.equal(relay.type, 'relay');
    assert.equal(relay.stroke, 'Medley');
    assert.equal(relay.relayLegs, 4);
    assert.equal(relay.gender, 'X');
    assert.equal(relay.description, 'Mixed 10 & Under 200y Medley Relay', 'a yards meet says y');
    assert.equal(ev(champsEv3, '33').stroke, 'IM', 'the same code is IM individually');

    // Event numbers keep their age-group letter.
    assert.equal(ev(blastoffEv3, '1A').ageGroup.label, '8 & Under');
    assert.equal(ev(blastoffEv3, '1C').ageGroup.label, '11-12');

    // ev3 writes an open-ended upper age as 109, the hyv as 0.
    assert.equal(ev(blastoffEv3, '3B').ageGroup.label, '15 & Over');
    assert.equal(ev(blastoffHyv, '3B').ageGroup.label, '15 & Over');
});

test('qualifying cuts are read per course, and pin the LCM/SCM/SCY column order', () => {
    // Verified against Virginia Swimming's published 2025-2028 Age Group
    // Championship QT table, whose LCM / SCM / SCY columns for this event read
    // 29.49 / 28.89 / 25.89. This assertion is what holds the mapping honest.
    const free50 = champsEv3.events.find((e) => e.eventKey === 'individual:F:13-14:50:Freestyle:SCY');
    assert.deepStrictEqual(
        { LCM: free50.qualifyingTimes.LCM.text, SCM: free50.qualifyingTimes.SCM.text, SCY: free50.qualifyingTimes.SCY.text },
        { LCM: '29.49', SCM: '28.89', SCY: '25.89' },
    );
    assert.equal(free50.qualifyingTimes.LCM.seconds, 29.49);

    // A cut given in only two courses keeps the missing one null (100 IM has no LCM).
    const im100 = champsEv3.events.find((e) => e.eventKey === 'individual:F:0-10:100:IM:SCY');
    assert.equal(im100.qualifyingTimes.LCM, null);
    assert.equal(im100.qualifyingTimes.SCM.text, '1:27.99');

    // Relays are un-cut in this meet.
    assert.equal(champsEv3.events.find((e) => e.type === 'relay').qualifyingTimes.SCY, null);
});

test('the cut columns are read by course, not by position', () => {
    // The SC and LC championships run the same standards, so an event that
    // appears in both must come out with the same three times against the same
    // three course keys — even though the LC meet is LCM and orders its hyv
    // columns differently. Parse the two files by position instead of by course
    // and this is the test that fails.
    // Matched on the course-INDEPENDENT fields on purpose: the SC meet's race is
    // 100 yards and the LC meet's is 100 metres, so as of 0.3.0 they differ in
    // both `description` and `eventKey`. They are different races that happen to
    // share a standards table — which is precisely why course is part of the key.
    const breast100 = (setup) => setup.events.find((e) =>
        e.gender === 'F' && e.ageGroup.label === '13-14' && e.distance === 100 && e.stroke === 'Breaststroke');
    const expected = { LCM: '1:22.99', SCM: '1:20.99', SCY: '1:12.29' };
    for (const [name, setup] of [['sc ev3', champsEv3], ['sc hyv', champsHyv], ['lc ev3', lcEv3], ['lc hyv', lcHyv]]) {
        const q = breast100(setup).qualifyingTimes;
        assert.deepStrictEqual({ LCM: q.LCM.text, SCM: q.SCM.text, SCY: q.SCY.text }, expected, name);
    }

    // The meets themselves are held in different courses, which is the whole point.
    assert.equal(champsEv3.meet.course, 'SCY');
    assert.equal(lcEv3.meet.course, 'LCM');
    assert.equal(lcHyv.meet.course, 'LCM');
    // The ev3 states a course per event; the hyv states none and falls back to
    // the meet's, so both flavours label and key an event identically. Without
    // that fallback the hyv's events would read "100 Breaststroke" with no unit
    // and key on '?', and would not join to anything.
    assert.equal(lcEv3.events[0].course, 'LCM');
    assert.equal(champsEv3.events[0].course, 'SCY');
    assert.equal(lcHyv.events[0].course, 'LCM');
    assert.equal(lcHyv.events[0].eventKey, lcEv3.events[0].eventKey);
});

test('a meet course is taken from the event rows when the header omits it', () => {
    // The districts header states no course anywhere: ev3 field 5 reads 'O' and
    // the hyv's course field is empty. Every ev3 event row says 'L', so that is
    // where the meet's course comes from — header field 5 is a list of ACCEPTED
    // entry-time courses ('YLS', 'LSY', 'YO', 'O'), and only usually opens with
    // the meet's own.
    assert.equal(districtsEv3.meet.course, 'LCM');
    assert.ok(districtsEv3.events.every((e) => e.course === 'LCM'));

    // Four rows leave even that column blank; they inherit the meet's course
    // rather than keying on '?' and joining to nothing.
    const im400 = districtsEv3.events.filter((e) => e.distance === 400 && e.stroke === 'IM');
    assert.ok(im400.length >= 4);
    assert.ok(im400.every((e) => e.eventKey.endsWith(':LCM')));

    // The hyv of the same meet has nowhere to get a course from — no header
    // field, no per-event column — so it honestly reports none, and its keys
    // cannot join. Use the ev3 when a meet is exported without a course.
    assert.equal(districtsHyv.meet.course, null);
    assert.ok(districtsHyv.events.every((e) => e.eventKey.endsWith(':?')));

    // An unset age-up date (Delphi's 12/30/1899, as here) reads as null.
    assert.equal(districtsEv3.meet.ageUpDate, null);
    assert.equal(districtsEv3.meet.startDate, '2026-06-26');
});

test('a prelims/finals meet is distinguishable from timed finals in the setup', () => {
    const prelim = districtsEv3.events.find((e) => e.round === 'prelims');
    assert.equal(prelim.rounds, 2, 'prelims feed a final');
    const timed = districtsEv3.events.find((e) => e.round === 'finals');
    assert.equal(timed.rounds, 1, 'a timed final has one round');
    // Every event is one or the other.
    assert.deepStrictEqual(
        [...new Set(districtsEv3.events.map((e) => `${e.round}/${e.rounds}`))].sort(),
        ['finals/1', 'prelims/2'],
    );
});

test('a placeholder cut is kept verbatim on the event and dropped from the cut table', () => {
    // The Eastern Zone meet does not accept SCM times and blanket-fills that
    // column with 0.01/1.00 on all 108 events — including relays, which have no
    // cut in any course.
    const im200 = ezEv3.events.find((e) => e.eventKey === 'individual:F:13-14:200:IM:LCM');
    assert.equal(im200.qualifyingTimes.SCM.text, '0.01', 'the parse stays verbatim');
    assert.equal(im200.qualifyingTimes.LCM.text, '2:33.09');
    assert.equal(im200.qualifyingTimes.SCY.text, '2:15.39');

    const relays = ezEv3.events.filter((e) => e.type === 'relay');
    assert.equal(relays.length, 24);
    assert.ok(relays.every((e) => e.qualifyingTimes.SCM), 'every relay carries the placeholder');

    // Six individual events — the 13-14 50m strokes — are left properly blank,
    // placeholder included, which is what shows the fill was deliberate.
    const blank = ezEv3.events.filter((e) => !Object.values(e.qualifyingTimes).some(Boolean));
    assert.deepStrictEqual(blank.map((e) => e.description), [
        'Girls 13-14 50m Breaststroke', 'Boys 13-14 50m Breaststroke',
        'Girls 13-14 50m Butterfly', 'Boys 13-14 50m Butterfly',
        'Girls 13-14 50m Backstroke', 'Boys 13-14 50m Backstroke',
    ], 'an LCM meet says m');

    const cuts = qualifyingStandards(ezEv3);
    assert.equal(cuts.length, 78, 'the individual events that carry a real cut');
    assert.equal(cuts.length, ezEv3.events.filter((e) => e.type === 'individual').length - blank.length);
    assert.ok(cuts.every((c) => c.SCM === null), 'the placeholder column is dropped');
    assert.ok(cuts.every((c) => c.LCM && c.SCY), 'the two real columns survive');
    assert.deepStrictEqual(qualifyingStandards(ezHyv).map((c) => c.eventNumber), cuts.map((c) => c.eventNumber));
});

test('the qualifying period start is read when the meet states one', () => {
    assert.equal(champsEv3.meet.qualifyingSince, '2024-11-01');
    assert.equal(lcEv3.meet.qualifyingSince, '2024-11-01');
    assert.equal(ezEv3.meet.qualifyingSince, '2025-08-06');
    // The meet with no cuts leaves the field at the epoch sentinel.
    assert.equal(blastoffEv3.meet.qualifyingSince, null);
});

test('qualifyingStandards() flattens the cuts, and is empty for a meet without any', () => {
    const cuts = qualifyingStandards(champsEv3);
    assert.equal(cuts.length, 90);
    assert.equal(cuts.length, champsEv3.events.filter((e) => e.type === 'individual').length);
    assert.deepStrictEqual(qualifyingStandards(champsHyv).map((c) => c.eventNumber), cuts.map((c) => c.eventNumber));

    assert.deepStrictEqual(qualifyingStandards(blastoffEv3), [], 'the invitational sets no cuts');

    const lcCuts = qualifyingStandards(lcEv3);
    assert.equal(lcCuts.length, lcEv3.events.filter((e) => e.type === 'individual').length);
    assert.deepStrictEqual(lcCuts.map((c) => c.eventNumber), qualifyingStandards(lcHyv).map((c) => c.eventNumber));
});

test('the documented cut row is what the code actually emits', () => {
    // docs/qualifying-cuts.md shows a sample row and calls it verbatim output.
    // Keep that claim true: a sample that drifts is worse than none.
    const doc = readFileSync(new URL('../docs/qualifying-cuts.md', import.meta.url), 'utf8');
    const sample = JSON.parse(/```json\n([\s\S]*?)```/.exec(doc)[1]);
    const actual = qualifyingStandards(champsEv3).find((c) => c.eventNumber === sample.eventNumber);
    assert.deepStrictEqual(asJson(actual), sample);
});

test('meet header: dates, course, sanction and entry deadline', () => {
    assert.deepStrictEqual(asJson(champsEv3.meet), {
        name: '2026 Virginia Swimming SC Age Group Champions',
        rawName: '2026 Virginia Swimming SC Age Group Champions',
        hostName: 'Collegiate School Aquatic Center',
        startDate: '2026-03-12',
        endDate: '2026-03-15',
        ageUpDate: '2026-03-12',
        course: 'SCY',
        sanction: 'VS-26-83',
        entryDeadline: '2026-03-04',
        qualifyingSince: '2024-11-01',
        location: { address: '5050 Ridgedale Parkway', city: 'Richmond', state: 'VA', postalCode: '23234', country: 'USA', lsc: 'VA' },
    });
    // The hyv header is the short one: no sanction, deadline or address.
    assert.equal(champsHyv.meet.sanction, undefined);
    assert.equal(champsHyv.meet.location, undefined);
    assert.equal(champsHyv.meet.endDate, '2026-03-15');
});
