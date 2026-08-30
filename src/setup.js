/**
 * Hy-Tek meet-SETUP adapter (.ev3 / .hyv) → NormalizedMeetSetup.
 *
 * A setup file is the meet's event list before anyone has entered it: no
 * swimmers, no entries, no results. Meet Manager exports the pair together in
 * one zip — `.ev3` (the richer one: sessions, day, event order, start times)
 * and `.hyv` (the Team Manager import file: the same events, fewer columns).
 *
 * Neither is fixed-width. Both are **semicolon-delimited**, CP-1252, CRLF: one
 * header record, then one record per event. `.ev3` records carry a trailing
 * `*>` terminator, and its header carries a trailing checksum.
 *
 *   ev3  1;1A;F;1;I;G;0;8;400;E;0;;;N;12;;;;;;;1;1;1;05:00PM;Y;5;4;1;0*>
 *   hyv  1A;F;F;I;0;8;400;5;;;;12;;;;;;
 *
 * NOTE ON THE NAME `.ev3`: SDIF also defines a meet-events file with that
 * extension, fixed-width like `.sd3`. That is a different format; detect.js
 * sniffs content, so a fixed-width `.ev3` still routes to the SDIF adapter.
 *
 * Unlike the result formats, these two have no published reference at all — not
 * even a community one — so everything below is derived from real files, and the
 * derivation notes stay in this header on purpose.
 *
 * The three qualifying-time columns are the SAME cut in the three courses,
 * verified column-for-column against Virginia Swimming's published 2025-2028
 * Age Group Championship QT table (LCM / SCM / SCY), whose rows the fixture
 * meets reproduce exactly. The two files order those columns differently:
 *
 *   ev3  col 16 = LCM, col 18 = SCM, col 20 = SCY — FIXED, whatever the meet's
 *        own course. Confirmed against an SCY meet and an LCM meet.
 *   hyv  cols 9, 13, 15 — ROTATED to start at the meet's own course, then
 *        cycling Y → L → S. An SCY meet reads (SCY, LCM, SCM); an LCM meet
 *        reads (LCM, SCM, SCY). Both confirmed; the SCM rotation (SCM, SCY,
 *        LCM) follows the same cycle but has not been seen in a real file.
 *
 * A course column a meet does not accept can be BLANKET-FILLED with a
 * placeholder rather than left empty: the Eastern Zone fixture carries 0.01 or
 * 1.00 in its SCM column on all 108 events, relays included. Those are stated
 * times, so `qualifyingTimes` keeps them verbatim — dropping file data is not
 * this layer's call — but `qualifyingStandards()` filters them, since a table
 * of cuts is useless with them in. See that function.
 *
 * Each qualifying time is preceded by an always-empty column (ev3 15/17/19,
 * hyv 8/12/14/16), almost certainly the matching "no faster than" limit that
 * Meet Manager pairs with every cut. Empty in every sample, so its meaning is
 * unconfirmed and it is not emitted.
 *
 * Columns deliberately left unread because the samples could not pin them down:
 * ev3 10, 11, 12, 13 (constant), and the per-session trio 26/27/28.
 */

import { HY3_STROKE, SDIF_STROKE, STROKE, COURSE, ageGroup } from './constants.js';
import { timeFromText, normalizeDate } from './times.js';
import { describeEvent, eventKey } from './model.js';

/** Event-sex code → canonical gender. ev3 uses G/B, hyv uses F/M. */
const EVENT_SEX = { G: 'F', B: 'M', F: 'F', M: 'M', X: 'X' };

/** Round code → canonical round. 'P' means prelims feeding a final. */
const ROUND = { F: 'finals', P: 'prelims' };

/** A relay's stroke code means the relay stroke, not the individual one. */
const RELAY_STROKE_EV3 = { A: STROKE.FREESTYLE, E: STROKE.MEDLEY };
const RELAY_STROKE_HYV = { 1: STROKE.FREESTYLE, 5: STROKE.MEDLEY };

const clean = (s) => (s == null ? '' : String(s).trim());

/** "MM/DD/YYYY" → ISO "YYYY-MM-DD". */
const isoDate = (raw) => normalizeDate(clean(raw).replace(/\//g, ''));

/** "05:00PM" → "17:00". Returns null for anything else. */
function clockTime(raw) {
    const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(clean(raw));
    if (!m) return null;
    let hour = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === 'P') hour += 12;
    return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

const int = (raw) => {
    const v = parseInt(clean(raw), 10);
    return Number.isNaN(v) ? null : v;
};

const num = (raw) => {
    const v = parseFloat(clean(raw));
    return Number.isNaN(v) ? null : v;
};

/** Meet Manager writes an unset date as the Unix epoch. */
const EPOCH_SENTINEL = /^01\/01\/1970$/;

/**
 * Below this, a "qualifying time" is a placeholder for a course the meet does
 * not accept, not a standard: no swim of any distance is a second long, and the
 * Eastern Zone fixture blanket-fills its SCM column with 0.01/1.00 on nearly
 * every event, relays included.
 */
const PLACEHOLDER_CUT_SECONDS = 1;

/** Splits a record, dropping the ev3 `*>` terminator from the last field. */
const fields = (line) => line.replace(/\*>\s*$/, '').split(';');

const records = (content) =>
    String(content)
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
        .map(fields);

/**
 * Builds the shared event shape from already-decoded parts.
 *
 * `description` and `eventKey` come from the same helpers the result adapters
 * use, so an event read from a setup file and the same event read from that
 * meet's results are identical in both — which is what makes a cut joinable to
 * a swim.
 *
 * `course` is the event's own where the file states one (ev3 col 25) and the
 * meet's otherwise: the hyv states no per-event course, and without the
 * fallback its events would key and label differently from the ev3's.
 */
function buildEvent({ number, type, round, rounds, gender, distance, stroke, course, lower, upper, entryFee, qualifyingTimes, relayLegs, session }) {
    const ag = ageGroup(lower, upper);
    const built = { type, gender, distance, stroke, course, ageGroup: ag };
    return {
        number,
        type,
        round,
        rounds,
        gender,
        distance,
        stroke,
        course,
        ageGroup: ag,
        description: describeEvent(built),
        eventKey: eventKey(built),
        relayLegs,
        entryFee,
        qualifyingTimes,
        session,
    };
}

/** { LCM, SCM, SCY } from three raw time strings, any of which may be blank. */
const qualTimes = (lcm, scm, scy) => ({
    LCM: timeFromText(lcm),
    SCM: timeFromText(scm),
    SCY: timeFromText(scy),
});

/** The cycle the hyv rotates its qualifying-time columns through. */
const COURSE_CYCLE = ['Y', 'L', 'S'];

/**
 * Reads the hyv's three qualifying-time columns, which start at the meet's own
 * course and cycle from there — see the header note.
 * @param {string} courseCode single-char meet course from the hyv header
 * @param {string[]} f the record's fields
 */
function hyvQualTimes(courseCode, f) {
    const start = Math.max(0, COURSE_CYCLE.indexOf(courseCode));
    const times = { LCM: null, SCM: null, SCY: null };
    [9, 13, 15].forEach((col, i) => {
        times[COURSE[COURSE_CYCLE[(start + i) % COURSE_CYCLE.length]]] = timeFromText(f[col]);
    });
    return times;
}

/** Collapses the per-event session stamps into the meet's session list. */
function deriveSessions(events) {
    const byId = new Map();
    for (const ev of events) {
        const s = ev.session;
        if (!s) continue;
        if (!byId.has(s.id)) byId.set(s.id, { id: s.id, day: s.day, startTime: s.startTime, eventCount: 0 });
        byId.get(s.id).eventCount += 1;
    }
    return [...byId.values()];
}

/**
 * Flattens a setup's qualifying cuts into one row per event that has one.
 *
 * The cuts are already on `setup.events[].qualifyingTimes`; this is the shape
 * you want when the cuts *are* the thing you came for — a standards table to
 * publish, diff against last season's, or check entries against. Events with no
 * cut configured (the relays, in most meets) are left out.
 *
 * THE ONE PLACE THIS LAYER JUDGES THE DATA: a placeholder time in a course the
 * meet does not accept is dropped here (see PLACEHOLDER_CUT_SECONDS), and a row
 * left with nothing real goes with it. `event.qualifyingTimes` still carries
 * every value the file stated — read that instead if you want the file verbatim.
 *
 * Beyond that, reading the file is all that happens: no conversion between
 * courses, no "does this swimmer qualify" — that is the consumer's call.
 *
 * @param {NormalizedMeetSetup} setup
 * @returns {QualifyingStandard[]}
 */
export function qualifyingStandards(setup) {
    const real = (t) => (t && t.seconds > PLACEHOLDER_CUT_SECONDS ? t : null);
    return (setup.events || [])
        .map((ev) => ({
            eventNumber: ev.number,
            eventKey: ev.eventKey,
            description: ev.description,
            gender: ev.gender,
            ageGroup: ev.ageGroup,
            distance: ev.distance,
            stroke: ev.stroke,
            LCM: real(ev.qualifyingTimes && ev.qualifyingTimes.LCM),
            SCM: real(ev.qualifyingTimes && ev.qualifyingTimes.SCM),
            SCY: real(ev.qualifyingTimes && ev.qualifyingTimes.SCY),
        }))
        .filter((row) => row.LCM || row.SCM || row.SCY);
}

/**
 * Parses a Meet Manager `.ev3` meet-events export.
 * @param {string} content
 * @returns {import('./model.js').NormalizedMeetSetup}
 */
export function parseEv3(content) {
    const [head, ...rows] = records(content);
    if (!head) throw new Error('swimparse: empty .ev3 file');

    const name = clean(head[0]);
    const meet = {
        name,
        rawName: name,
        hostName: clean(head[1]) || undefined,
        startDate: isoDate(head[2]),
        endDate: isoDate(head[3]),
        ageUpDate: isoDate(head[4]),
        course: COURSE[clean(head[5]).charAt(0)] || null,
        sanction: clean(head[14]) || undefined,
        entryDeadline: isoDate(head[23]),
        // INFERRED, not confirmed against a spec: header field 16 reads
        // 11/01/2024 in both Virginia championships (whose standards are the
        // published 2025-2028 set), 08/06/2025 in the Eastern Zone meet (just
        // after the 2025 zone championships), and the epoch sentinel in the one
        // meet that sets no cuts at all. That is what a qualifying-period start
        // looks like. Treated as unset when it reads as the epoch.
        qualifyingSince: EPOCH_SENTINEL.test(clean(head[16])) ? null : isoDate(head[16]),
        location: {
            address: clean(head[24]) || undefined,
            city: clean(head[26]) || undefined,
            state: clean(head[27]) || undefined,
            postalCode: clean(head[28]) || undefined,
            country: clean(head[29]) || undefined,
            lsc: clean(head[30]) || undefined,
        },
    };

    const events = rows.map((f) => {
        const type = clean(f[4]) === 'R' ? 'relay' : 'individual';
        const strokeCode = clean(f[9]);
        const stroke = (type === 'relay' && RELAY_STROKE_EV3[strokeCode]) || HY3_STROKE[strokeCode] || `Stroke ${strokeCode}`;
        return buildEvent({
            number: clean(f[1]) || clean(f[0]),
            type,
            round: ROUND[clean(f[2])] || null,
            rounds: int(f[3]),
            gender: EVENT_SEX[clean(f[5])] || 'X',
            distance: int(f[8]),
            stroke,
            lower: clean(f[6]),
            upper: clean(f[7]),
            course: COURSE[clean(f[25])] || null,
            entryFee: num(f[14]),
            qualifyingTimes: qualTimes(f[16], f[18], f[20]),
            relayLegs: type === 'relay' ? int(f[29]) : null,
            session: {
                id: clean(f[21]),
                day: int(f[23]),
                order: int(f[22]),
                startTime: clockTime(f[24]),
            },
        });
    });

    return {
        format: 'ev3',
        source: {
            software: clean(head[9]) || undefined,
            version: clean(head[11]) || undefined,
            createdAt: isoDate(head[12]),
        },
        meet,
        sessions: deriveSessions(events),
        events,
    };
}

/**
 * Parses a Meet Manager `.hyv` meet-events export (the Team Manager import
 * file). Same events as the `.ev3`, without sessions, days or start times.
 * @param {string} content
 * @returns {import('./model.js').NormalizedMeetSetup}
 */
export function parseHyv(content) {
    const [head, ...rows] = records(content);
    if (!head) throw new Error('swimparse: empty .hyv file');

    const name = clean(head[0]);
    const courseCode = clean(head[4]).charAt(0);
    const meet = {
        name,
        rawName: name,
        hostName: clean(head[5]) || undefined,
        startDate: isoDate(head[1]),
        endDate: isoDate(head[2]),
        ageUpDate: isoDate(head[3]),
        course: COURSE[courseCode] || null,
    };

    const events = rows.map((f) => {
        const type = clean(f[3]) === 'R' ? 'relay' : 'individual';
        const strokeCode = clean(f[7]);
        const stroke = (type === 'relay' && RELAY_STROKE_HYV[strokeCode]) || SDIF_STROKE[strokeCode] || `Stroke ${strokeCode}`;
        // hyv writes an open-ended upper age as 0; ev3 writes 109.
        const upper = clean(f[5]) === '0' ? '109' : clean(f[5]);
        return buildEvent({
            number: clean(f[0]),
            type,
            round: ROUND[clean(f[1])] || null,
            rounds: null,
            gender: EVENT_SEX[clean(f[2])] || 'X',
            distance: int(f[6]),
            stroke,
            lower: clean(f[4]),
            upper,
            course: COURSE[courseCode] || null, // the hyv states no per-event course; use the meet's
            entryFee: num(f[11]),
            qualifyingTimes: hyvQualTimes(courseCode, f),
            relayLegs: null,
            session: null,
        });
    });

    return {
        format: 'hyv',
        source: {
            software: clean(head[7]) || undefined,
            version: clean(head[8]) || undefined,
            createdAt: null,
        },
        meet,
        sessions: [],
        events,
    };
}
