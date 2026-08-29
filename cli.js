#!/usr/bin/env node
/**
 * swimparse CLI — turn .sd3/.hy3 results, or .ev3/.hyv meet setups, into JSON.
 *
 *   swimparse meet.hy3                     # JSON to stdout
 *   swimparse meet.sd3 -o meet.json        # JSON to a file
 *   swimparse a.sd3 b.hy3 -d out/          # one <name>.json per input, into out/
 *   swimparse meet.hy3 --pretty            # 2-space indented
 *   swimparse events.ev3                   # NormalizedMeetSetup JSON
 *   swimparse events.ev3 --cuts            # just the qualifying-time table
 *
 * PRIVACY: the output contains swimmer birthdates and registration ids exactly
 * as the source file carries them. For a youth meet that is PII for minors —
 * do not publish it or commit it to a public repo without sanitizing first.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { parse, parseSetup, detectFormat, qualifyingStandards } from './src/index.js';

function main(argv) {
    const args = argv.slice(2);
    const inputs = [];
    let outFile = null;
    let outDir = null;
    let pretty = false;
    let cuts = false;

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-o' || a === '--out') outFile = args[++i];
        else if (a === '-d' || a === '--out-dir') outDir = args[++i];
        else if (a === '--pretty') pretty = true;
        else if (a === '--cuts') cuts = true;
        else if (a === '-h' || a === '--help') return help(0);
        else if (a.startsWith('-')) return fail(`unknown option: ${a}`);
        else inputs.push(a);
    }
    if (inputs.length === 0) return help(1);
    if (outFile && inputs.length > 1) return fail('-o takes a single input; use -d for multiple');

    const indent = pretty ? 2 : 0;
    if (outDir) mkdirSync(outDir, { recursive: true });

    for (const file of inputs) {
        const content = readFileSync(file, 'latin1');
        const format = detectFormat(content, file);
        const isSetup = format === 'ev3' || format === 'hyv';
        if (cuts && !isSetup) return fail(`--cuts needs a meet-setup file (.ev3/.hyv); ${file} is ${format || 'unrecognized'}`);

        const meet = isSetup ? parseSetup(content, { filename: file }) : parse(content, { filename: file });
        const json = JSON.stringify(cuts ? qualifyingStandards(meet) : meet, null, indent);
        const summary = `${meet.format}, ${meet.events.length} events`;
        if (outDir) {
            const name = basename(file, extname(file)) + '.json';
            writeFileSync(join(outDir, name), json);
            process.stderr.write(`wrote ${join(outDir, name)} (${summary})\n`);
        } else if (outFile) {
            writeFileSync(outFile, json);
            process.stderr.write(`wrote ${outFile} (${summary})\n`);
        } else {
            process.stdout.write(json + '\n');
        }
    }
    return 0;
}

function help(codeNum) {
    process.stdout.write(
        'Usage: swimparse <file...> [-o out.json | -d out-dir] [--pretty] [--cuts]\n' +
        '  Parses SDIF (.sd3) or Hy-Tek (.hy3) results into NormalizedMeet JSON, and\n' +
        '  Hy-Tek meet-setup files (.ev3/.hyv) into NormalizedMeetSetup JSON.\n' +
        '  -o, --out <path>      write a single input to this file\n' +
        '  -d, --out-dir <dir>   write one <name>.json per input into this directory\n' +
        '      --pretty          2-space indented JSON\n' +
        '      --cuts            setup files only: emit just the qualifying-time table\n' +
        '\n' +
        '  Result output carries swimmer birthdates as they appear in the file —\n' +
        '  sanitize before publishing. Setup files contain no personal data.\n' +
        '  Age banding, scoring, and team-code mapping are league policy and are\n' +
        '  not performed here.\n'
    );
    return codeNum;
}
function fail(msg) {
    process.stderr.write(`swimparse: ${msg}\n`);
    return 2;
}

// Set exitCode rather than process.exit(): process.exit() can terminate before
// a large stdout write drains to a pipe, truncating JSON at ~64KB (fine to a TTY
// or file, broken when a parent process captures stdout). Letting the event loop
// empty naturally flushes the write first.
process.exitCode = main(process.argv);
