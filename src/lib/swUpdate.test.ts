import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFER_MS, UPDATE_CHECK_MS } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { HANDOVER_MS, applyUpdate, watchForUpdates } from './swUpdate';

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

/**
 * Pressing *Update now* and having something happen (PLAN.md M302).
 *
 * The reported failure is a button that does nothing: a page with no
 * controller gets no `controlling` event with `isUpdate`, so workbox never
 * reloads it. What the tap *does* deliver is skip-waiting, which activates
 * the new worker and drops the old precache while this document goes on
 * running the old build — and every route not already loaded then 404s.
 */
describe('applying the update that is waiting', () => {
  function worker(state: ServiceWorker['state'] = 'installed') {
    const listeners = new Set<() => void>();
    const it = {
      state,
      addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
      become(next: ServiceWorker['state']) {
        it.state = next;
        for (const fn of listeners) fn();
      },
    };
    return it as unknown as ServiceWorker & { become: (s: ServiceWorker['state']) => void };
  }

  /**
   * A registration that stops having a `waiting` worker once it has been
   * told to skip waiting — which is what a browser's does, and the only
   * thing that can tell reading it *before* the message from reading it
   * after. A fake that answers the same either way lets the race through.
   */
  function deps(options: { controlled: boolean; waiting?: ServiceWorker }) {
    let controlled = options.controlled;
    let waiting = options.waiting;
    const reloads: number[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    return {
      reloads,
      timers,
      skipWaiting: () => { waiting = undefined; },
      dep: {
        controlled: () => controlled,
        reload: () => reloads.push(1),
        after: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
        registration: () => Promise.resolve({ get waiting() { return waiting; } } as unknown as ServiceWorkerRegistration),
      },
    };
  }

  it('leaves the ordinary path to workbox, which reloads on its own', async () => {
    const d = deps({ controlled: true });
    let asked = 0;
    await applyUpdate(() => { asked += 1; d.skipWaiting(); }, d.dep);
    expect(asked, 'the waiting worker was never told to skip waiting').toBe(1);
    // A second reload from here would race workbox's own.
    expect(d.reloads).toEqual([]);
  });

  it('reloads the page the handover cannot reach on its own', async () => {
    const waiting = worker();
    const d = deps({ controlled: false, waiting });
    await applyUpdate(d.skipWaiting, d.dep);
    expect(d.reloads, 'reloaded before the new worker was ready').toEqual([]);
    waiting.become('activated');
    expect(d.reloads, 'never reloaded').toEqual([1]);
  });

  /**
   * Reloading before the new worker is activated is served the old shell by
   * the old one, which lands in the same place the tap was meant to escape.
   */
  it('waits for the new worker rather than reloading into the old one', async () => {
    const waiting = worker();
    const d = deps({ controlled: false, waiting });
    await applyUpdate(d.skipWaiting, d.dep);
    waiting.become('activating');
    expect(d.reloads).toEqual([]);
    waiting.become('activated');
    expect(d.reloads).toEqual([1]);
  });

  it('reloads once, however many ways it is told to', async () => {
    const waiting = worker();
    const d = deps({ controlled: false, waiting });
    await applyUpdate(d.skipWaiting, d.dep);
    waiting.become('activated');
    waiting.become('activated');
    for (const t of d.timers) t.fn();
    expect(d.reloads).toEqual([1]);
  });

  /** A worker that got there first fires no `statechange` to catch. */
  it('reloads for a worker that is already activated', async () => {
    const d = deps({ controlled: false, waiting: worker('activated') });
    await applyUpdate(d.skipWaiting, d.dep);
    expect(d.reloads).toEqual([1]);
  });

  it('reloads when there was nothing waiting at all', async () => {
    const d = deps({ controlled: false });
    await applyUpdate(d.skipWaiting, d.dep);
    expect(d.reloads).toEqual([1]);
  });

  /** Never a dead button, whatever the worker does. */
  it('reloads anyway if the handover never comes', async () => {
    const d = deps({ controlled: false, waiting: worker() });
    await applyUpdate(d.skipWaiting, d.dep);
    expect(d.reloads).toEqual([]);
    expect(d.timers.map((t) => t.ms)).toEqual([HANDOVER_MS]);
    for (const t of d.timers) t.fn();
    expect(d.reloads).toEqual([1]);
  });
});
