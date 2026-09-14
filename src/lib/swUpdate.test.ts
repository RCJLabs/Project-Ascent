import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFER_MS, UPDATE_CHECK_MS } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { watchForUpdates } from './swUpdate';

/**
 * The app asking whether there is a new version (PLAN.md M154).
 *
 * M19 built the prompt and left the noticing to the browser, which only
 * looks on a navigation — and an installed app resumed from the task
 * switcher never makes one.
 */

const NOW = 1_700_000_000_000;

function harness(opts: { visible?: boolean } = {}) {
  let now = NOW;
  let visible = opts.visible ?? true;
  const update = vi.fn(() => Promise.resolve());
  const listeners: Record<string, (() => void)[]> = {};
  let tick: (() => void) | null = null;

  const check = watchForUpdates({ update } as unknown as ServiceWorkerRegistration, {
    now: () => now,
    visible: () => visible,
    addListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
    setInterval: (fn) => {
      tick = fn;
      return 0;
    },
  });

  return {
    update,
    check,
    advance: (ms: number) => {
      now += ms;
    },
    show: (on: boolean) => {
      visible = on;
    },
    resume: () => {
      visible = true;
      for (const fn of listeners['visibilitychange'] ?? []) fn();
    },
    tick: () => tick?.(),
  };
}

beforeEach(() => {
  useAppUpdate.setState({
    ready: false,
    deferred: false,
    deferredAt: null,
    offlineReady: false,
    apply: null,
    lastCheckedAt: null,
  });
});

describe('when the app asks', () => {
  it('asks the moment it is wired up', () => {
    const h = harness();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(useAppUpdate.getState().lastCheckedAt).toBe(NOW);
  });

  it('does not ask again on the next tick', () => {
    const h = harness();
    h.advance(60_000);
    h.tick();
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('asks again once the interval has passed', () => {
    const h = harness();
    h.advance(UPDATE_CHECK_MS);
    h.tick();
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the app is out of sight', () => {
    const h = harness({ visible: false });
    expect(h.update).not.toHaveBeenCalled();
    h.advance(UPDATE_CHECK_MS * 3);
    h.tick();
    expect(h.update).not.toHaveBeenCalled();
  });

  /** The case an installed app actually hits: resumed, not launched. */
  it('asks when the app comes back into view', () => {
    const h = harness({ visible: false });
    h.advance(UPDATE_CHECK_MS);
    h.resume();
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('costs one request across a run of tab switches', () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) {
      h.show(false);
      h.advance(1000);
      h.resume();
    }
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the network says nothing', async () => {
    const update = vi.fn(() => Promise.reject(new Error('offline')));
    expect(() =>
      watchForUpdates({ update } as unknown as ServiceWorkerRegistration, {
        now: () => NOW,
        visible: () => true,
        addListener: () => {},
        setInterval: () => 0,
      }),
    ).not.toThrow();
    await Promise.resolve();
  });
});

describe('a "later" that expires', () => {
  it('comes back once the day is up', () => {
    const h = harness();
    useAppUpdate.getState().markReady(() => {});
    useAppUpdate.getState().defer(NOW);
    expect(useAppUpdate.getState().deferred).toBe(true);

    h.advance(DEFER_MS);
    h.tick();
    expect(useAppUpdate.getState().deferred).toBe(false);
  });

  it('stands while it is still fresh', () => {
    const h = harness();
    useAppUpdate.getState().markReady(() => {});
    useAppUpdate.getState().defer(NOW);
    h.advance(DEFER_MS - 1);
    h.tick();
    expect(useAppUpdate.getState().deferred).toBe(true);
  });

  /**
   * A deferral is an answer about the version that was waiting when it was
   * given. A newer one is a different question.
   */
  it('is cleared outright by a newer version arriving', () => {
    useAppUpdate.getState().defer(NOW);
    useAppUpdate.getState().markReady(() => {});
    expect(useAppUpdate.getState().deferred).toBe(false);
    expect(useAppUpdate.getState().deferredAt).toBeNull();
  });

  it('expires even while the app is out of sight, so the next look is honest', () => {
    const h = harness({ visible: false });
    useAppUpdate.getState().markReady(() => {});
    useAppUpdate.getState().defer(NOW);
    h.advance(DEFER_MS);
    h.tick();
    expect(useAppUpdate.getState().deferred).toBe(false);
  });
});
