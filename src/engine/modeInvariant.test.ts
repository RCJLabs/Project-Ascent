import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrograms } from '@/content/programs';
import { newSession, type Session } from '@/db/sessions';
import { applyTemplate, bodyFrom, createTemplate } from './templates';
import { outdoorRepairs, typeIsOutdoor, withDeclaredMode } from './sessionMode';

/**
 * The rule is on the write path now, not only in a migration (PLAN.md M180).
 *
 * ## What the proposal got wrong
 *
 * It named the CSV importer: *"`importCsv.ts:618` sets `mode` only when the
 * file has a mode column; it never reads `SessionType.outdoor`."* True, and
 * **empty** — `importCsv` never writes a `programId` or a `sessionTypeId`
 * either, so there is no declaration for it to read. A spreadsheet row is not
 * logged against a session type at all. That claim is asserted below so the
 * correction is on the record rather than in a commit message.
 *
 * ## What is actually wrong
 *
 * M170 wrote the rule inline in `PreSession.start()` and shipped a one-time
 * migration for the history, guarded by a `meta` flag so it can never run
 * again. Two paths create sessions without going through that handler, and
 * both of them could put back exactly what the migration had just fixed:
 *
 * - **A template.** `bodyFrom` snapshots `session.mode`; `applyTemplate`
 *   stamps that beside a `sessionTypeId`. Templates live in the `profile`
 *   store, which `outdoorRepairs` never walked — it reads the session log. A
 *   template saved from a pre-M170 outdoor session carries `'indoor'` and
 *   recreates the broken record every time it is used, for ever.
 * - **A merge-mode archive import.** Those rows are written to the database
 *   as they came, and the local `meta` still holds the repair flag, so the
 *   boot repair will not look at them. (A *replace* recovers on its own:
 *   `meta` is cleared, a pre-M170 file carries no flag, and `hydrateAll`
 *   re-runs the repair. Half the mechanism was right.)
 *
 * So the rule moved to `newSession`, which is the one constructor every
 * creation path goes through, and to the import that bypasses it.
 */

beforeAll(async () => {
  await loadPrograms();
});

const OUTDOOR = { programId: 'outdoor_climbing', sessionTypeId: 'outdoor_boulder' } as const;
const INDOOR = { programId: 'iron_grip', sessionTypeId: 'fp' } as const;

describe('the measurement the milestone was built on', () => {
  /**
   * Every way a session row reaches the database, and what applies the rule
   * on each.
   *
   * The first draft of this looked for session *literals* — a file pairing
   * `rewarded:` and `climbs:` — and caught `LogPage`, which does neither: it
   * patches an existing session and destructures `createdAt` off one. Field
   * shapes cannot tell a construction from an edit. The **write** can: there
   * are three places a row enters the `sessions` store, and each has to
   * either build it with `newSession` or hand it to `withDeclaredMode`.
   *
   * An edit must do neither, and that is the point of drawing the line here
   * rather than at `putSession`: the chip in the logger writes a climber's
   * correction through the same function, and a rule applied there would
   * overwrite it on every save.
   */
  it('applies the rule at every door into the sessions store', () => {
    const files: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) files.push(path);
      }
    })('src');

    const WRITE = /put\('sessions'|objectStore\('sessions'\)|store === 'sessions'/;
    const writers = files.filter((file) => WRITE.test(readFileSync(file, 'utf8')));
    expect(writers.sort(), 'a new door into the store').toEqual([
      'src/db/demo.ts',
      'src/db/exportImport.ts',
      'src/db/sessions.ts',
    ]);

    // Each door, with the mechanism named. A loop over the three would have
    // read better and said less: they satisfy the rule in three different
    // ways, and `demo.ts` satisfies it by not building its own rows.
    const sessionsDb = readFileSync('src/db/sessions.ts', 'utf8');
    expect(sessionsDb).toMatch(/return withDeclaredMode\(\{/);
    // And `putSession` must *not* apply it, or the chip in the logger would
    // be overwritten on every save. This is the line between creating and
    // editing, and it is the whole reason the rule is not at the store.
    const put = sessionsDb.slice(sessionsDb.indexOf('export async function putSession'));
    expect(put, 'putSession would overwrite a climber correction').not.toMatch(
      /withDeclaredMode/,
    );

    expect(readFileSync('src/db/exportImport.ts', 'utf8')).toMatch(/withDeclaredMode\(record/);

    // The demo writes rows it did not build; `demoClimber` builds them, and
    // builds them with the constructor.
    expect(readFileSync('src/db/demo.ts', 'utf8')).toMatch(/from '@\/engine\/demoClimber'/);
    expect(readFileSync('src/engine/demoClimber.ts', 'utf8')).toMatch(/newSession\(/);
  });

  /**
   * And the claim the proposal made about the CSV importer, which measured
   * out to nothing: a row carries no session type, so there is no
   * declaration to apply.
   */
  it('imports a spreadsheet row against no session type at all', () => {
    const csv = readFileSync('src/engine/importCsv.ts', 'utf8');
    expect(csv).not.toMatch(/sessionTypeId/);
    expect(csv).not.toMatch(/programId/);
  });
});

describe('the rule, wherever a session is made', () => {
  it('stamps the mode off the type the session was logged against', () => {
    expect(newSession('2026-05-04', 0, OUTDOOR).mode).toBe('outdoor');
    expect(newSession('2026-05-04', 0, INDOOR).mode).toBe('indoor');
    expect(newSession('2026-05-04', 0).mode).toBe('indoor');
  });

  /**
   * Over a mode already in the patch, which is the template case and the
   * whole reason this is not simply a default. At creation nobody has been
   * asked about this session, so a mode arriving here was copied from
   * somewhere else.
   */
  it('beats a stale mode carried in with the patch', () => {
    expect(newSession('2026-05-04', 0, { ...OUTDOOR, mode: 'indoor' }).mode).toBe('outdoor');
  });

  /** And never the other way: a declaration cannot make a session indoor. */
  it('never takes a mode away', () => {
    expect(newSession('2026-05-04', 0, { ...INDOOR, mode: 'outdoor' }).mode).toBe('outdoor');
    expect(newSession('2026-05-04', 0, { mode: 'outdoor' }).mode).toBe('outdoor');
  });

  it('is a no-op on a type that declares nothing', () => {
    const plain = { programId: 'iron_grip', sessionTypeId: 'fp', mode: 'indoor' as const };
    expect(withDeclaredMode(plain)).toBe(plain);
    expect(typeIsOutdoor(plain)).toBe(false);
  });

  /**
   * The repair runs the same function rather than a second copy of the
   * filter — the rule `content/authored.test.ts` states for its own sweeps.
   */
  it('is the same rule the one-time repair applies', () => {
    const before = newSession('2026-05-04', 0, { ...OUTDOOR, mode: 'indoor' });
    const stale: Session = { ...before, mode: 'indoor' };
    expect(outdoorRepairs([stale])).toEqual([withDeclaredMode(stale)]);
    expect(outdoorRepairs([withDeclaredMode(stale)]), 'a repaired log repairs again').toEqual([]);
  });
});

describe('the template that used to put it back', () => {
  /**
   * A pre-M170 outdoor session: logged against Outdoor Bouldering, stored as
   * indoor, because at the time nothing wrote the field. Saved as a
   * template, it kept that answer in the `profile` store where the repair
   * never looked.
   */
  const preM170: Session = {
    ...newSession('2026-01-05', 0, INDOOR),
    ...OUTDOOR,
    mode: 'indoor',
    completed: true,
  };

  it('still snapshots what the session said, which is the honest thing', () => {
    expect(bodyFrom(preM170).mode).toBe('indoor');
    expect(bodyFrom(preM170).sessionTypeId).toBe('outdoor_boulder');
  });

  /** And applying it no longer produces the record M170 called broken. */
  it('produces an outdoor session anyway', () => {
    const template = createTemplate(preM170, 'Saturday at the crag');
    const made = applyTemplate(template, '2026-05-09', 0);
    expect(made.sessionTypeId).toBe('outdoor_boulder');
    expect(made.mode, 'the template put the old answer back').toBe('outdoor');
  });

  /** A template from an indoor type is untouched, mode and all. */
  it('leaves an indoor template alone', () => {
    const indoor: Session = { ...newSession('2026-01-05', 0, INDOOR), completed: true };
    const made = applyTemplate(createTemplate(indoor, 'Tuesday fingers'), '2026-05-09', 0);
    expect(made.mode).toBe('indoor');
  });

  /**
   * And a climber who genuinely climbed indoors on an outdoor type can still
   * say so — that is M170's reason for the repair running once, and it holds
   * because the chip writes through `update`, not through creation.
   */
  it('does not stop the logger correcting it afterwards', () => {
    const made = applyTemplate(createTemplate(preM170, 'Crag day'), '2026-05-09', 0);
    const corrected: Session = { ...made, mode: 'indoor' };
    expect(corrected.mode).toBe('indoor');
    // The repair would put it back, which is exactly why it runs once.
    expect(outdoorRepairs([corrected])).toHaveLength(1);
  });
});
