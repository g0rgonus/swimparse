/**
 * Hy-Tek (.hy3) adapter → NormalizedMeet.
 *
 * 130-char fixed-width records (128 data + 2 checksum), CP-1252, CRLF.
 * Record types handled:
 *   A1 file · B1 meet · C1 team · D1 athlete
 *   E1 entry / E2 result (individual, paired)
 *   F1 entry / F2 result / F3 legs (relay)
 *   G1 splits · H1 DQ reason
 *
 * Two things HY3 gives us that SDIF does not: it RETAINS the swum time on a DQ,
 * and it carries a structured DQ reason (H1). One thing it lacks: meet
 * points — Hy-Tek computes standings separately — so result.points is 0 here and
 * must be derived by a consumer from place + league scoring rules.
 *
 * Offsets for D1/E1/E2/F3 were verified empirically against a real GG-at-WW file,
 * and independently confirmed against the community layout reference at
 * https://github.com/ajoe2/tunas (docs/formats/hy3_format.md) — including the
 * detail that F2's result time starts one column later than E2's. Hy-Tek
 * publishes no spec, so that document is the closest thing to one; where it and
 * a real file disagree, the file wins.
 */

import { HY3_STROKE, STROKE, COURSE, ageGroup } from './constants.js';
import { timeFromSeconds, normalizeDate } from './times.js';
import { displayTeamCode, deriveSwimmers, describeEvent, eventKey } from './model.js';

const slice = (line, a, b) => (line.length >= a ? line.slice(a, b).trim() : '');
const num = (s) => {
    const v = parseFloat(s);
    return Number.isNaN(v) || v <= 0 ? null : v;
};

// "Last, First M" — append the middle initial when present, matching how SDIF
// packs its D0 name field so the two formats produce identical display names.
const athleteName = (a) => {
    if (!a) return '';
    const base = a.first ? `${a.last}, ${a.first}` : a.last;
    return a.middle ? `${base} ${a.middle}` : base;
};

// Event-sex code (W/M/G/B/X) → canonical gender.
const EVENT_SEX = { M: 'M', B: 'M', W: 'F', G: 'F', F: 'F', X: 'X' };

/**
 * The event's course, from E2/F2 col 12. This is the AUTHORITATIVE source: E1's
 * two course bytes describe its seed times (converted and as-entered), not the
 * event, and a seed may well come from another course. An entry with no result
 * record states no course.
 */
const resultCourse = (e2) => (e2 ? COURSE[e2[11]] || null : null);

// E2/F2 status char → canonical ResultStatus.
const STATUS = { ' ': 'ok', '': 'ok', Q: 'dq', F: 'ns', R: 'scratch', D: 'dnf', S: 'exhibition' };

// On a RELAY, HY3 reuses the stroke letters differently: A = Freestyle relay,
// E = Medley relay (vs individual E = IM). Map relays explicitly.
const HY3_RELAY_STROKE = { A: STROKE.FREESTYLE, E: STROKE.MEDLEY };

/**
 * @param {string} content raw .hy3 text
 * @returns {import('./model.js').NormalizedMeet}
 */
export function parseHy3(content) {
    const lines = String(content).split(/\r?\n/);

    /** @type {import('./model.js').MeetInfo} */
    const meet = { name: '', rawName: '', startDate: null };
    const teamMap = new Map();
    const eventMap = new Map();
    /** @type {Map<string, {last:string,first:string,gender:string,birthDate:string|null,usasId:string|null}>} */
    const athletes = new Map();
    const source = {};

    let currentTeam = null;
    let currentAthlete = null; // athlete number
    let lastResult = null;     // most recent individual or relay result (for splits / DQ reason)
    let lastRelay = null;      // most recent relay (for F3 legs)

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const code = line.slice(0, 2);
        try {
            switch (code) {
                case 'A1':
                    source.software = slice(line, 44, 58) || undefined;
                    source.createdAt = normalizeDate(slice(line, 58, 66));
                    break;
                case 'B1':
                    meet.rawName = slice(line, 2, 47);
                    meet.name = meet.rawName;
                    meet.startDate = normalizeDate(slice(line, 92, 100));
                    break;
                case 'C1': {
                    const raw = slice(line, 2, 7);
                    currentTeam = raw;
                    if (!teamMap.has(raw)) {
                        teamMap.set(raw, { code: displayTeamCode(raw), fullCode: raw, name: slice(line, 7, 37) });
                    }
                    break;
                }
                case 'D1': {
                    const anum = slice(line, 3, 8);
                    currentAthlete = anum;
                    athletes.set(anum, {
                        last: slice(line, 8, 28),
                        first: slice(line, 28, 48),
                        preferred: slice(line, 48, 68) || undefined,
                        middle: slice(line, 68, 69) || undefined,
                        gender: slice(line, 2, 3),
                        birthDate: normalizeDate(slice(line, 88, 96)),
                        usasId: slice(line, 69, 83) || null,
                        team: currentTeam,
                    });
                    break;
                }
                case 'E1': {
                    const e2 = lines[i + 1] && lines[i + 1].slice(0, 2) === 'E2' ? lines[i + 1] : '';
                    lastResult = parseIndividual(line, e2, eventMap, athletes, currentAthlete, teamMap);
                    lastRelay = null;
                    break;
                }
                case 'F1': {
                    const f2 = lines[i + 1] && lines[i + 1].slice(0, 2) === 'F2' ? lines[i + 1] : '';
                    lastRelay = parseRelay(line, f2, eventMap, currentTeam, teamMap);
                    lastResult = lastRelay;
                    break;
                }
                case 'F3':
                    if (lastRelay) parseRelayLegs(line, lastRelay, athletes);
                    break;
                case 'H1':
                    if (lastResult && lastResult.disqualified) {
                        lastResult.dqCode = slice(line, 2, 4);
                        lastResult.dqReason = slice(line, 4, 52);
                    }
                    break;
            }
        } catch {
            /* skip malformed line */
        }
    }

    const events = [...eventMap.values()];
    for (const ev of events) ev.results.sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    const teams = [...teamMap.values()];

    // Enrich the derived registry with athlete-level gender/usasId from D1.
    const enrich = new Map();
    for (const a of athletes.values()) {
        const key = `${a.last}|${a.first}|${a.birthDate || ''}`.toLowerCase();
        enrich.set(key, {
            gender: a.gender === 'M' || a.gender === 'F' ? a.gender : undefined,
            usasId: a.usasId,
            preferredName: a.preferred,
        });
    }
    const swimmers = deriveSwimmers(events, enrich);

    // HY3's B1 record carries no course (name, venue, three dates, altitude —
    // that is all), so the meet's course is whatever its events agree on. Left
    // null if they disagree or none states one; SDIF reads it directly from B1
    // col 150, and the two must land on the same answer for the same meet.
    const courses = new Set(events.map((e) => e.course).filter(Boolean));
    meet.course = courses.size === 1 ? [...courses][0] : null;

    return { format: 'hy3', source, meet, teams, swimmers, events };
}

function parseIndividual(e1, e2, eventMap, athletes, anum, teamMap) {
    const eventNum = slice(e1, 38, 42);
    const ev = ensureEvent(eventMap, buildEvent(e1, 'individual', { sex: [14, 15], dist: [15, 21], stroke: [21, 22], ageLo: [22, 25], ageHi: [25, 28] }, resultCourse(e2)), eventNum);

    const a = athletes.get(anum) || { last: slice(e1, 8, 13), first: '', birthDate: null, team: null };
    const swimmerName = athleteName(a);
    const status = STATUS[e2 ? e2[12] : ' '] || 'ok';
    const seconds = e2 ? num(e2.slice(4, 11)) : null;
    const place = e2 ? parseInt(slice(e2, 30, 33), 10) : NaN;

    /** @type {import('./model.js').IndividualResult} */
    const result = {
        kind: 'individual',
        swimmerName,
        teamCode: teamMap.get(a.team)?.code || a.team || '',
        birthDate: a.birthDate,
        seedTime: timeFromSeconds(num(e1.slice(52, 59))),
        finalTime: timeFromSeconds(seconds), // retained even on DQ (HY3 keeps it)
        status,
        disqualified: status === 'dq',
        place: Number.isNaN(place) ? null : place || null,
        points: 0, // HY3 stores no points; deriving them is a consumer concern
    };
    ev.results.push(result);
    return result;
}

function parseRelay(f1, f2, eventMap, currentTeam, teamMap) {
    const eventNum = slice(f1, 38, 42);
    const ev = ensureEvent(eventMap, buildEvent(f1, 'relay', { sex: [14, 15], dist: [18, 21], stroke: [21, 22], ageLo: [22, 25], ageHi: [25, 28] }, resultCourse(f2)), eventNum);

    const status = STATUS[f2 ? f2[12] : ' '] || 'ok';
    const seconds = f2 ? num(f2.slice(5, 11)) : null;
    const place = f2 ? parseInt(slice(f2, 30, 33), 10) : NaN;

    /** @type {import('./model.js').RelayResult} */
    const relay = {
        kind: 'relay',
        teamCode: teamMap.get(currentTeam)?.code || currentTeam || slice(f1, 2, 6),
        relayLetter: slice(f1, 7, 8),
        seedTime: timeFromSeconds(num(f1.slice(52, 59))),
        finalTime: timeFromSeconds(seconds),
        status,
        disqualified: status === 'dq',
        place: Number.isNaN(place) ? null : place || null,
        points: 0,
        legs: [],
    };
    ev.results.push(relay);
    return relay;
}

function parseRelayLegs(f3, relay, athletes) {
    // Up to 8 slots of 13 chars starting at col 3 (index 2).
    for (let off = 2; off + 13 <= f3.length; off += 13) {
        const slot = f3.slice(off, off + 13);
        const anum = slot.slice(1, 6).trim();
        if (!anum) continue;
        const leg = parseInt(slot.slice(12, 13), 10);
        const a = athletes.get(anum);
        relay.legs.push({
            name: a ? athleteName(a) : slot.slice(6, 11).trim(),
            gender: a && (a.gender === 'M' || a.gender === 'F') ? a.gender : undefined,
            legOrder: Number.isNaN(leg) ? relay.legs.length + 1 : leg,
        });
    }
}

function buildEvent(line, type, off, course) {
    const gender = EVENT_SEX[line[off.sex[0]]] || 'X';
    const distance = parseInt(slice(line, off.dist[0], off.dist[1]), 10) || 0;
    const strokeCode = line[off.stroke[0]];
    const strokeMap = type === 'relay' ? HY3_RELAY_STROKE : HY3_STROKE;
    const stroke = strokeMap[strokeCode] || `Stroke ${strokeCode}`;
    // Min and max age are two right-justified 3-char columns (E1/F1 cols 23-25
    // and 26-28). They must be sliced positionally, NOT split on whitespace: an
    // open-ended band packs them adjacent with no separator ("15" + "109" reads
    // " 15109"), and a whitespace split then yields one token, which silently
    // degrades every "15 & Over" event to "Open". Only shows up in files whose
    // top band is open-ended, which is why a 15-18 league never sees it.
    const ag = ageGroup(slice(line, off.ageLo[0], off.ageLo[1]), slice(line, off.ageHi[0], off.ageHi[1]));
    const built = { type, gender, distance, stroke, course, ageGroup: ag };
    return { ...built, description: describeEvent(built), eventKey: eventKey(built), results: [] };
}

function ensureEvent(eventMap, built, rawNumber) {
    const numbered = rawNumber && rawNumber !== '0';
    const key = numbered ? rawNumber : `u:${built.description}`;
    let ev = eventMap.get(key);
    if (!ev) {
        ev = { number: numbered ? rawNumber : '', ...built };
        eventMap.set(key, ev);
    }
    return ev;
}
