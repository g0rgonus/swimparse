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
 * @property {string|null} [course]
 * @property {{label:string, lower:number, upper:number}} ageGroup
 * @property {string} description             Human label, e.g. "Boys 15-18 100m IM".
 * @property {(IndividualResult|RelayResult)[]} results
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
