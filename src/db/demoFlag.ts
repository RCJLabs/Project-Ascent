/**
 * Is the sample climber loaded? (PLAN.md M110)
 *
 * Its own module, and this small, because `DemoBanner` asks it on every
 * page and the banner lives in `AppShell`, which is eager. Importing it
 * from `db/demo.ts` pulled the generator — the RNG, the year of sessions,
 * the programs it reads — into the entry chunk, and cost **4.3KB of first
 * load to every climber who never touches sample data.**
 *
 * Nothing here but a count over three stores.
 */

import { getDb, readOr } from './db';

/**
 * True when anything in the database is tagged as sample data.
 *
 * False when the database will not open, rather than a rejection nobody
 * catches: `DemoBanner` asks this in an effect on **every page**, so this
 * was the one that fired on the boot screen of a `VersionError` (PLAN.md
 * M158). A log that cannot be read is not sample data, and the climber is
 * already being told why it cannot be read.
 */
export async function hasDemo(): Promise<boolean> {
  return await readOr(async () => {
    const db = await getDb();
    for (const store of ['sessions', 'projects', 'metrics'] as const) {
      const rows = (await db.getAll(store)) as { demo?: true }[];
      if (rows.some((r) => r.demo === true)) return true;
    }
    return false;
  }, false);
}
