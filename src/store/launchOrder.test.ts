import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBDatabase as FakeIDBDatabase, IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { hydrateAll } from './index';

/**
 * What `hydrateAll` asks for first (PLAN.md M361).
 *
 * IndexedDB answers in the order it was asked, and each answer's render
 * runs before the next answer is handled. Today's card on Home waits for
 * the profile, the climber's own programs and the log; asked for after the
 * log, the programs landed last of the three on every warm launch measured,
 * and the card waited for them. So the order is the behaviour, and this is
 * what holds it.
 */

const realTransaction = FakeIDBDatabase.prototype.transaction;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

afterEach(() => {
  FakeIDBDatabase.prototype.transaction = realTransaction;
});

/** Every transaction opened during `run`, as `store:mode`, in order. */
async function asked(run: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  FakeIDBDatabase.prototype.transaction = function (this: IDBDatabase, names: string | string[], mode?: IDBTransactionMode, ...rest: never[]) {
    seen.push(`${([] as string[]).concat(names).join(',')}:${mode ?? 'readonly'}`);
    return (realTransaction as (...a: unknown[]) => IDBTransaction).call(this, names, mode, ...rest);
  } as typeof realTransaction;
  await run();
  return seen;
}

describe('hydrateAll', () => {
  it("asks for the climber's own programs before the log", async () => {
    const order = await asked(hydrateAll);
    const programs = order.indexOf('programs:readonly');
    const sessions = order.indexOf('sessions:readonly');
    expect(programs, order.join(' ')).toBeGreaterThan(-1);
    expect(sessions, order.join(' ')).toBeGreaterThan(-1);
    expect(programs, order.join(' ')).toBeLessThan(sessions);
  });

  it('asks for the profile before the log too', async () => {
    // The card's third store. It was already ahead; this keeps it there.
    const order = await asked(hydrateAll);
    expect(order.indexOf('profile:readonly')).toBeGreaterThan(-1);
    expect(order.indexOf('profile:readonly')).toBeLessThan(order.indexOf('sessions:readonly'));
  });
});
