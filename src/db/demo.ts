/**
 * Loading and wiping the sample climber (PLAN.md M110).
 *
 * `engine/demoClimber.ts` decides what the records are; this writes them,
 * finds them again, and takes them back out.
 *
 * **Two gates, because demo data in a real log is the whole risk.**
 * `canLoadDemo` refuses unless the database is empty by `hasRealData`'s own
 * reckoning — the same check the backup import uses before it takes a
 * restore point. And every record carries `demo: true`, so the wipe deletes
 * what it wrote rather than clearing a store.
 *
 * `hasDemo` is **not** here: the banner asks it on every page from the
 * eager shell, and importing it from this module pulled the generator into
 * the entry chunk. It lives in `demoFlag.ts`, which knows only how to
 * count.
 *
 * **The wipe is by tag, never by store.** A climber who loads the sample
 * data, likes the look of it, and logs a real session before wiping keeps
 * that session. Restoring a snapshot would have taken it with everything
 * else, which is why this does not use one.
 */

import { getDb } from './db';
import { hasRealData } from './exportImport';
import { demoClimber, DEMO_SEED } from '@/engine/demoClimber';
import { today as todayKey } from '@/engine/dates';

/** Profile fields the demo sets, and the only ones the wipe clears. */
export interface DemoProfile {
  programId: string;
  startDate: string;
  injuryId: string;
}

export async function canLoadDemo(): Promise<boolean> {
  return !(await hasRealData());
}

/** Write the sample climber. Returns what the profile has to be told. */
export async function loadDemo(seed = DEMO_SEED, today = todayKey()): Promise<DemoProfile> {
  const made = demoClimber(today, seed);
  const db = await getDb();
  const tx = db.transaction(['sessions', 'projects', 'metrics'], 'readwrite');
  // `as never` for the same reason `putSession` does it: the stored record
  // types carry an index signature the domain types do not.
  for (const session of made.sessions) await tx.objectStore('sessions').put(session as never);
  for (const project of made.projects) await tx.objectStore('projects').put(project as never);
  for (const entry of made.metrics) await tx.objectStore('metrics').put(entry as never);
  await tx.done;
  return {
    programId: made.programId,
    startDate: made.startDate,
    injuryId: made.injuries[0]!.id,
  };
}

/** The injuries the demo would add, for the profile store to hold. */
export function demoInjuries(today = todayKey(), seed = DEMO_SEED) {
  return demoClimber(today, seed).injuries;
}

/**
 * Take it all back out, and nothing else.
 *
 * Returns how many records went, so the screen can say it rather than
 * claiming success over a no-op.
 */
export async function wipeDemo(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['sessions', 'projects', 'metrics'], 'readwrite');
  let gone = 0;
  for (const store of ['sessions', 'projects', 'metrics'] as const) {
    const os = tx.objectStore(store);
    const rows = (await os.getAll()) as { demo?: true }[];
    const keys = await os.getAllKeys();
    for (const [i, row] of rows.entries()) {
      if (row.demo !== true) continue;
      await os.delete(keys[i]!);
      gone += 1;
    }
  }
  await tx.done;
  return gone;
}
