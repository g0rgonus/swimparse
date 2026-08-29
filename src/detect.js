/**
 * Format detection. Prefers content sniffing over file extension, since both
 * formats are plain text and extensions are sometimes wrong.
 */

/**
 * `ev3` and `hyv` are meet SETUP files (events, no results) — parse those with
 * parseSetup(), not parse().
 *
 * @param {string} content
 * @param {string} [filename] optional, used only as a tie-breaker
 * @returns {'sdif-v3'|'hy3'|'ev3'|'hyv'|null}
 */
export function detectFormat(content, filename) {
    const firstLines = String(content).split(/\r?\n/, 5);
    for (const line of firstLines) {
        const code = line.slice(0, 2);
        // HY3 files open with an A1 file-description record.
        if (code === 'A1') return 'hy3';
        // SDIF v3 files open with an A0 file record (or at least carry B1).
        if (code === 'A0' || code === 'B1') return 'sdif-v3';
    }
    if (firstLines.some((l) => l.startsWith('B11') || l.startsWith('D0') || l.startsWith('D3'))) return 'sdif-v3';
    if (firstLines.some((l) => l.startsWith('D1') || l.startsWith('E1'))) return 'hy3';

    // Meet-setup exports are semicolon-delimited rather than fixed-width. The
    // ev3 flavour terminates every record with `*>`; the hyv flavour does not.
    // Checked after the record-code sniffs above so a fixed-width SDIF .ev3
    // still routes to the SDIF adapter.
    const delimited = firstLines.filter((l) => l.split(';').length >= 10);
    if (delimited.length >= 2) return delimited.some((l) => l.trimEnd().endsWith('*>')) ? 'ev3' : 'hyv';

    if (filename) {
        const ext = filename.toLowerCase().split('.').pop();
        if (ext === 'hy3') return 'hy3';
        if (ext === 'sd3' || ext === 'cl2' || ext === 'txt') return 'sdif-v3';
        if (ext === 'ev3') return 'ev3';
        if (ext === 'hyv') return 'hyv';
    }
    return null;
}
