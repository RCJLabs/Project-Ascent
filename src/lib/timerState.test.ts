import { beforeEach, describe, expect, it } from 'vitest';
import {
  TIMER_MAX_AGE_MS,
  clearTimerState,
  elapsedFrom,
  loadTimerState,
  saveTimerState,
} from './timerState';

/** vitest runs in node, which has no sessionStorage. */
class Memory implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

const base = {
  protocolId: 'max_hangs',
  exerciseName: 'Max hangs',
  sets: 5,
  sessionId: '2026-09-10#0',
  baseElapsed: 42_000,
  startedAt: null as number | null,
};

beforeEach(() => {
  globalThis.sessionStorage = new Memory();
});

describe('keeping a timer across a reload', () => {
  it('comes back where it was', () => {
    saveTimerState(base);
    const read = loadTimerState('2026-09-10#0');
    expect(read?.protocolId).toBe('max_hangs');
    expect(read?.baseElapsed).toBe(42_000);
  });

  it('does not reopen on a different session', () => {
    // Otherwise yesterday's hangboard timer appears on today's log.
    saveTimerState(base);
    expect(loadTimerState('2026-09-11#0')).toBeNull();
  });

  it('forgets one that is too old to be true', () => {
    saveTimerState(base);
    const now = Date.now() + TIMER_MAX_AGE_MS + 1;
    expect(loadTimerState(base.sessionId, now)).toBeNull();
  });

  it('reports nothing when nothing was saved', () => {
    expect(loadTimerState('anything')).toBeNull();
  });

  it('refuses a record of the wrong shape rather than half-restoring', () => {
    sessionStorage.setItem('ascent:timer', JSON.stringify({ protocolId: 'x' }));
    expect(loadTimerState('anything')).toBeNull();
    sessionStorage.setItem('ascent:timer', 'not json');
    expect(loadTimerState('anything')).toBeNull();
  });

  it('can be cleared', () => {
    saveTimerState(base);
    clearTimerState();
    expect(loadTimerState(base.sessionId)).toBeNull();
  });

  it('survives a browser that refuses to store anything', () => {
    // Some browsers throw on the accessor itself rather than returning null.
    globalThis.sessionStorage = new Proxy(new Memory(), {
      get() {
        throw new Error('blocked');
      },
    });
    expect(() => saveTimerState(base)).not.toThrow();
    expect(loadTimerState(base.sessionId)).toBeNull();
    expect(() => clearTimerState()).not.toThrow();
  });
});

describe('how far in a restored timer is', () => {
  it('resumes a paused one exactly where it stopped', () => {
    expect(elapsedFrom({ ...base, startedAt: null, savedAt: 0 }, 999_999)).toBe(42_000);
  });

  it('keeps a running one running through the reload', () => {
    // The rest interval did not pause because the page did, and neither did
    // the climber's fingers.
    const now = 100_000;
    expect(elapsedFrom({ ...base, startedAt: now - 8_000, savedAt: 0 }, now)).toBe(50_000);
  });

  it('never goes backwards on a clock that moved', () => {
    const state = { ...base, startedAt: 5_000, savedAt: 0 };
    expect(elapsedFrom(state, 1_000)).toBe(42_000);
  });
});
