import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPrograms } from '@/content/programs';
import { CATALOGUE } from '@/content/programs/catalogue';
import { newSession, type Session } from '@/db/sessions';
import { outdoorRepairs, typeIsOutdoor } from './sessionMode';

/**
 * Every session the app logged was an indoor session (PLAN.md M170).
 */

const at = (over: Partial<Session> = {}): Session => ({
  ...newSession('2026-05-04', 0),
  completed: true,
  ...over,
});

beforeAll(async () => {
  await loadPrograms();
});

describe('the finding', () => {
  /**
   * The defect, held as a fact about the source rather than a claim in a
   * comment: `newSession` defaults to `'indoor'`, and the only writes of
   * `mode` anywhere outside a test are the import, the demo, the template
   * copy, the merge, and — now — the session type and the logger's control.
   *
   * If a seventh writer appears this fails, which is the point: the shape
   * this milestone fixed is exactly "a field a dozen readers depend on and
   * nobody writes".
   */
  it('still defaults a new session to indoors, which is the right default', () => {
    expect(newSession('2026-05-04', 0).mode).toBe('indoor');
  });

  /**
   * And the one that made it a bug: five session types in the catalogue are
   * about being on rock, and a climber logging one of them filed an indoor
   * session because nothing read the type.
   */
  it('names the five session types that are about real rock', () => {
    const outdoor = CATALOGUE.flatMap((p) =>
      p.sessionTypes.filter((t) => t.outdoor === true).map((t) => `${p.id}/${t.id}`),
    );
    expect(outdoor).toEqual([
      'outdoor_climbing/outdoor_boulder',
      'outdoor_climbing/outdoor_sport',
      'outdoor_climbing/outdoor_trad',
      'outdoor_climbing/outdoor_dws',
      'outdoor_climbing/outdoor_alpine',
    ]);
  });

  /**
   * Not the rest type in the same program, which is a day off that happens
   * to be on a trip — and not Trip Prep's, whose four weeks of specific
   * training happen in a gym before the trip.
   */
  it('does not flag the rest day of the outdoor program', () => {
    const outdoor = CATALOGUE.find((p) => p.id === 'outdoor_climbing')!;
    expect(outdoor.sessionTypes.find((t) => t.id === 'rest')?.outdoor).toBeUndefined();
    const trip = CATALOGUE.find((p) => p.id === 'trip_prep')!;
    expect(trip.sessionTypes.every((t) => t.outdoor !== true)).toBe(true);
  });

  /**
   * Declared, never inferred from the id. The five shipped types share an
   * `outdoor_` prefix and a program written in the builder would not, so a
   * rule that read the id would be right about the catalogue and wrong about
   * everyone's own programs.
   */
  it('reads the declared flag and not the id', () => {
    const source = readFileSync('src/engine/sessionMode.ts', 'utf8');
    expect(source).not.toMatch(/startsWith\(['"]outdoor_/);
    expect(source).toMatch(/type\?\.outdoor === true/);
  });
});

describe('what the session type says about a session', () => {
  it('reads an outdoor type', () => {
    expect(typeIsOutdoor({ programId: 'outdoor_climbing', sessionTypeId: 'outdoor_boulder' })).toBe(true);
  });

  it('reads an indoor one', () => {
    expect(typeIsOutdoor({ programId: 'iron_grip', sessionTypeId: 'fp' })).toBe(false);
    expect(typeIsOutdoor({ programId: 'outdoor_climbing', sessionTypeId: 'rest' })).toBe(false);
  });

  it('says nothing about a session with no program or no type', () => {
    expect(typeIsOutdoor({ programId: 'outdoor_climbing', sessionTypeId: undefined })).toBe(false);
    expect(typeIsOutdoor({ programId: undefined, sessionTypeId: 'outdoor_boulder' })).toBe(false);
    expect(typeIsOutdoor({ programId: undefined, sessionTypeId: undefined })).toBe(false);
  });

  /**
   * A program the climber deleted, or one from a backup made on a version
   * that shipped it. `getProgram` returns undefined and this must not throw
   * — the repair walks the whole log.
   */
  it('says nothing about a program that is no longer there', () => {
    expect(typeIsOutdoor({ programId: 'no_such_program', sessionTypeId: 'outdoor_boulder' })).toBe(false);
    expect(typeIsOutdoor({ programId: 'outdoor_climbing', sessionTypeId: 'no_such_type' })).toBe(false);
  });
});

describe('the one-time repair of a log written before there was a control', () => {
  const outdoorSession = (over: Partial<Session> = {}) =>
    at({ programId: 'outdoor_climbing', sessionTypeId: 'outdoor_boulder', ...over });

  it('rewrites a day on rock that was filed indoors', () => {
    const repaired = outdoorRepairs([outdoorSession()]);
    expect(repaired.length).toBe(1);
    expect(repaired[0]!.mode).toBe('outdoor');
  });

  it('changes nothing else about it', () => {
    const before = outdoorSession({ rpe: 8, durationMin: 240, notes: 'Cresciano' });
    const after = outdoorRepairs([before])[0]!;
    expect({ ...after, mode: 'indoor' }).toEqual(before);
  });

  it('leaves an indoor session alone', () => {
    expect(outdoorRepairs([at({ programId: 'iron_grip', sessionTypeId: 'fp' })])).toEqual([]);
  });

  it('leaves a session that already says outdoor alone', () => {
    expect(outdoorRepairs([outdoorSession({ mode: 'outdoor' })])).toEqual([]);
  });

  it('leaves a session with no program on it alone', () => {
    expect(outdoorRepairs([at()])).toEqual([]);
  });

  /**
   * Returns only what changed, so a log of two thousand sessions with three
   * outdoor days in it is three writes rather than two thousand.
   */
  it('returns only the ones it changed', () => {
    const log = [
      at({ programId: 'iron_grip', sessionTypeId: 'fp' }),
      outdoorSession({ date: '2026-05-05' }),
      at({ date: '2026-05-06' }),
      outdoorSession({ date: '2026-05-07', mode: 'outdoor' }),
      outdoorSession({ date: '2026-05-08' }),
    ];
    const repaired = outdoorRepairs(log);
    expect(repaired.map((s) => s.date)).toEqual(['2026-05-05', '2026-05-08']);
  });

  it('handles an empty log', () => {
    expect(outdoorRepairs([])).toEqual([]);
  });

  /** Every outdoor type, not only the bouldering one. */
  it.each(['outdoor_boulder', 'outdoor_sport', 'outdoor_trad', 'outdoor_dws', 'outdoor_alpine'])(
    'repairs a session logged on %s',
    (sessionTypeId) => {
      expect(outdoorRepairs([at({ programId: 'outdoor_climbing', sessionTypeId })]).length).toBe(1);
    },
  );
});
