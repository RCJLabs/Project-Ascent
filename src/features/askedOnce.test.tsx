// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { CATALOGUE } from '@/content/programs/catalogue';
import { FIELDS } from '@/content/fields';
import { validateProgram } from '@/content/validate';
import { resetDbForTests } from '@/db/db';
import { getSession, listSessions, newSession, putSession, type Session } from '@/db/sessions';
import { reset } from '@/test/render';

/**
 * A question the app already asks, asked once (PLAN.md M142).
 *
 * *Time on the wall* was a session field on three programs, sitting on the
 * same screen as the logger's own Duration input — two boxes for one
 * number, and only the second one reached load, the weekly review, the
 * career totals and the archive. *Project* and *Route* were the same story
 * in prose: a project is picked on the session and a climb carries its own
 * name.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

describe('the registry says where each retired question is asked instead', () => {
  it('retires exactly the three that duplicate something read', () => {
    const retired = Object.values(FIELDS)
      .filter((f) => f.retired !== undefined)
      .map((f) => f.id)
      .sort();
    expect(retired).toEqual(['projectName', 'routeName', 'sessionDuration']);
  });

  // Kept, not deleted: a stored answer is labelled through the registry, so
  // dropping the entry would turn "Time on the wall: 75" into
  // "sessionDuration: 75" in the climber's own spreadsheet.
  it('keeps the label a stored answer is read by', () => {
    expect(FIELDS.sessionDuration.label).toBe('Time on the wall');
    expect(FIELDS.projectName.label).toBe('Project');
    expect(FIELDS.routeName.label).toBe('Route');
  });

  it('says where each one is asked instead, in words a reader can act on', () => {
    for (const field of Object.values(FIELDS)) {
      if (field.retired === undefined) continue;
      expect(field.retired.length, `${field.id} says nothing`).toBeGreaterThan(20);
    }
  });
});

describe('no shipped program asks a retired question', () => {
  it('declares none of them, across the whole catalogue', () => {
    const asked: string[] = [];
    for (const program of CATALOGUE) {
      for (const type of program.sessionTypes) {
        for (const id of type.fields ?? []) {
          if (FIELDS[id]?.retired !== undefined) asked.push(`${program.id}/${type.id}: ${id}`);
        }
      }
    }
    expect(asked).toEqual([]);
  });

  // The rule, not the fact. The registry entries stay, so this is the only
  // thing stopping a program declaring one again.
  it('is a validation failure, not a convention', () => {
    const program = structuredClone(CATALOGUE.find((p) => p.id === 'trip_prep')!);
    const type = program.sessionTypes.find((t) => !t.isRest)!;
    type.fields = [...(type.fields ?? []), 'sessionDuration'];
    const issues = validateProgram(program);
    expect(issues.some((i) => /Time on the wall/.test(i))).toBe(true);
  });

  // Every session type, not the first one. A program declares fields per
  // type, and the one that asks twice is rarely the one at the top.
  it('catches it on the last session type as readily as the first', () => {
    const program = structuredClone(CATALOGUE.find((p) => p.id === 'trip_prep')!);
    const working = program.sessionTypes.filter((t) => !t.isRest);
    const last = working.at(-1)!;
    expect(last, 'the fixture needs more than one working type').not.toBe(working[0]);
    last.fields = [...(last.fields ?? []), 'routeName'];
    expect(validateProgram(program).some((i) => /Route/.test(i))).toBe(true);
  });

  // And every field of a type, not the first one it names.
  it('catches it behind a question that is fine', () => {
    const program = structuredClone(CATALOGUE.find((p) => p.id === 'trip_prep')!);
    const type = program.sessionTypes.find((t) => !t.isRest)!;
    type.fields = ['location', 'pumpLevel', 'projectName'];
    expect(validateProgram(program).some((i) => /Project/.test(i))).toBe(true);
  });

  it('passes every shipped program as it stands', () => {
    for (const program of CATALOGUE) {
      expect(validateProgram(program), program.id).toEqual([]);
    }
  });
});

/**
 * And the minutes already typed are not lost. A climber who answered the
 * question the program asked has hours the app never counted, because the
 * number went to `fields` and every engine reads `durationMin`.
 */
describe('minutes typed into the retired box', () => {
  const withField = (patch: Partial<Session>): Session =>
    ({
      ...newSession('2026-09-01', 0, { completed: true, rpe: 7, ...patch }),
      fields: { sessionDuration: 75 },
    }) as Session;

  it('are read as the session duration when it has none', async () => {
    await putSession(withField({}));
    const back = await getSession('2026-09-01#0');
    expect(back?.durationMin).toBe(75);
  });

  it('do not overwrite a duration the climber gave', async () => {
    await putSession(withField({ durationMin: 90 }));
    const back = await getSession('2026-09-01#0');
    expect(back?.durationMin).toBe(90);
  });

  it('come through the list the same way', async () => {
    await putSession(withField({}));
    const [back] = await listSessions();
    expect(back?.durationMin).toBe(75);
  });

  // Rebuild, never cast: a field answer is whatever was in the database,
  // and a duration of "ages" or of zero is not minutes.
  it('are ignored when they are not a number of minutes', async () => {
    for (const value of ['ages', 0, -30, Number.NaN] as const) {
      await putSession({
        ...newSession('2026-09-02', 0, { completed: true }),
        fields: { sessionDuration: value },
      } as Session);
      const back = await getSession('2026-09-02#0');
      expect(back?.durationMin, String(value)).toBeUndefined();
    }
  });

  it('leaves the answer where it is, so the archive still carries it', async () => {
    await putSession(withField({}));
    const back = await getSession('2026-09-01#0');
    expect(back?.fields?.sessionDuration).toBe(75);
  });
});
