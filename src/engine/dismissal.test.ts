import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPrograms } from '@/content/programs';
import type { Session } from '@/db/sessions';
import { BACKUP_RETURN, DOMAIN_RETURN, buildTips, visibleTips, type Tip } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import { diagnose } from './plateau';

/**
 * A dismissal is against a fact, and a fact has to be able to change
 * (PLAN.md M175, M181, M182).
 *
 * `visibleTips` hides a tip while `dismissed[id] === signature`, so the
 * signature *is* the expiry: name the thing that raised the tip and the
 * dismissal lasts exactly as long as that thing does. Twenty-four rules in
 * `coach.ts` do that. Three places did not, and they were one mistake seen
 * from three angles:
 *
 * - **`missingDomains`** signed all five habit gaps `'missing'` — a word, not
 *   a fact. *No rest days logged, ever* waved away in month one never came
 *   back, and those five rules are the ones written for a climber who has
 *   been at it long enough to have a pattern.
 * - **`backupNudge`** signed itself `lastExportAt ?? 'never'`, which re-arms
 *   on the **action it is asking for**. Dismiss it before the first export
 *   and it stays dismissed for as long as there is no export — on the one
 *   rule whose subject is losing everything.
 * - **the safety card** had no fact at all. The other two first-run cards
 *   stop for a reason (`onboardedAt`, a running block); this one showed until
 *   *Got it* and then never again, for the life of the install.
 *
 * The fix is the same each time: say what is being waved away.
 */

beforeAll(async () => {
  await loadPrograms();
});

const DAY = '2026-03-02';

/** A log of `n` completed sessions, every other day, ending on the anchor. */
function log(n: number, patch: Partial<Session> = {}): Session[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${addDays(DAY, -(n - 1 - i) * 2)}#0`,
    date: addDays(DAY, -(n - 1 - i) * 2),
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    drillDone: false,
    climbs: [{ id: `c${i}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
    createdAt: `${DAY}T18:00:00.000Z`,
    updatedAt: `${DAY}T18:00:00.000Z`,
    ...patch,
  }) as Session);
}

function tipsFor(sessions: Session[], extra: Record<string, unknown> = {}): Tip[] {
  const state = deriveClimberState(sessions, { today: DAY });
  return buildTips({
    sessions,
    state,
    diagnosis: diagnose({ sessions, state, today: DAY }),
    projects: [],
    metrics: [],
    today: DAY,
    ...extra,
  } as never);
}

const pick = (sessions: Session[], id: string): Tip | undefined =>
  tipsFor(sessions).find((t) => t.id === id);

/** Waved away at `waved`, does it come back at `later`? */
function returnsBy(id: string, waved: Session[], later: Session[]): boolean {
  const before = pick(waved, id);
  const after = pick(later, id);
  expect(before, `${id} never fired at the wave-away`).toBeDefined();
  expect(after, `${id} never fired later`).toBeDefined();
  return visibleTips([after!], { [id]: before!.signature }).length === 1;
}

describe('a habit gap comes back', () => {
  it('fires for a climber with the habit and not before', () => {
    expect(pick(log(4), 'domain:rest')).toBeUndefined();
    expect(pick(log(14), 'domain:rest')?.headline).toBe('No rest days logged, ever');
  });

  /** The gap is binary; what grows is the log that makes it worth saying. */
  it('signs itself with the training behind it', () => {
    const at14 = pick(log(14), 'domain:rest')!;
    const at40 = pick(log(40), 'domain:rest')!;
    expect(at14.signature).not.toBe('missing');
    expect(at14.signature).not.toBe(at40.signature);
  });

  it('stays away for about a month of training, then returns', () => {
    expect(returnsBy('domain:rest', log(14), log(14 + DOMAIN_RETURN))).toBe(true);
  });

  it('stays away inside that month', () => {
    expect(returnsBy('domain:rest', log(14), log(15))).toBe(false);
  });
});

describe('the backup nudge comes back', () => {
  it('names what is at risk rather than only when it was banked', () => {
    const tip = pick(log(14), 'backup')!;
    expect(tip.headline).toBe('14 sessions logged and never exported');
  });

  /**
   * The failure this milestone is really about: the old signature was
   * `'never'`, and `'never'` stays `'never'` until the climber does the very
   * thing the tip is asking them to do.
   */
  it('does not wait for the export it is asking for', () => {
    const waved = pick(log(14), 'backup')!;
    expect(waved.signature).not.toBe('never');
    expect(returnsBy('backup', log(14), log(14 + BACKUP_RETURN))).toBe(true);
  });

  it('is still quieted by an actual export', () => {
    expect(pick(log(14), 'backup')).toBeDefined();
    const exported = tipsFor(log(14), { lastExportAt: addDays(DAY, -1) }).map((t) => t.id);
    expect(exported).not.toContain('backup');
  });
});

/**
 * And no rule goes back to a signature that cannot change.
 *
 * Two literals are left, and the difference between them and `'missing'` is
 * the whole distinction this milestone turns on: both name a **state the
 * climber is currently in**, which they leave. `'missing'` named the fact
 * that something was absent, which is not a state — it is the word "yes".
 *
 * The spike rule's danger branches read as literals and are not: they are a
 * ternary on the ratio, so the signature carries which zone, and the sweep
 * below sees the expression rather than a constant. That is the shape a
 * signature should have.
 */
describe('no rule signs itself with a word', () => {
  const CONSTANTS: Record<string, string> = {
    "'none'": 'firstSession fires only at zero sessions and stops at one, so the dismissal expires with the first log',
    "'caution'": 'loadSpike: the zone is the state, and the dismissal expires when the ratio leaves it',
  };

  it('has only the constants that are themselves facts', () => {
    const source = readFileSync('src/engine/coach.ts', 'utf8');
    const literals = [...source.matchAll(/signature: ('[^']*')[,\n]/g)].map((m) => m[1]!);
    expect(literals.length, 'nothing matched, so this proves nothing').toBeGreaterThan(0);
    expect([...new Set(literals)].sort()).toEqual(Object.keys(CONSTANTS).sort());
  });

  it('gives each one a reason rather than a line', () => {
    for (const [literal, why] of Object.entries(CONSTANTS)) {
      expect(why.length, literal).toBeGreaterThan(20);
    }
  });
});
