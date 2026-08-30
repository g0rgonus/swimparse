/**
 * swimparse — public entry point.
 *
 * Parse SDIF v3 (.sd3) or Hy-Tek (.hy3) meet results into one NormalizedMeet,
 * and Hy-Tek meet-setup files (.ev3/.hyv) into one NormalizedMeetSetup.
 * Zero dependencies; runs in the browser, Node, and CI.
 *
 *   import { parse, parseSetup, detectFormat } from 'swimparse';
 *   const meet  = parse(fileText, { filename: 'GG_at_WW.hy3' });
 *   const setup = parseSetup(eventsText, { filename: 'MeetEvents.ev3' });
 *
 * SCOPE: this library reads meet files and emits JSON. That is all it does. It
 * has no concept of a league — no age bands, no scoring rules, no team registry,
 * and no opinion about whether a given swimmer meets a cut. A setup file states
 * its own qualifying times and those are read like any other field, but applying
 * them is league policy and belongs to the application consuming this output.
 *
 * PRIVACY: a parsed RESULT file is a lossless superset of its source, so it CARRIES
 * SWIMMER BIRTHDATES (`swimmers[].birthDate`, individual `results[].birthDate`)
 * and USA-S registration ids. For youth meets that is PII for minors — treat
 * every parse result as confidential until your application has stripped or
 * aggregated it. swimparse deliberately does not do that for you: what counts as
 * safe is a league decision (a summer league publishes age-group labels; a
 * USA-Swimming tool needs exact ages), so it belongs to the consumer.
 *
 * Meet-SETUP files (.ev3/.hyv) are the exception: they describe a meet nobody has
 * entered yet, so a NormalizedMeetSetup contains no personal data at all.
 */

import { parseSdif } from './sdif.js';
import { parseHy3 } from './hy3.js';
import { parseEv3, parseHyv } from './setup.js';
import { detectFormat } from './detect.js';

export { parseSdif } from './sdif.js';
export { parseHy3 } from './hy3.js';
export { parseEv3, parseHyv, qualifyingStandards } from './setup.js';
export { detectFormat } from './detect.js';
export * from './model.js';
export * from './constants.js';
export * from './times.js';

/**
 * Parses meet-result text, auto-detecting the format unless one is given.
 *
 * @param {string} content
 * @param {Object} [opts]
 * @param {'sdif-v3'|'hy3'} [opts.format] force a format, skipping detection
 * @param {string} [opts.filename] used as a detection tie-breaker
 * @returns {import('./model.js').NormalizedMeet}
 */
export function parse(content, opts = {}) {
    const format = opts.format || detectFormat(content, opts.filename);
    if (format === 'sdif-v3') return parseSdif(content);
    if (format === 'hy3') return parseHy3(content);
    if (format === 'ev3' || format === 'hyv') {
        throw new Error(`swimparse: this is a Hy-Tek meet SETUP file (.${format}) — it holds events, not results. Use parseSetup().`);
    }
    throw new Error('swimparse: could not detect meet-result format (expected SDIF .sd3 or Hy-Tek .hy3)');
}

/**
 * Parses a Hy-Tek meet-setup file — the event list, sessions and qualifying
 * cuts a meet is built from, before anyone has entered it.
 *
 * @param {string} content
 * @param {Object} [opts]
 * @param {'ev3'|'hyv'} [opts.format] force a format, skipping detection
 * @param {string} [opts.filename] used as a detection tie-breaker
 * @param {'keep'|'null'} [opts.placeholders='keep'] `'null'` replaces the stand-ins
 *        a meet leaves behind — unset-date sentinels, and the times filling a
 *        course column it does not accept — with null. Off by default: a parse
 *        reports what the file states.
 * @returns {import('./model.js').NormalizedMeetSetup}
 */
export function parseSetup(content, opts = {}) {
    const format = opts.format || detectFormat(content, opts.filename);
    if (format === 'ev3') return parseEv3(content, opts);
    if (format === 'hyv') return parseHyv(content, opts);
    if (format === 'sdif-v3' || format === 'hy3') {
        throw new Error(`swimparse: this is a meet RESULT file (${format}), not a setup file. Use parse().`);
    }
    throw new Error('swimparse: could not detect meet-setup format (expected Hy-Tek .ev3 or .hyv)');
}
