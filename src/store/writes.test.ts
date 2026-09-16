import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { hydrateAll } from './index';
import { useProfile } from './profile';
import { enqueueWrite, writesSettled } from './writes';

/**
 * A read that overtakes a write returns the state before it (PLAN.md M220).
 *
 * These are deterministic on purpose. The defect behind them was a flake —
 * three failures in eighteen runs — and a test that reproduces it three
 * times in eighteen is not a test. Every case here holds a *slow* write,
 * so the ordering is asserted rather than raced for.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await writesSettled();
});

describe('the write queue', () => {
  it('runs writes in the order the actions happened', async () => {
    // Before M220 each `void save(...)` awaited `getDb()` separately, so two
    // rapid actions created their transactions in whatever order their
    // microtasks resolved. Last-write-wins did not mean last-action-wins.
    const order: string[] = [];
    enqueueWrite(async () => {
      await sleep(20);
      order.push('first');
    });
    enqueueWrite(async () => {
      order.push('second');
    });
    await writesSettled();
    expect(order).toEqual(['first', 'second']);
  });

  it('lets the caller carry on in the same tick', () => {
    // The whole reason these are fire-and-forget: a climber toggling a
    // setting does not wait on a disk.
    let ran = false;
    enqueueWrite(async () => {
      ran = true;
    });
    expect(ran).toBe(false);
  });

  it('reports a failed write instead of throwing it into a promise nobody holds', async () => {
    // `void save(...)` on a broken database was an unhandled rejection and a
    // silent loss. The queue survives it, too — one bad write must not stop
    // every write after it.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let after = false;
    enqueueWrite(() => Promise.reject(new Error('disk gone')));
    enqueueWrite(async () => {
      after = true;
    });
    await expect(writesSettled()).resolves.toBeUndefined();
    expect(after).toBe(true);
    errors.mockRestore();
  });

  it('does not wait on a write enqueued after it was asked', async () => {
    // `writesSettled` captures the chain rather than looping until empty: a
    // screen that writes as it renders would never let go of a loop.
    const settled = writesSettled();
    let later = false;
    enqueueWrite(async () => {
      await sleep(30);
      later = true;
    });
    await settled;
    expect(later).toBe(false);
  });
});

describe('every store persists through the queue', () => {
  /**
   * A sweep, because the queue is only worth having if nothing bypasses it
   * (PLAN.md M220).
   *
   * M220's battery reverted *one* of the twenty-four call sites to
   * `void save(...)` and every test still passed. One site outside the
   * queue is one action whose write can still be overtaken by the next
   * read, and it is invisible in review — the two lines differ by six
   * characters.
   */
  const SOURCES = readdirSync('src/store')
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
    .map((f) => ({ path: `src/store/${f}`, source: readFileSync(`src/store/${f}`, 'utf8') }));

  /** Named and taking its corpus, so the control below runs this exact code. */
  function bypasses(corpus: readonly { path: string; source: string }[]): string[] {
    const out: string[] = [];
    for (const { path, source } of corpus) {
      for (const [i, line] of source.split('\n').entries()) {
        // Comments are skipped, and not as a convenience: this module's own
        // doc has to be able to name the pattern it replaced, and it said
        // `void save(...)` twice. A rule that cannot survive being written
        // about is a rule nobody can explain in the file it governs.
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) continue;
        // A persist call thrown away: `void save(...)`, `void putX(...)`.
        if (/\bvoid\s+(save|put|remove|upsert)[A-Za-z]*\(/.test(line)) {
          out.push(`${path}:${i + 1}`);
        }
      }
    }
    return out;
  }

  it('finds one when there is one', () => {
    expect(
      bypasses([{ path: 'a.ts', source: 'set({});\n    void saveClimber(x);\n' }]),
    ).toEqual(['a.ts:2']);
    expect(bypasses([{ path: 'b.ts', source: 'enqueueWrite(() => save(x));\n' }])).toEqual([]);
    // And the prose that describes the thing it forbids.
    expect(bypasses([{ path: 'c.ts', source: ' * was `void save(...)` before.\n' }])).toEqual([]);
  });

  it('has none', () => {
    expect(SOURCES.length).toBeGreaterThan(8);
    expect(SOURCES.some(({ path }) => path === 'src/store/profile.ts')).toBe(true);
    expect(bypasses(SOURCES)).toEqual([]);
  });
});

describe('hydrating after a change', () => {
  it('does not read until the writes in flight have landed', async () => {
    /**
     * The defect itself. `startDemo` writes the program and the injury
     * fire-and-forget and then calls `hydrateAll`; when the read won, the
     * sample climber came back with no program and the failure was silent.
     * Measured with a five-millisecond delay in the profile's `save`, which
     * turned a rare flake into every run.
     */
    let landed = false;
    enqueueWrite(async () => {
      await sleep(25);
      landed = true;
    });
    await hydrateAll();
    expect(landed).toBe(true);
  });

  it('keeps what an action set a tick before, through a real store', async () => {
    await hydrateAll();
    useProfile.getState().startProgram('iron_grip', {});
    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
    // The read that used to overwrite it.
    await hydrateAll();
    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
  });
});
