/**
 * SDIF v3 (.sd3) adapter → NormalizedMeet.
 *
 * Fixed-width text. Record types handled:
 *   B1 meet · B2 host · C1 team · D0 individual result · D3 swimmer reg
 *   E0 relay result · F0 relay swimmer
 *
 * Keeps EVERY individual/relay result (exhibition, DQ, no-show, non-placing)
 * — the lossless-superset rule.
 *
 * Layout references: the SDIF v3 spec at https://github.com/swim-admin/sdif, and
 * the annotated field tables at https://github.com/ajoe2/tunas
 * (docs/formats/cl2_format.md), which also record how real files depart from the
 * spec. Every D0/E0 offset below matches both.
 */

import { SDIF_STROKE, GENDER, COURSE, ROUND, ageGroup } from './constants.js';
import { timeFromText, normalizeDate } from './times.js';
import { displayTeamCode, deriveSwimmers, describeEvent, eventKey } from './model.js';

// Column offsets (0-indexed, [start, end)).
const OFF = {
    B1: { course: [149, 150] },
    // A D0 holds every round of one swimmer's event: a time slot per round,
    // each with its own course byte, and place/heat/lane for prelims and finals
    // separately. Reading only the finals slot dropped the other two swims.
    D0: {
        name: [11, 39], birth: [55, 63], seed: [88, 96], event: [72, 76], points: [138, 142],
        prelim: [97, 105], prelimCourse: [105, 106],
        swimoff: [106, 114], swimoffCourse: [114, 115],
        final: [115, 123], finalCourse: [123, 124],
        prelimHeat: [124, 126], prelimLane: [126, 128],
        finalHeat: [128, 130], finalLane: [130, 132],
        prelimPlace: [132, 135], place: [135, 138],
    },
    D0evt: { gender: [66, 67], dist: [67, 71], stroke: [71, 72], age: [76, 80] },
    E0: {
        letter: [11, 12], event: [26, 30], points: [95, 99],
        prelim: [54, 62], prelimCourse: [62, 63],
        swimoff: [63, 71], swimoffCourse: [71, 72],
        final: [72, 80], finalCourse: [80, 81],
        prelimHeat: [81, 83], prelimLane: [83, 85],
        finalHeat: [85, 87], finalLane: [87, 89],
        prelimPlace: [89, 92], place: [92, 95],
    },
    E0evt: { gender: [20, 21], dist: [21, 25], stroke: [25, 26], age: [30, 34] },
    F0: { name: [22, 50] },
};

const slice = (line, [a, b]) => (line.length >= a ? line.slice(a, b).trim() : '');

/**
 * @param {string} content raw .sd3 text
 * @returns {import('./model.js').NormalizedMeet}
 */
export function parseSdif(content) {
    const lines = String(content).split(/\r?\n/);

    /** @type {import('./model.js').MeetInfo} */
    const meet = { name: '', rawName: '', startDate: null };
    /** @type {Map<string, import('./model.js').Team>} */
    const teamMap = new Map();
    /** @type {Map<string, import('./model.js').Event>} */
    const eventMap = new Map();

    let currentTeam = null; // raw code
    let lastRelay = null;

    const source = {};

    for (const line of lines) {
        const code = line.slice(0, 2);
        try {
            switch (code) {
                case 'A0':
                    source.software = slice(line, [43, 63]) || undefined;
                    break;
                case 'B1':
                    meet.rawName = slice(line, [11, 41]);
                    meet.name = meet.rawName;
                    meet.startDate = normalizeDate(slice(line, [121, 129]));
                    // Col 150 is the meet's default course. Real files use the
                    // alpha form (Y/L/S) rather than the spec's numeric codes.
                    meet.course = COURSE[slice(line, OFF.B1.course)] || null;
                    lastRelay = null;
                    break;
                case 'B2':
                    if (!meet.hostName) meet.hostName = slice(line, [11, 41]);
                    break;
                case 'C1': {
                    const raw = slice(line, [11, 17]);
                    currentTeam = raw;
                    if (!teamMap.has(raw)) {
                        teamMap.set(raw, {
                            code: displayTeamCode(raw),
                            fullCode: raw,
                            name: slice(line, [17, 47]),
                        });
                    }
                    lastRelay = null;
                    break;
                }
                case 'D0':
                    lastRelay = null;
                    parseD0(line, eventMap, currentTeam, teamMap, meet.course);
                    break;
                case 'E0':
                    lastRelay = parseE0(line, eventMap, currentTeam, teamMap, meet.course);
                    break;
                case 'F0':
                    if (lastRelay) {
                        const name = slice(line, OFF.F0.name);
                        if (name) lastRelay.legs.push({ name, legOrder: lastRelay.legs.length + 1 });
                    }
                    break;
            }
        } catch {
            /* skip malformed line */
        }
    }

    const events = [...eventMap.values()];
    for (const ev of events) {
        ev.results.sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    }
    const teams = [...teamMap.values()];
    const swimmers = deriveSwimmers(events);

    return { format: 'sdif-v3', source, meet, teams, swimmers, events };
}

function statusFromText(raw) {
    const t = String(raw).trim().toUpperCase();
    if (t.startsWith('DQ')) return 'dq';
    if (t.startsWith('NS')) return 'ns';
    if (t.startsWith('DNF')) return 'dnf';
    if (t.startsWith('SCR')) return 'scratch';
    return 'ok';
}

/**
 * The rounds a D0/E0 record actually contains.
 *
 * One record holds a slot per round, and a slot is filled only if that round
 * was swum, so a timed-final meet yields one round and a prelims/finals meet
 * two or three. A slot carrying a sentinel ("DQ", "NS") counts as swum — the
 * round happened, it just has no time.
 *
 * An entry with every slot blank still yields a single `final` round: the
 * swimmer is in the file and dropping them would lose a row.
 *
 * @returns {{round: string, raw: string, place: number[], heat: number[], lane: number[], scores: boolean}[]}
 */
function roundsIn(line, off) {
    const slots = [
        { round: ROUND.PRELIM, raw: slice(line, off.prelim), place: off.prelimPlace, heat: off.prelimHeat, lane: off.prelimLane, scores: false },
        { round: ROUND.SWIMOFF, raw: slice(line, off.swimoff), place: null, heat: null, lane: null, scores: false },
        { round: ROUND.FINAL, raw: slice(line, off.final), place: off.place, heat: off.finalHeat, lane: off.finalLane, scores: true },
    ].filter((s) => s.raw !== '');
    return slots.length ? slots : [{ round: ROUND.FINAL, raw: '', place: off.place, heat: off.finalHeat, lane: off.finalLane, scores: true }];
}

const int = (line, off) => {
    if (!off) return undefined;
    const v = parseInt(slice(line, off), 10);
    return Number.isNaN(v) || v === 0 ? undefined : v;
};

function parseD0(line, eventMap, currentTeam, teamMap, defaultCourse) {
    if (!currentTeam) return;
    // Event number 0 = an unseeded/unofficial event (e.g. 8 & Under "B" relays).
    // Keep it (lossless), but bucket unnumbered events by description so two
    // distinct ones don't merge under a shared "0".
    const eventNum = slice(line, OFF.D0.event);
    const ev = ensureEvent(eventMap, buildEvent(line, 'individual', OFF.D0evt, timeCourse(line, OFF.D0.finalCourse, defaultCourse)), eventNum);

    const shared = {
        kind: /** @type {'individual'} */ ('individual'),
        swimmerName: slice(line, OFF.D0.name),
        teamCode: teamMap.get(currentTeam)?.code || currentTeam,
        birthDate: normalizeDate(slice(line, OFF.D0.birth)),
        seedTime: timeFromText(slice(line, OFF.D0.seed)),
    };

    for (const slot of roundsIn(line, OFF.D0)) {
        const status = statusFromText(slot.raw);
        const placeNum = slot.place ? parseInt(slice(line, slot.place), 10) : NaN;
        /** @type {import('./model.js').IndividualResult} */
        ev.results.push({
            ...shared,
            round: slot.round,
            finalTime: status === 'ok' ? timeFromText(slot.raw) : null,
            status,
            disqualified: status === 'dq',
            place: Number.isNaN(placeNum) ? null : placeNum || null,
            heat: int(line, slot.heat),
            lane: int(line, slot.lane),
            // Points are awarded on the final; SDIF stores them once per record.
            points: slot.scores ? parseFloat(slice(line, OFF.D0.points)) || 0 : 0,
        });
    }
}

function parseE0(line, eventMap, currentTeam, teamMap, defaultCourse) {
    if (!currentTeam) return null;
    const eventNum = slice(line, OFF.E0.event);
    const ev = ensureEvent(eventMap, buildEvent(line, 'relay', OFF.E0evt, timeCourse(line, OFF.E0.finalCourse, defaultCourse)), eventNum);

    let last = null;
    for (const slot of roundsIn(line, OFF.E0)) {
        const status = statusFromText(slot.raw);
        const placeNum = slot.place ? parseInt(slice(line, slot.place), 10) : NaN;
        /** @type {import('./model.js').RelayResult} */
        last = {
            kind: 'relay',
            round: slot.round,
            teamCode: teamMap.get(currentTeam)?.code || currentTeam,
            relayLetter: slice(line, OFF.E0.letter),
            seedTime: null,
            finalTime: status === 'ok' ? timeFromText(slot.raw) : null,
            status,
            disqualified: status === 'dq',
            place: Number.isNaN(placeNum) ? null : placeNum || null,
            heat: int(line, slot.heat),
            lane: int(line, slot.lane),
            points: slot.scores ? parseFloat(slice(line, OFF.E0.points)) || 0 : 0,
            legs: [],
        };
        ev.results.push(last);
    }
    // The F0 leg records that follow belong to the swim just read; when a relay
    // swam more than one round they describe the last of them.
    return last;
}

/**
 * The course an event was swum in: the code stated next to the finals time,
 * falling back to the meet's default (B1 col 150) when the record omits it.
 * That fallback is what "default course" means in the spec — not a guess.
 */
function timeCourse(line, off, defaultCourse) {
    return COURSE[slice(line, off)] || defaultCourse || null;
}

function buildEvent(line, type, off, course) {
    const gender = GENDER[slice(line, off.gender)] || 'X';
    const distance = parseInt(slice(line, off.dist), 10) || 0;
    const stroke = SDIF_STROKE[slice(line, off.stroke)] || `Stroke ${slice(line, off.stroke)}`;
    const ageCode = slice(line, off.age).padEnd(4);
    const ag = ageGroup(ageCode.slice(0, 2), ageCode.slice(2, 4));
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
