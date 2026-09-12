import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { isRestSession } from './rest';

/**
 * M112e. The rule itself, and the guard that stops it being written out by
 * hand for a fourteenth time.
 */

const s = (patch: Partial<Session>) => patch as Session;
const CHECKLIST = { hydration: true, mobility: false, zone1: false, sleep: true };

describe('what counts as a rest day', () => {
  it('wants a checklist and no climbs', () => {
    expect(isRestSession(s({ restChecklist: CHECKLIST, climbs: [] }))).toBe(true);
  });

  it('is not a rest day without a checklist', () => {
    // An empty day nobody filled in is not a claim about recovery.
    expect(isRestSession(s({ climbs: [] }))).toBe(false);
  });

  it('is not a rest day if something was climbed', () => {
    // The climbs contradict the checklist, and the climbs are the harder
    // evidence.
    const climbs = [{ id: 'c', grade: 'V2', scale: 'V' as const, count: 1, result: 'send' as const }];
    expect(isRestSession(s({ restChecklist: CHECKLIST, climbs }))).toBe(false);
  });

  it('does not mind which boxes were ticked', () => {
    const none = { hydration: false, mobility: false, zone1: false, sleep: false };
    expect(isRestSession(s({ restChecklist: none, climbs: [] }))).toBe(true);
  });

  it('survives a record with no climbs array at all', () => {
    // `Session.climbs` is not optional, so this should be unreachable — and
    // is not. M105b found the spreadsheet writers crashing on real records
    // without one, from an older schema or an import. `exportCsv` was the
    // single copy of thirteen that defended itself; now every reader does.
    expect(isRestSession({ restChecklist: CHECKLIST } as unknown as Session)).toBe(true);
    expect(isRestSession({} as unknown as Session)).toBe(false);
  });
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe('there is one definition of it', () => {
  it('is not written out by hand anywhere else', () => {
    // There were thirteen: two exported under different names and eleven
    // inline. Nothing had drifted, and the point is that nothing can.
    const offenders = walk('src')
      .filter((p) => /\.tsx?$/.test(p) && p !== join('src', 'engine', 'rest.ts'))
      .filter((p) => !p.endsWith('rest.test.ts'))
      .filter((p) =>
        /restChecklist\s*!==\s*undefined\s*&&[^\n]*climbs[^\n]*length\s*===\s*0|climbs[^\n]*length\s*===\s*0\s*&&[^\n]*restChecklist\s*!==\s*undefined/.test(
          readFileSync(p, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('would notice one if it came back', () => {
    // Without this the guard above passes just as happily on a regex that
    // matches nothing.
    const both = /restChecklist\s*!==\s*undefined\s*&&[^\n]*climbs[^\n]*length\s*===\s*0/;
    expect(both.test('s.restChecklist !== undefined && s.climbs.length === 0')).toBe(true);
    expect(both.test('session.restChecklist !== undefined && listOf(session.climbs).length === 0')).toBe(true);
    expect(both.test('isRestSession(session)')).toBe(false);
  });
});
