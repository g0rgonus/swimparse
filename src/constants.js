/**
 * Shared vocabulary for meet-result parsing.
 *
 * Both the SDIF and HY3 adapters map their raw codes onto these canonical
 * values so that a NormalizedMeet looks identical regardless of source format.
 */

/** Canonical stroke names. */
export const STROKE = {
    FREESTYLE: 'Freestyle',
    BACKSTROKE: 'Backstroke',
    BREASTSTROKE: 'Breaststroke',
    BUTTERFLY: 'Butterfly',
    IM: 'IM',
    MEDLEY: 'Medley', // medley relay
};

/** SDIF numeric stroke codes → canonical stroke. */
export const SDIF_STROKE = {
    '1': STROKE.FREESTYLE,
    '2': STROKE.BACKSTROKE,
    '3': STROKE.BREASTSTROKE,
    '4': STROKE.BUTTERFLY,
    '5': STROKE.IM,
    '6': STROKE.FREESTYLE, // free relay
    '7': STROKE.MEDLEY,    // medley relay
};

/** HY3 letter stroke codes → canonical stroke. */
export const HY3_STROKE = {
    A: STROKE.FREESTYLE,
    B: STROKE.BACKSTROKE,
    C: STROKE.BREASTSTROKE,
    D: STROKE.BUTTERFLY,
    E: STROKE.IM,
    // F/G are diving events
};

/**
 * Canonical competition rounds. A meet run as timed finals records everything
 * as `final`; a prelims/finals meet records both, and a tie for a final berth
 * is settled by a `swimoff`.
 */
export const ROUND = { PRELIM: 'prelim', SWIMOFF: 'swimoff', FINAL: 'final' };

/** HY3 E2/F2 round code (col 3) → canonical round. */
export const HY3_ROUND = { P: ROUND.PRELIM, S: ROUND.SWIMOFF, F: ROUND.FINAL };

/** Raw single-char sex/gender code → canonical. */
export const GENDER = { M: 'M', F: 'F', X: 'X' };

/** Human display for a gender code, in event context. */
export const GENDER_DISPLAY = { M: 'Boys', F: 'Girls', X: 'Mixed' };

/** Course codes → canonical course. */
export const COURSE = { Y: 'SCY', L: 'LCM', S: 'SCM' };

/**
 * Result status. A swim that "counts" is `ok`; everything else is excluded
 * from scoring, but all of them are recorded — consumers filter.
 * @typedef {'ok'|'dq'|'ns'|'dnf'|'scratch'|'exhibition'} ResultStatus
 */

/**
 * Parses a 4-char SDIF/HY3-style age code into a labelled age group.
 * Examples: "0910" → 9-10, "UN10" → 10 & Under, "UNOV" → Open.
 *
 * @param {string} lowerStr - 2-char lower bound ("09", "UN", "15", ...)
 * @param {string} upperStr - 2-char upper bound ("10", "OV", "18", ...)
 * @returns {{ label: string, lower: number, upper: number }}
 */
export function ageGroup(lowerStr, upperStr) {
    const lo = (lowerStr || '').trim();
    const hi = (upperStr || '').trim();

    if ((lo === 'UN' || lo === '0' || lo === '') && (hi === 'OV' || hi === '109' || hi === '')) {
        return { label: 'Open', lower: 0, upper: 99 };
    }
    if (lo === 'UN' || lo === '0' || lo === '') {
        const upper = parseInt(hi, 10);
        return Number.isNaN(upper)
            ? { label: 'Open', lower: 0, upper: 99 }
            : { label: `${upper} & Under`, lower: 0, upper };
    }
    if (hi === 'OV' || hi === '109') {
        const lower = parseInt(lo, 10);
        return Number.isNaN(lower)
            ? { label: 'Open', lower: 0, upper: 99 }
            : { label: `${lower} & Over`, lower, upper: 99 };
    }
    const lower = parseInt(lo, 10);
    const upper = parseInt(hi, 10);
    if (Number.isNaN(lower) || Number.isNaN(upper)) {
        return { label: 'Open', lower: 0, upper: 99 };
    }
    return { label: lower === upper ? `${lower}` : `${lower}-${upper}`, lower, upper };
}
