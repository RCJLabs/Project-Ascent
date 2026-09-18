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
 *
 * ## The block the wipe used to leave behind (PLAN.md M281)
 *
 * Loading the sample climber starts a program, which writes three things:
 * `startDates[programId]`, a week `plan`, and a `BlockRecord`. Clearing it
 * called `stopProgram`, which sets `activeProgramId` to null and **closes**
 * the block row — and undid none of the rest. Measured in a browser:
 *
 * ```
 * after load   iron_grip#2026-08-09 ended=null
 * after clear  iron_grip#2026-08-09 ended=2026-09-18 stopped
 * ```
 *
 * So a climber was told *"Anything you logged yourself is still here"* and
 * kept a block they never ran, with its sessions gone because those *were*
 * wiped. `finderHistory.lastBlockFor` reads the newest **ended** block and
 * scores it against the log: nought of however many the plan placed. That is
 * the number "what should I run next" is answered from.
 *
 * **And deleting the row is not enough**, which a first fix found the hard
 * way: `startDates` still held the entry, and `reconstructBlocks` rebuilds a
 * row from it on the next hydrate. The block came straight back, with an
 * `endedAt` of the block's own last day rather than the day it was cleared.
 * The per-program state is what has to go, and the row with it.
 */

import { getDb, readOr } from './db';
import { hasRealData } from './exportImport';
import { demoClimber, DEMO_SEED } from '@/engine/demoClimber';
import { today as todayKey } from '@/engine/dates';

/**
 * Every program the sample climber leaves state on, for the clear to unpick.
 *
 * Two of them since M282: the catalogue program it runs, and the block it
 * finished before that. Regenerated from the seed like the injuries and
 * objectives below, and safe to key on for the same reason `canLoadDemo`
 * exists — the sample climber only loads into a database with nothing real in
 * it, so an Iron Grip block at clear time is the demo's and not a climber's.
 */
export function demoProgramIds(today = todayKey(), seed = DEMO_SEED): string[] {
  const made = demoClimber(today, seed);
  return [...new Set([made.programId, ...made.blocks.map((b) => b.programId)])];
}

/**
 * The program the sample climber wrote (PLAN.md M282).
 *
 * Beside the injuries and objectives, and for their reason: it lives in a
 * store the tag-per-record wipe cannot reach, so the store that owns it takes
 * it out by id. Which is also why it needs no `demo` flag on `Program` — a
 * fixed id is the marking, and `Program` stays the one shape everything
 * downstream already reads.
 */
export function demoProgram(today = todayKey(), seed = DEMO_SEED) {
  return demoClimber(today, seed).program;
}

/** The blocks it finished before the one it is running. */
export function demoBlocks(today = todayKey(), seed = DEMO_SEED) {
  return demoClimber(today, seed).blocks;
}

/** Profile fields the demo sets, and the only ones the wipe clears. */
export interface DemoProfile {
  programId: string;
  startDate: string;
  injuryId: string;
}

export async function canLoadDemo(): Promise<boolean> {
  // `false` on a database that will not open (PLAN.md M158): Settings asks
  // this on mount beside `hasDemo`, and offering to write sample data into
  // storage that cannot be read would be the wrong answer anyway.
  return await readOr(async () => !(await hasRealData()), false);
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
 * The objectives it would add, for the objectives store to hold
 * (PLAN.md M207).
 *
 * Beside the injuries and for the same reason: neither lives in one of the
 * three stores `loadDemo` writes. They are one array under a key in
 * `profile`, so the tag-per-record wipe above cannot reach them — the store
 * that owns them takes them out by id, which is exactly what it does for an
 * injury.
 */
export function demoObjectives(today = todayKey(), seed = DEMO_SEED) {
  return demoClimber(today, seed).objectives;
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
