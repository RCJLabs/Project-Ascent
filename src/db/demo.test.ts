import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from './db';
import { canLoadDemo, loadDemo, wipeDemo } from './demo';
import { hasDemo } from './demoFlag';
import { newSession, putSession } from './sessions';
import { demoClimber, DEMO_SEED, DEMO_WEEKS } from '@/engine/demoClimber';

/**
 * A climber who does not exist (PLAN.md M110).
 *
 * Every browser verification from M89 to M109 hand-rolled a fixture into
 * IndexedDB through a throwaway script. The risk is the opposite direction:
 * sample data in a real log.
 */

const TODAY = '2026-09-12';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('the climber it makes', () => {
  it('is the same climber every time', () => {
    const a = demoClimber(TODAY);
    const b = demoClimber(TODAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is a different one on a different seed', () => {
    expect(JSON.stringify(demoClimber(TODAY))).not.toBe(JSON.stringify(demoClimber(TODAY, DEMO_SEED + 1)));
  });

  it('spans about a year, ending now', () => {
    const { sessions } = demoClimber(TODAY);
    const dates = sessions.map((s) => s.date).sort();
    expect(dates[dates.length - 1]! <= TODAY).toBe(true);
    const weeks = (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / (7 * 86_400_000);
    expect(weeks).toBeGreaterThan(DEMO_WEEKS - 6);
  });

  // Mid-week, so the last week's later sessions really would land beyond
  // today if nothing stopped them. A Saturday `today` never exercises it.
  it('never writes a session in the future', () => {
    for (const day of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-12']) {
      const made = demoClimber(day);
      expect(made.sessions.every((s) => s.date <= day), day).toBe(true);
      expect(made.sessions.length, day).toBeGreaterThan(50);
    }
  });

  /**
   * More of the easy ones than the hard ones, **within a session** — which
   * is what a pyramid is. Totals across the whole log rise for the easy
   * grades anyway, just because they appear in more sessions, so comparing
   * those proves nothing: a log of single problems passed it.
   */
  it('makes a pyramid rather than a column', () => {
    const climbing = demoClimber(TODAY).sessions.filter((s) => s.climbs.length > 2);
    expect(climbing.length).toBeGreaterThan(20);
    const easiest = climbing.map((s) => s.climbs[0]!.count);
    const hardest = climbing.map((s) => s.climbs[s.climbs.length - 1]!.count);
    const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
    expect(mean(easiest)).toBeGreaterThan(mean(hardest) + 1);
    // And a session logs more than one problem at a grade, which a count
    // of one everywhere would deny.
    expect(Math.max(...easiest)).toBeGreaterThan(1);
  });

  /**
   * A demo log full of sends at the top of the pyramid is a brochure.
   * Every one of these is a screen in the app that would otherwise have
   * nothing to say.
   */
  it('has the bad months in it too', () => {
    const { sessions } = demoClimber(TODAY);
    expect(sessions.some((s) => s.warmup === false)).toBe(true);
    expect(sessions.some((s) => s.restChecklist !== undefined)).toBe(true);
    expect(sessions.some((s) => s.mode === 'outdoor')).toBe(true);
    expect(sessions.some((s) => s.checkIn !== undefined)).toBe(true);
    expect(sessions.some((s) => s.climbs.some((c) => c.result === 'attempt'))).toBe(true);
    expect(sessions.some((s) => s.climbs.some((c) => c.angle !== undefined))).toBe(true);
  });

  it('leaves a gap, because a log with none has never belonged to anyone', () => {
    const dates = demoClimber(TODAY).sessions.map((s) => s.date).sort();
    const gaps = dates.slice(1).map((d, i) => (Date.parse(d) - Date.parse(dates[i]!)) / 86_400_000);
    expect(Math.max(...gaps)).toBeGreaterThan(7);
  });

  // `plateau.ts`, the coach and half the progress page exist to say
  // something about a plateau and say nothing against a line that only
  // goes up.
  it('plateaus before it climbs again', () => {
    const { sessions } = demoClimber(TODAY);
    const best = (from: string, to: string) =>
      Math.max(
        0,
        ...sessions
          .filter((s) => s.date >= from && s.date <= to)
          .flatMap((s) => s.climbs.filter((c) => c.result === 'send').map((c) => Number(c.grade.slice(1)))),
      );
    const dates = sessions.map((s) => s.date).sort();
    const quarter = (n: number) => dates[Math.floor((dates.length * n) / 4)] ?? dates[dates.length - 1]!;
    expect(best(quarter(1), quarter(2))).toBe(best(quarter(2), quarter(3)));
    expect(best(quarter(3), TODAY)).toBeGreaterThan(best(quarter(2), quarter(3)));
  });

  /**
   * Without these every project page reads "No burns yet" — the timeline,
   * the high point and the longest link draw nothing, and those are the
   * screens a project is for. The sample climber's own screenshots are
   * what showed it.
   */
  it('puts burns on the projects it makes', () => {
    const made = demoClimber(TODAY);
    const burns = made.sessions.flatMap((s) => s.projectAttempts ?? []);
    expect(burns.length).toBeGreaterThan(4);
    // Every burn points at a project that exists.
    const ids = new Set(made.projects.map((p) => p.id));
    expect(burns.every((b) => ids.has(b.projectId))).toBe(true);
    // And they go somewhere: a high point that moves, and at least one send.
    const points = burns.map((b) => b.highPoint ?? 100);
    expect(Math.max(...points)).toBeGreaterThan(Math.min(...points) + 20);
    expect(burns.some((b) => b.outcome === 'send')).toBe(true);
    // Some worked from partway up, so the longest link is not always the
    // ground-up high point (PLAN.md M102).
    expect(burns.some((b) => b.from !== undefined)).toBe(true);
  });

  it('brings the three states a project can be in', () => {
    expect(demoClimber(TODAY).projects.map((p) => p.status).sort()).toEqual(['active', 'sent', 'shelved']);
  });

  it('tags everything it makes', () => {
    const made = demoClimber(TODAY);
    expect(made.sessions.every((s) => s.demo === true)).toBe(true);
    expect(made.projects.every((p) => p.demo === true)).toBe(true);
    expect(made.metrics.every((m) => m.demo === true)).toBe(true);
  });
});

describe('loading it', () => {
  it('is offered on an empty log', async () => {
    expect(await canLoadDemo()).toBe(true);
  });

  // The gate the backup import already uses before it takes a restore point.
  it('is refused once there is anything real', async () => {
    await putSession(newSession('2026-01-01', 0, { completed: true }) as never);
    expect(await canLoadDemo()).toBe(false);
  });

  it('writes the records and says which program to start', async () => {
    const profile = await loadDemo(DEMO_SEED, TODAY);
    const db = await getDb();
    expect(await db.count('sessions')).toBeGreaterThan(50);
    expect(await db.count('projects')).toBe(3);
    expect(await db.count('metrics')).toBeGreaterThan(0);
    expect(profile.programId).toBe('iron_grip');
  });

  it('knows afterwards that it is loaded', async () => {
    expect(await hasDemo()).toBe(false);
    await loadDemo(DEMO_SEED, TODAY);
    expect(await hasDemo()).toBe(true);
  });
});

describe('wiping it', () => {
  it('takes out everything it wrote', async () => {
    await loadDemo(DEMO_SEED, TODAY);
    const gone = await wipeDemo();
    expect(gone).toBeGreaterThan(50);
    const db = await getDb();
    expect(await db.count('sessions')).toBe(0);
    expect(await db.count('projects')).toBe(0);
    expect(await db.count('metrics')).toBe(0);
    expect(await hasDemo()).toBe(false);
  });

  /**
   * The stated risk of the milestone, and the reason this deletes by tag
   * rather than restoring a snapshot: a climber who loads the sample data,
   * likes it, and logs a real session before wiping keeps that session.
   */
  it('leaves a real session written on top of it alone', async () => {
    await loadDemo(DEMO_SEED, TODAY);
    await putSession(newSession(TODAY, 1, { completed: true, rpe: 9 }) as never);
    await wipeDemo();
    const db = await getDb();
    const left = (await db.getAll('sessions')) as { id: string; demo?: true }[];
    expect(left.map((s) => s.id)).toEqual([`${TODAY}#1`]);
    expect(left[0]!.demo).toBeUndefined();
  });

  it('is a no-op with nothing to wipe', async () => {
    expect(await wipeDemo()).toBe(0);
  });

  it('can be loaded again after a wipe', async () => {
    await loadDemo(DEMO_SEED, TODAY);
    await wipeDemo();
    expect(await canLoadDemo()).toBe(true);
  });
});
