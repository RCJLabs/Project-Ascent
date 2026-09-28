// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { deleteSession, putSession, type Session } from '@/db/sessions';
import { useSessions } from './sessions';

/**
 * A reload that reads the same log keeps the same log (PLAN.md M350).
 *
 * Three things load the log at launch, and each read used to replace
 * `byDate` with a new object saying nothing new — so every card on Home
 * that reads the log derived everything again, twice over. Every load still
 * reads the database; only an answer identical to what is in memory is
 * dropped. The other half of this file is the reason that is safe: any
 * difference at all, however deep, still replaces it.
 */

const session = (date: string, over: Partial<Session> = {}): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    durationMin: 60,
    warmup: true,
    drillDone: false,
    rpe: 7,
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...over,
  }) as Session;

/** Straight into the database, as the sample climber and an import write. */
async function writeRaw(row: Session): Promise<void> {
  const db = await getDb();
  await db.put('sessions', row as never);
}

async function seed(): Promise<void> {
  for (const date of ['2026-09-01', '2026-09-03', '2026-09-05']) await writeRaw(session(date));
}

const log = () => useSessions.getState().byDate;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useSessions.setState({ hydrated: false, byDate: {} });
});

describe('a reload that reads the same log', () => {
  it('keeps the same object, so nothing that reads it recomputes', async () => {
    await seed();
    await useSessions.getState().load();
    const first = log();
    expect(Object.keys(first)).toHaveLength(3);
    await useSessions.getState().load();
    expect(log()).toBe(first);
  });

  it('three loads at once, as at launch, change the log once', async () => {
    await seed();
    let changes = 0;
    const stop = useSessions.subscribe((state, before) => {
      if (state.byDate !== before.byDate) changes += 1;
    });
    await Promise.all([useSessions.getState().load(), useSessions.getState().load(), useSessions.getState().load()]);
    stop();
    expect(changes).toBe(1);
    expect(Object.keys(log())).toHaveLength(3);
  });

  it('marks the store loaded on an empty log, which reads the same as the empty start', async () => {
    const before = log();
    await useSessions.getState().load();
    expect(useSessions.getState().hydrated).toBe(true);
    expect(log()).toBe(before);
  });
});

describe('a reload that reads anything new', () => {
  it('sees a session added', async () => {
    await seed();
    await useSessions.getState().load();
    const first = log();
    await putSession(session('2026-09-07'));
    await useSessions.getState().load();
    expect(log()).not.toBe(first);
    expect(log()['2026-09-07']).toHaveLength(1);
  });

  it('sees a session gone', async () => {
    await seed();
    await useSessions.getState().load();
    await deleteSession('2026-09-03#0');
    await useSessions.getState().load();
    expect(log()['2026-09-03']).toBeUndefined();
    expect(Object.keys(log())).toHaveLength(2);
  });

  it('sees a change deep inside a session, with nothing else about it changed', async () => {
    // Written raw, with the same `updatedAt`: a comparison that stopped at
    // the timestamp, or at the top level of the session, would miss it.
    await seed();
    await useSessions.getState().load();
    const first = log();
    const changed = session('2026-09-03');
    changed.climbs[0]!.count = 4;
    await writeRaw(changed);
    await useSessions.getState().load();
    expect(log()).not.toBe(first);
    expect(log()['2026-09-03']![0]!.climbs[0]!.count).toBe(4);
  });

  it('sees a session moved to another day', async () => {
    await seed();
    await useSessions.getState().load();
    await deleteSession('2026-09-05#0');
    await writeRaw(session('2026-09-06'));
    await useSessions.getState().load();
    expect(log()['2026-09-05']).toBeUndefined();
    expect(log()['2026-09-06']).toHaveLength(1);
  });

  it('sees one day with two sessions where it had one', async () => {
    await seed();
    await useSessions.getState().load();
    await writeRaw(session('2026-09-05', { id: '2026-09-05#1' }));
    await useSessions.getState().load();
    expect(log()['2026-09-05']).toHaveLength(2);
  });

  it('sees a field the database has that the copy in memory lacks', async () => {
    await seed();
    await useSessions.getState().load();
    const { rpe: _dropped, ...without } = log()['2026-09-01']![0]!;
    useSessions.setState({ byDate: { ...log(), '2026-09-01': [without as Session] } });
    const before = log();
    await useSessions.getState().load();
    expect(log()).not.toBe(before);
    expect(log()['2026-09-01']![0]!.rpe).toBe(7);
  });

  it('does not take a missing key for one holding nothing when the counts happen to match', async () => {
    // One key swapped for another holding `undefined`: the same number of
    // keys, and every key of the copy in memory reads `undefined` in the
    // database too — only asking whether the key is there tells them apart.
    await seed();
    await useSessions.getState().load();
    const { rpe: _dropped, ...rest } = log()['2026-09-01']![0]!;
    const swapped = { ...rest, notes: undefined } as Session;
    useSessions.setState({ byDate: { ...log(), '2026-09-01': [swapped] } });
    const before = log();
    await useSessions.getState().load();
    expect(log()).not.toBe(before);
    expect(log()['2026-09-01']![0]!.rpe).toBe(7);
  });

  it('does not read two different dates as the same because neither has keys of its own', async () => {
    // Nothing in a session is a `Date` today; the rule is for the day
    // something is, since IndexedDB would store one as it is.
    await writeRaw(session('2026-09-01', { stamped: new Date(1) } as Partial<Session>));
    await useSessions.getState().load();
    const first = log();
    await writeRaw(session('2026-09-01', { stamped: new Date(2) } as Partial<Session>));
    await useSessions.getState().load();
    expect(log()).not.toBe(first);
  });

  it('does not read null and nothing as the same value', async () => {
    // Loose equality would: \`null == undefined\`, and \`0 == ''\` besides.
    await writeRaw(session('2026-09-01', { notes: undefined }));
    await useSessions.getState().load();
    const inMemory = { ...log()['2026-09-01']![0]!, notes: null } as unknown as Session;
    useSessions.setState({ byDate: { ...log(), '2026-09-01': [inMemory] } });
    const before = log();
    await useSessions.getState().load();
    expect(log()).not.toBe(before);
    expect(log()['2026-09-01']![0]!.notes).toBeUndefined();
  });

  it('reads a key holding nothing on one side only as a difference, not a match', async () => {
    // In memory with an explicit `undefined`, in the database without the
    // key at all: the two mean the same thing, and the rule is to replace
    // rather than guess — a replace costs a recompute, a wrong match costs
    // a stale log.
    await seed();
    await useSessions.getState().load();
    const withHole = { ...log()['2026-09-01']![0]!, notes: undefined } as Session;
    useSessions.setState({ byDate: { ...log(), '2026-09-01': [withHole] } });
    const before = log();
    await useSessions.getState().load();
    expect(log()).not.toBe(before);
    expect('notes' in log()['2026-09-01']![0]!).toBe(false);
  });
});
