/**
 * swimparse — public entry point.
 *
 * Parse SDIF v3 (.sd3) or Hy-Tek (.hy3) meet results into one NormalizedMeet.
 * Zero dependencies; runs in the browser, Node, and CI.
 *
 *   import { parse, detectFormat } from 'swimparse';
 *   const meet = parse(fileText, { filename: 'GG_at_WW.hy3' });
 *
 * SCOPE: this library reads meet-result files and emits JSON. That is all it
 * does. It has no concept of a league — no age bands, no scoring rules, no team
 * registry, no qualifying standards. Those are league policy and belong to the
 * application consuming this output.
 *
 * PRIVACY: the output is a lossless superset of the source file, so it CARRIES
 * SWIMMER BIRTHDATES (`swimmers[].birthDate`, individual `results[].birthDate`)
 * and USA-S registration ids. For youth meets that is PII for minors — treat
 * every parse result as confidential until your application has stripped or
 * aggregated it. swimparse deliberately does not do that for you: what counts as
 * safe is a league decision (a summer league publishes age-group labels; a
 * USA-Swimming tool needs exact ages), so it belongs to the consumer.
 */

import { parseSdif } from './sdif.js';
import { parseHy3 } from './hy3.js';
import { detectFormat } from './detect.js';

export { parseSdif } from './sdif.js';
export { parseHy3 } from './hy3.js';
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
    throw new Error('swimparse: could not detect meet-result format (expected SDIF .sd3 or Hy-Tek .hy3)');
}
