import { describe, expect, it } from 'vitest';
import { getDb } from '@/db/db';
import { eraseEverything } from '@/db/erase';
import { newSession, putSession } from '@/db/sessions';
import { newProject, putProject } from '@/db/projects';
import { hydrateAll } from './index';
import { beginHydration, endHydration, hydrationInProgress } from './hydrating';
import { useProjects } from './projects';
import { useSessions } from './sessions';

/**
 * Nothing reconciles against half-loaded stores (PLAN.md M114).
 *
 * Found in a browser, not here: deleting everything emptied the database
 * and then one project was back in it. `projects.ts` subscribes to
 * `sessions.byDate`, sessions loaded first and went empty, projects still
 * held the pre-wipe list, and reconciling one against the other wrote a
 * retraction into the database that had just been cleared.
 */

describe('the guard itself', () => {
  it('is off to begin with', () => {
    expect(hydrationInProgress()).toBe(false);
  });

  it('counts rather than flips', () => {
    // `hydrateAll` can be re-entered — the boot path and a launched file
    // both call it — and a boolean would let the inner call clear the
    // outer call's guard halfway through its load.
    beginHydration();
    beginHydration();
    endHydration();
    expect(hydrationInProgress(), 'the inner call cleared the outer guard').toBe(true);
    endHydration();
    expect(hydrationInProgress()).toBe(false);
  });

  it('does not go negative and stick', () => {
    endHydration();
    endHydration();
    beginHydration();
    expect(hydrationInProgress()).toBe(true);
    endHydration();
    expect(hydrationInProgress()).toBe(false);
  });
});

/** The subscription is fire-and-forget, so the write lands a tick later. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('a wipe followed by a reload', () => {
  /**
   * The window itself, forced rather than raced for.
   *
   * A first version of this test called `eraseEverything` and `hydrateAll`
   * and asserted the database stayed empty — and **it passed with the guard
   * removed**, because under fake-indexeddb the ten loads happened to
   * resolve in an order that never opened the window. It reproduced the
   * scenario and not the timing, which is the same vacuous shape M100 and
   * M110 both hit.
   *
   * This puts the stores into the exact state the middle of a hydrate
   * produces — projects loaded and stale, sessions about to go empty — and
   * then runs the load that fires the subscription.
   */
  async function midHydrateLoad(guarded: boolean): Promise<number> {
    const db = await getDb();
    await eraseEverything();
    // Both stores back to empty first. Without this the second call inherits
    // the stale project the first one left in memory, and the priming below
    // — which is meant to be a no-op — writes it straight back.
    useProjects.setState({ projects: [], hydrated: true } as never);
    useSessions.setState({ byDate: {}, hydrated: true } as never);
    await settle();

    // Sessions primed while projects are still empty, so this `byDate`
    // change fires the subscription and `reconcile` returns on its own
    // `projects.length === 0` guard. Priming the other way round — which a
    // first version did — lets the reconcile run here and *retract the send
    // in memory*, and the load below then has nothing left to write back.
    // The control case went quiet and the fixture proved nothing.
    useSessions.setState({ byDate: { '2026-03-01': [] }, hydrated: true } as never);
    await settle();
    expect(await db.count('projects'), 'priming wrote something').toBe(0);

    // Now the stale half. Nothing subscribes to projects, so setting it
    // fires nothing: this is exactly a hydrate's midpoint, projects loaded
    // and a whole load out of date over an empty database. The send fields
    // are what `reconcileProjects` retracts when no session justifies them.
    useProjects.setState({
      projects: [
        {
          ...newProject({ name: 'The Nose', grade: 'V5', scale: 'V' }),
          id: 'p1',
          status: 'sent',
          sendAppliedFrom: '2026-03-01',
          sentDate: '2026-03-01',
        },
      ],
      hydrated: true,
    } as never);

    if (guarded) beginHydration();
    try {
      await useSessions.getState().load();
    } finally {
      if (guarded) endHydration();
    }
    await settle();
    return db.count('projects');
  }

  it('writes no project back into the emptied database', async () => {
    expect(await midHydrateLoad(true)).toBe(0);
  });

  it('would write one back without the guard', async () => {
    // Not a test of the app — a test that the test above is not vacuous.
    // Remove `hydrationInProgress()` from the subscription and the first
    // assertion has to fail; this is what proves the fixture can make it.
    expect(await midHydrateLoad(false)).toBe(1);
  });

  it('leaves the database empty across a real erase and reload', async () => {
    const db = await getDb();
    await eraseEverything();
    await putSession(
      newSession('2026-03-01', 0, {
        completed: true,
        climbs: [{ id: 'c1', grade: 'V5', scale: 'V', count: 1, result: 'send' }],
      }) as never,
    );
    await putProject({
      ...newProject({ name: 'The Nose', grade: 'V5', scale: 'V' }),
      id: 'p1',
      status: 'sent',
    });
    await hydrateAll();
    expect(useProjects.getState().projects.length, 'the fixture never loaded').toBe(1);

    await eraseEverything();
    await hydrateAll();
    await settle();

    expect(await db.count('projects'), 'a project was written back after the wipe').toBe(0);
    expect(await db.count('sessions')).toBe(0);
    expect(useProjects.getState().projects).toEqual([]);
  });

  /**
   * `hydrateAll`'s own bracketing, read at the source.
   *
   * This is structural where the tests above are behavioural, and the
   * reason is worth stating rather than hiding: **the window cannot be
   * reproduced through `hydrateAll` on demand.** It loads ten stores in one
   * `Promise.all`, and under fake-indexeddb they resolve in an order that
   * usually closes the gap before the subscription can see it — which is
   * exactly why the first version of the test above passed with the guard
   * removed. Mutation confirmed it: deleting `beginHydration()` from
   * `hydrateAll` changes nothing any behavioural test here can observe.
   *
   * So the behaviour is pinned by forcing the window directly, and the
   * wiring that puts real hydrates inside it is pinned by reading it. A
   * weaker check said out loud beats a stronger one that does not run.
   */
  it('brackets the whole load in the guard', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/store/index.ts', 'utf8');
    const begin = source.indexOf('beginHydration();');
    const all = source.indexOf('await Promise.all([');
    const end = source.indexOf('endHydration();');
    expect(begin, 'hydrateAll never arms the guard').toBeGreaterThan(-1);
    expect(begin, 'the guard is armed after the load has started').toBeLessThan(all);
    expect(end, 'the guard is never released').toBeGreaterThan(all);
    // Released in a `finally`, or one store throwing leaves every later
    // reconcile suppressed for the life of the tab.
    expect(source).toMatch(/\}\s*finally\s*\{\s*endHydration\(\);/);
  });

  it('still reconciles once both stores are loaded', async () => {
    // The guard suppresses the reconcile during the load; `hydrateAll` runs
    // it afterwards instead. Without that line the suppression would be a
    // silent behaviour change rather than a fix, so this is what notices.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/store/index.ts', 'utf8');
    expect(source).toMatch(/await useProjects\.getState\(\)\.reconcile\(\);/);
    expect(source.indexOf('endHydration()')).toBeLessThan(
      source.indexOf('await useProjects.getState().reconcile();'),
    );
  });
});
