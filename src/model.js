/**
 * The NormalizedMeet contract.
 *
 * The single shape both adapters produce, so consumers read one JSON contract
 * instead of two fixed-width formats.
 *
 * Design rule: **lossless superset**. Capture every swim — placing or not,
 * exhibition, DQ, no-show — plus birthdates, seed times, splits and DQ reasons.
 * Consumers filter down to what they need. Never drop data at parse time.
 *
 * Everything here is read out of the file. Nothing is inferred, computed, or
 * relabelled according to any league's rules: no age banding, no scoring, no
 * team-code canonicalization, no synthesized meet names. Those are consumer
 * concerns.
 *
 * PRIVACY: `swimmers[].birthDate` and `usasId` are PII for minors, and the
 * lossless rule means they are always populated when the file carries them. A
 * NormalizedMeet is therefore a confidential artifact by default. Stripping or
 * aggregating it is the consumer's job — see the privacy note in index.js.
 */

/**
 * @typedef {import('./times.js').SwimTime} SwimTime
 */

import { GENDER_DISPLAY } from './constants.js';

/**
 * @typedef {Object} NormalizedMeet
 * @property {'sdif-v3'|'hy3'} format         Source format the file was parsed from.
 * @property {Object} source                  Producing software (A0/A1 record).
 * @property {string} [source.software]
 * @property {string} [source.version]
 * @property {string} [source.createdAt]      ISO date if available.
 * @property {MeetInfo} meet
 * @property {Team[]} teams
 * @property {Swimmer[]} swimmers             Deduped registry (name + birthdate).
 * @property {Event[]} events
 */

/**
 * @typedef {Object} MeetInfo
 * @property {string} name                    Meet name as it appeared in the file.
 * @property {string} rawName                 Identical to `name`; kept so consumers
 *                                            that relabel a meet have an untouched
 *                                            original to fall back on.
 * @property {string} [hostName]
 * @property {string|null} startDate          ISO "YYYY-MM-DD".
 * @property {string|null} [endDate]
 * @property {string|null} [course]           'SCY' | 'LCM' | 'SCM'.
 */

/**
 * @typedef {Object} Team
 * @property {string} code                    Display code, VA-prefix stripped (e.g. "WW").
 * @property {string} fullCode                Raw code as in the file (e.g. "VAWW").
 * @property {string} name
 * @property {string} [shortName]
 */

/**
 * @typedef {Object} Swimmer
 * @property {string} id                      Stable within-file id.
 * @property {string} teamCode
 * @property {string} lastName
 * @property {string} firstName
 * @property {string} [preferredName]
 * @property {string} [middleInitial]
 * @property {string} fullName                "Last, First".
 * @property {'M'|'F'} [gender]
 * @property {string|null} [birthDate]        ISO, or null. PII — as read from the file.
 * @property {string|null} [usasId]           PII — as read from the file.
 * @property {number|null} [age]              Age as stated in the file, when present.
 */

/**
 * @typedef {Object} Event
 * @property {string} number                  Event number as a string (may be alphanumeric).
 * @property {'individual'|'relay'} type
 * @property {'M'|'F'|'X'} gender
 * @property {number} distance
 * @property {string} stroke                  Canonical stroke name.
 * @property {string|null} course             'SCY' | 'LCM' | 'SCM'. SDIF states it per
 *                                            time and defaults from B1; HY3 states it in
 *                                            E2, the authoritative source.
 * @property {{label:string, lower:number, upper:number}} ageGroup
 * @property {string} description             DISPLAY ONLY, e.g. "Boys 15-18 100y IM".
 *                                            Join on `eventKey`, never on this.
 * @property {string} eventKey                Stable identity — see eventKey().
 * @property {(IndividualResult|RelayResult)[]} results
 */

/**
 * The NormalizedMeetSetup contract — what a meet-SETUP file (.ev3/.hyv) holds.
 *
 * A setup file is the meet before it has entrants: the event list, the session
 * schedule, the entry fees, and the qualifying cuts. There are no swimmers and
 * no results in it, so it is a different shape from NormalizedMeet rather than
 * an empty one — `events[]` here are event *definitions*, not event results.
 *
 * It carries no personal data at all, which makes it the one swimparse output
 * that is safe to publish as-is.
 *
 * @typedef {Object} NormalizedMeetSetup
 * @property {'ev3'|'hyv'} format
 * @property {Object} source                  Producing software (header record).
 * @property {string} [source.software]
 * @property {string} [source.version]
 * @property {string|null} [source.createdAt] ISO date the file was exported.
 * @property {SetupMeetInfo} meet
 * @property {SetupSession[]} sessions        Empty for hyv, which has no sessions.
 * @property {SetupEvent[]} events
 */

/**
 * @typedef {Object} SetupMeetInfo
 * @property {string} name
 * @property {string} rawName
 * @property {string} [hostName]              Host or facility as printed.
 * @property {string|null} startDate          ISO "YYYY-MM-DD".
 * @property {string|null} endDate
 * @property {string|null} [ageUpDate]        The date ages are computed as of.
 * @property {string|null} [course]           'SCY' | 'LCM' | 'SCM'.
 * @property {string} [sanction]              LSC sanction number (ev3 only).
 * @property {string|null} [entryDeadline]    ISO (ev3 only).
 * @property {string|null} [qualifyingSince]  Start of the period a cut may be
 *                                            swum in — INFERRED from the files,
 *                                            not from a spec (ev3 only).
 * @property {Object} [location]              Address fields (ev3 only).
 */

/**
 * @typedef {Object} SetupSession
 * @property {string} id                      As numbered in the file — may be
 *                                            alphanumeric ("1", "2G").
 * @property {number|null} day                1-based day of the meet.
 * @property {string|null} startTime          24-hour "HH:MM".
 * @property {number} eventCount
 */

/**
 * @typedef {Object} SetupEvent
 * @property {string} number                  As printed, letter and all ("1A").
 * @property {'individual'|'relay'} type
 * @property {'finals'|'prelims'|null} round  'prelims' = prelims feeding a final.
 * @property {number|null} rounds             1 = timed finals, 2 = prelims+finals
 *                                            (ev3 only).
 * @property {'M'|'F'|'X'} gender
 * @property {number|null} distance
 * @property {string} stroke                  Canonical stroke name.
 * @property {string|null} course             'SCY' | 'LCM' | 'SCM'. The event's own
 *                                            course where the file states one (ev3
 *                                            col 25), else the meet's.
 * @property {{label:string, lower:number, upper:number}} ageGroup
 * @property {string} description             DISPLAY ONLY, same form the result
 *                                            adapters produce. Join on `eventKey`.
 * @property {string} eventKey                Stable identity — see eventKey().
 * @property {number|null} relayLegs          Legs per relay (ev3 only).
 * @property {number|null} entryFee           As stored, in the meet's currency.
 * @property {{LCM: SwimTime|null, SCM: SwimTime|null, SCY: SwimTime|null}} qualifyingTimes
 *                                            The event's cut in each course — the
 *                                            same standard, stated three ways. All
 *                                            null when the meet sets no cuts. Kept
 *                                            verbatim, including the placeholder a
 *                                            meet may fill an unaccepted course
 *                                            with; qualifyingStandards() drops
 *                                            those.
 * @property {{id:string, day:number|null, order:number|null, startTime:string|null}|null} session
 */

/**
 * @typedef {Object} QualifyingStandard
 * @property {string} eventNumber
 * @property {string} eventKey                What to join a cut to a swim on.
 * @property {string} description             Display only.
 * @property {'M'|'F'|'X'} gender
 * @property {{label:string, lower:number, upper:number}} ageGroup
 * @property {number|null} distance
 * @property {string} stroke
 * @property {SwimTime|null} LCM
 * @property {SwimTime|null} SCM
 * @property {SwimTime|null} SCY
 */

/**
 * @typedef {Object} IndividualResult
 * @property {'individual'} kind
 * @property {string} [swimmerId]             Links to Swimmer.id when resolvable.
 * @property {string} swimmerName             "Last, First" as in the file.
 * @property {string} teamCode
 * @property {string|null} [birthDate]        ISO. PII — as read from the file.
 * @property {SwimTime|null} seedTime
 * @property {SwimTime|null} finalTime        The time swum. NOTE: for HY3 this is
 *                                            retained even on a DQ; for SDIF it is
 *                                            null on DQ/NS (the format nulls it).
 * @property {import('./constants.js').ResultStatus} status
 * @property {boolean} disqualified
 * @property {string} [dqCode]                HY3 only.
 * @property {string} [dqReason]              HY3 H1/H2 only.
 * @property {number|null} place              null = non-scoring / exhibition.
 * @property {number} [heat]
 * @property {number} [lane]
 * @property {number} points                  Points as stored in the file (SDIF).
 *                                            HY3 carries none, so it reads 0 —
 *                                            deriving points is a scoring concern
 *                                            and belongs to the consumer.
 * @property {number[]} [splits]              Cumulative split seconds (HY3 G1).
 */

/**
 * @typedef {Object} RelayResult
 * @property {'relay'} kind
 * @property {string} teamCode
 * @property {string} relayLetter             'A', 'B', ...
 * @property {SwimTime|null} seedTime
 * @property {SwimTime|null} finalTime
 * @property {import('./constants.js').ResultStatus} status
 * @property {boolean} disqualified
 * @property {string} [dqCode]
 * @property {string} [dqReason]
 * @property {number|null} place
 * @property {number} [heat]
 * @property {number} [lane]
 * @property {number} points
 * @property {RelayLeg[]} legs
 * @property {number[]} [splits]
 */

/**
 * @typedef {Object} RelayLeg
 * @property {string} [swimmerId]
 * @property {string} name
 * @property {'M'|'F'} [gender]
 * @property {number} [age]
 * @property {number} legOrder                1-4 (or higher for alternates).
 */

/**
 * The display unit for a course. SCY is swum in yards; everything else in
 * metres. An unknown course prints no unit rather than guessing one.
 */
const COURSE_UNIT = { SCY: 'y', LCM: 'm', SCM: 'm' };

/**
 * Builds an event's human label.
 *
 * DISPLAY ONLY. Do not parse it and do not join on it — the wording is free to
 * change. `eventKey()` is the stable identity; see docs/qualifying-cuts.md.
 *
 * `course` decides the distance unit, so it should be the event's own course
 * where the file states one, falling back to the meet's. Before 0.3.0 this said
 * "m" unconditionally, which mislabelled every yards event.
 *
 * @param {{type:string, gender:string, distance:number, stroke:string,
 *          ageGroup:{label:string}, course?:string|null}} ev
 * @returns {string}
 */
export function describeEvent(ev) {
    const agLabel = ev.type === 'relay' && ev.ageGroup.label === 'Open' ? '' : ev.ageGroup.label;
    const unit = COURSE_UNIT[ev.course] || '';
    return `${GENDER_DISPLAY[ev.gender]} ${agLabel} ${ev.distance}${unit} ${ev.stroke}${ev.type === 'relay' ? ' Relay' : ''}`
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * A stable identity for an event, for joining across files.
 *
 * This is what to match on when tying a result to its qualifying cut, or one
 * meet's events to another's: it is built from what an event *is* — type,
 * gender, age range, distance, stroke, course — and never from wording or event
 * numbering, both of which drift between a setup file and its results.
 *
 * `individual:F:13-14:50:Freestyle:SCY`
 *
 * Course is part of the identity because a 50-yard race is not a 50-metre race;
 * an unknown course reads `?`, which will not match a known one. Exported so a
 * consumer can build the same key from its own records.
 *
 * @param {{type:string, gender:string, distance:number, stroke:string,
 *          ageGroup:{lower:number, upper:number}, course?:string|null}} ev
 * @returns {string}
 */
export function eventKey(ev) {
    return [
        ev.type,
        ev.gender,
        `${ev.ageGroup.lower}-${ev.ageGroup.upper}`,
        ev.distance,
        ev.stroke,
        ev.course || '?',
    ].join(':');
}

/**
 * Strips a two-letter LSC/state prefix (e.g. "VAWW" → "WW") from a raw team code.
 *
 * This is an SDIF/HY3 file convention, not a league rule: US meet files prefix
 * team codes with the LSC. `Team.fullCode` always keeps the raw value, so a
 * consumer that wants the prefix back has it. Mapping either form onto a
 * league's canonical code is the consumer's job.
 *
 * @param {string} rawCode
 * @returns {string}
 */
export function displayTeamCode(rawCode) {
    const c = (rawCode || '').trim();
    return c.startsWith('VA') ? c.slice(2) : c;
}

/**
 * Builds the deduped swimmer registry from individual results.
 *
 * Keyed on `lastName|firstName|birthDate`, the strongest identity the file
 * itself supports (middle name is excluded because it drifts between exports).
 * This is a **within-file** key only — durable cross-meet or cross-season
 * athlete identity is a consumer concern and cannot be decided here.
 *
 * @param {Event[]} events
 * @param {Map<string, Partial<Swimmer>>} [enrich] optional id→extra fields (D3/D1 data)
 * @returns {Swimmer[]}
 */
export function deriveSwimmers(events, enrich) {
    /** @type {Map<string, Swimmer>} */
    const byKey = new Map();
    for (const ev of events) {
        if (ev.type !== 'individual') continue;
        const gender = ev.gender === 'X' ? undefined : ev.gender;
        for (const r of ev.results) {
            const [last, first] = splitName(r.swimmerName);
            const key = `${last}|${first}|${r.birthDate || ''}`.toLowerCase();
            if (!byKey.has(key)) {
                byKey.set(key, {
                    id: key,
                    teamCode: r.teamCode,
                    lastName: last,
                    firstName: first,
                    fullName: r.swimmerName,
                    gender,
                    birthDate: r.birthDate || null,
                    usasId: null,
                });
            }
            r.swimmerId = key;
        }
    }
    if (enrich) {
        for (const s of byKey.values()) {
            const extra = enrich.get(s.id);
            if (extra) Object.assign(s, extra);
        }
    }
    return [...byKey.values()];
}

/**
 * Splits "Last, First M" into ["Last", "First"] (middle dropped).
 * @param {string} name
 * @returns {[string, string]}
 */
export function splitName(name) {
    const parts = String(name || '').split(',');
    const last = (parts[0] || '').trim();
    const first = (parts[1] || '').trim().split(/\s+/)[0] || '';
    return [last, first];
}
