import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { code } from '@/test/source';

/**
 * An optional field on an options interface has a caller, or says why not
 * (PLAN.md M314).
 *
 * M307a's seventh finding named two: `deriveAltimeter`'s `paceWeeks`, whose
 * only two callers were tests and both passed the default, and
 * `replayRun`'s `untilTick`. A sweep found a third the audit had missed —
 * `icsCalendar`'s `sequence`, which nothing anywhere passed and which every
 * exported calendar therefore wrote as `SEQUENCE:0`, undoing the one thing
 * its own docblock promised.
 *
 * A parameter nobody passes is a claim about configurability that the code
 * does not make good on, and the reader cannot tell it from one that is
 * merely waiting for its second caller. So: passed somewhere in production,
 * or listed below with the reason.
 *
 * ## What this can and cannot see
 *
 * A field counts as passed if some other production file names it as an
 * object key — `field: value` or the shorthand `{ field }`. That is a
 * regex, not a type checker, and the first draft of it got both directions
 * wrong within a minute of each other: it missed `minutesPerSession`,
 * which `FinderPage` passes in shorthand, and it counted `stamp` because
 * the word appears in a sentence in `PreSession.tsx`. Comments come off
 * first now, which is the fifth time that has been the finding, and both
 * forms are matched.
 */

/** Passed by no production caller, on purpose, for the reason given. */
const NOT_PASSED_ON_PURPOSE: Record<string, string> = {
  'CalendarOptions.stamp':
    'injected by tests so DTSTAMP is not the clock; production has no reason to lie about the time',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('src/test/')) {
      out.push(path);
    }
  }
  return out;
}

/** `field: value`, or the shorthand `{ field }` / `, field,` in a literal. */
function passes(source: string, field: string): boolean {
  return (
    new RegExp(`\\b${field}\\s*:`).test(source) ||
    new RegExp(`[{,]\\s*${field}\\s*[,}]`).test(source)
  );
}

interface Field {
  path: string;
  iface: string;
  name: string;
}

function optionalFields(files: readonly { path: string; text: string }[]): Field[] {
  const out: Field[] = [];
  for (const { path, text } of files) {
    for (const block of text.matchAll(/(?:export )?interface (\w+(?:Options|Input)) \{(.*?)\n\}/gs)) {
      for (const field of block[2]!.matchAll(/^ {2}(\w+)\?:/gm)) {
        out.push({ path, iface: block[1]!, name: field[1]! });
      }
    }
  }
  return out;
}

describe('every option a caller could pass', () => {
  const FILES = sourceFiles('src').map((path) => ({
    path,
    text: code(readFileSync(path, 'utf8')),
  }));
  const FIELDS = optionalFields(FILES);

  it('finds the interfaces to check at all', () => {
    // The M309 floor: with nothing matched the sweep below asserts nothing
    // and reports a clean tree it never looked at.
    expect(FIELDS.length, 'the interface pattern stopped matching').toBeGreaterThan(100);
    expect(FIELDS.some((f) => f.name === 'today'), 'a field known to exist').toBe(true);
  });

  it('is passed by something, or says why it is not', () => {
    const orphans: string[] = [];
    for (const field of FIELDS) {
      const passed = FILES.some((f) => f.path !== field.path && passes(f.text, field.name));
      if (!passed) orphans.push(`${field.iface}.${field.name}`);
    }
    expect([...new Set(orphans)].sort()).toEqual(Object.keys(NOT_PASSED_ON_PURPOSE).sort());
  });

  it('keeps no reason for a field that has a caller again', () => {
    for (const key of Object.keys(NOT_PASSED_ON_PURPOSE)) {
      const [iface, name] = key.split('.');
      const field = FIELDS.find((f) => f.iface === iface && f.name === name);
      expect(field, `${key} is not a field any more`).toBeTruthy();
      expect(
        FILES.some((f) => f.path !== field!.path && passes(f.text, name!)),
        `${key} has a caller now, so its reason is stale`,
      ).toBe(false);
    }
  });
});
