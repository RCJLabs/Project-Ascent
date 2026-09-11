import { describe, expect, it } from 'vitest';
import { getDb } from './db';
import { getSession, listSessions, migrateSession, newSession, putSession } from './sessions';

/**
 * The old tick list, promoted (PLAN.md M98).
 *
 * Every session written before M98 carries `completedExercises: string[]`.
 * A name in that list is an exercise that was done, which is exactly an
 * entry in `exercises` with no numbers on it — so the old field is read once
 * and never written again, the shape `getAscent` settled on in M96.
 */

const DATE = '2026-04-01';

async function wipe(): Promise<void> {
  const db = await getDb();
  await db.clear('sessions');
}

describe('migrating a session written before the numbers existed', () => {
  it('turns each ticked name into an entry', () => {
    const before = {
      ...newSession(DATE, 0),
      completedExercises: ['Max Hangs', 'Weighted Pull-Ups'],
    };
    expect(migrateSession(before).exercises).toEqual([
      { name: 'Max Hangs' },
      { name: 'Weighted Pull-Ups' },
    ]);
  });

  it('drops the old field rather than leaving both', () => {
    const before = { ...newSession(DATE, 0), completedExercises: ['Max Hangs'] };
    expect('completedExercises' in migrateSession(before)).toBe(false);
  });

  // A session written since carries its own rows, and a stale
  // `completedExercises` beside them must not overwrite what was logged.
  it('never overwrites rows that are already there', () => {
    const both = {
      ...newSession(DATE, 0),
      exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }],
      completedExercises: ['Something Else'],
    };
    expect(migrateSession(both).exercises).toEqual([{ name: 'Max Hangs', sets: 5, load: 20 }]);
  });

  it('leaves a session with neither alone', () => {
    const plain = newSession(DATE, 0);
    expect(migrateSession(plain).exercises).toBeUndefined();
  });

  it('does not invent an empty list from an empty one', () => {
    const empty = { ...newSession(DATE, 0), completedExercises: [] };
    expect(migrateSession(empty).exercises).toBeUndefined();
  });

  it('reaches the app through both read paths', async () => {
    await wipe();
    await putSession({
      ...newSession(DATE, 0),
      completedExercises: ['Max Hangs'],
    } as never);

    expect((await listSessions())[0]!.exercises).toEqual([{ name: 'Max Hangs' }]);
    expect((await getSession(`${DATE}#0`))!.exercises).toEqual([{ name: 'Max Hangs' }]);
  });
});
