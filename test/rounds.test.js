/**
 * Rounds: prelims, swim-offs and finals.
 *
 * The two formats disagree about what a record is — HY3 writes one E1/E2 pair
 * per round, SDIF one D0 per swimmer-event with a time slot per round — so the
 * contract takes the finer grain and both adapters produce it. The property
 * that matters, and the one these tests exist to hold: **asking either file for
 * a swimmer's prelims time in an event gives the same answer.**
 *
 * `rounds.sd3` / `rounds.hy3` are hand-built (see build-rounds.py): an invented
 * meet, invented swimmers, no club data. `districts.*` are the same checks
 * against a real championship, sanitized.
 *
 * Run: `node --test` from the package root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/index.js';

const dir = new URL('./fixtures/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'latin1');
const readJson = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const load = (name) => parse(read(name), { filename: name });
const asJson = (v) => JSON.parse(JSON.stringify(v));

const sd3 = load('rounds.sd3');
const hy3 = load('rounds.hy3');

/** Every swim, keyed the way a consumer reconciling deck times would key it. */
const swims = (meet) =>
    new Map(meet.events.flatMap((ev) => ev.results.map((r) => [
        `${ev.number}|${r.swimmerName || r.teamCode}|${r.round}`,
        r.finalTime ? r.finalTime.text : null,
    ])));

for (const name of ['rounds.sd3', 'rounds.hy3']) {
    test(`${name} matches its golden snapshot`, () => {
        assert.deepStrictEqual(asJson(load(name)), readJson(`${name}.golden.json`));
    });
}

test('a swimmer gets one result per round, and the rounds are named', () => {
    for (const [format, meet] of [['sdif', sd3], ['hy3', hy3]]) {
        const ada = meet.events[0].results.filter((r) => r.swimmerName === 'Lovelace, Ada');
        assert.equal(ada.length, 2, `${format}: two swims, not one and not a duplicate`);
        assert.deepStrictEqual(ada.map((r) => r.round).sort(), ['final', 'prelim'], format);
        assert.equal(ada.find((r) => r.round === 'prelim').finalTime.text, '1:13.05', format);
        assert.equal(ada.find((r) => r.round === 'final').finalTime.text, '1:11.04', format);
        // Each round keeps its own place and heat — the prelim is not the final.
        assert.equal(ada.find((r) => r.round === 'prelim').place, 3, format);
        assert.equal(ada.find((r) => r.round === 'final').place, 1, format);
    }
});

test('all four times a record can hold are read, swim-off included', () => {
    for (const [format, meet] of [['sdif', sd3], ['hy3', hy3]]) {
        const grace = meet.events[0].results.filter((r) => r.swimmerName === 'Hopper, Grace');
        assert.deepStrictEqual(grace.map((r) => r.round).sort(), ['final', 'prelim', 'swimoff'], format);
        assert.deepStrictEqual(
            Object.fromEntries(grace.map((r) => [r.round, r.finalTime.text])),
            { prelim: '1:13.55', swimoff: '1:13.20', final: '1:12.88' },
            format,
        );
        // The entry's seed time belongs to the entry, so every round carries it.
        assert.ok(grace.every((r) => r.seedTime.text === '1:14.10'), format);
    }
});

test('a blank swim-off is absent, not zero', () => {
    for (const [format, meet] of [['sdif', sd3], ['hy3', hy3]]) {
        const results = meet.events[0].results;
        assert.equal(results.filter((r) => r.round === 'swimoff').length, 1, `${format}: only Grace swam one`);
        for (const name of ['Lovelace, Ada', 'Johnson, Katherine']) {
            const rounds = results.filter((r) => r.swimmerName === name).map((r) => r.round);
            assert.ok(!rounds.includes('swimoff'), `${format}: ${name} has no swim-off row at all`);
        }
        // A swimmer who did not advance has a prelim and nothing else — no
        // empty final standing in for the round that never happened.
        const katherine = results.filter((r) => r.swimmerName === 'Johnson, Katherine');
        assert.deepStrictEqual(katherine.map((r) => r.round), ['prelim'], format);
    }
});

test('THE PROPERTY: both formats answer the same for every swim', () => {
    const a = swims(sd3);
    const b = swims(hy3);
    assert.deepStrictEqual([...a.keys()].sort(), [...b.keys()].sort(), 'the same swims exist in both');
    for (const [k, v] of a) assert.equal(b.get(k), v, `disagreement on ${k}`);
    // Spelled out for the case the bug report named: "what was the prelims time".
    assert.equal(a.get('17A|Lovelace, Ada|prelim'), '1:13.05');
    assert.equal(b.get('17A|Lovelace, Ada|prelim'), '1:13.05');
});

test('points are recorded on the round that scores', () => {
    const finals = sd3.events[0].results.filter((r) => r.round === 'final');
    assert.equal(finals.find((r) => r.place === 1).points, 20);
    assert.ok(sd3.events[0].results.filter((r) => r.round !== 'final').every((r) => r.points === 0),
        'a prelim or swim-off does not carry the final\'s points');
});

test('a timed-finals meet is untouched apart from the round it now states', () => {
    // Every GPSA dual is timed finals: one round per entry, so the result count
    // and every value are as they were before rounds existed.
    const dual = load('gg-at-ww.sd3');
    assert.equal(dual.events.reduce((n, e) => n + e.results.length, 0), 269);
    assert.ok(dual.events.flatMap((e) => e.results).every((r) => r.round === 'final'));
    const hy = load('gg-at-ww.hy3');
    assert.equal(hy.events.reduce((n, e) => n + e.results.length, 0), 269);
    assert.ok(hy.events.flatMap((e) => e.results).every((r) => r.round === 'final'));
});

test('a real championship reconciles across formats, round by round', () => {
    const dHy3 = load('districts.hy3');
    const dCl2 = load('districts.cl2');

    const count = (m) => m.events.reduce((n, e) => n + e.results.length, 0);
    assert.equal(count(dHy3), 66);
    assert.equal(count(dCl2), 66, 'SDIF fans its D0 records out to match');

    const byRound = (m) => m.events.flatMap((e) => e.results)
        .reduce((a, r) => ({ ...a, [r.round]: (a[r.round] || 0) + 1 }), {});
    assert.deepStrictEqual(byRound(dHy3), byRound(dCl2));
    assert.deepStrictEqual(byRound(dHy3), { prelim: 45, final: 21 });

    // Clean swims must agree to the hundredth in every round. DQs are excluded
    // for the documented reason: HY3 keeps the swum time, SDIF nulls it — two
    // of this meet's prelims are DQs and that difference is the format's.
    const clean = (m) => new Map(m.events.flatMap((e) => e.results
        .filter((r) => r.kind === 'individual' && !r.disqualified && r.finalTime)
        .map((r) => [`${e.eventKey}|${r.swimmerName}|${r.round}`, r.finalTime.text])));
    const a = clean(dHy3);
    const b = clean(dCl2);
    assert.equal(a.size, 56);
    assert.deepStrictEqual([...a.keys()].sort(), [...b.keys()].sort());
    for (const [k, v] of a) assert.equal(b.get(k), v, `disagreement on ${k}`);
});
