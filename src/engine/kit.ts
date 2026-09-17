/**
 * What the log says you can train on (PLAN.md M236).
 *
 * `Equipment` is six strings — `none | wall | hangboard | campus | gym |
 * weight` — and the climber answers once, at onboarding, from a list. It is
 * a capability rather than a thing owned, which is right; what was missing is
 * that **the app never looked at it again**, and never once compared it to
 * what the climber actually did.
 *
 * ## What that costs, measured
 *
 * The default kit is `['wall', 'gym']`. Five of the thirteen programs require
 * a hangboard — Gravity Defied, Lockdown, Iron Grip, Peak Performance and The
 * Siege, which is most of the serious finger work the app ships — and in
 * `finder.ts` a missing requirement is a **blocker**: the program sorts last
 * and reads *"Needs a hangboard you do not have access to."*
 *
 * So every fresh install starts with those five turned away, and the only way
 * out is opening Settings and knowing to look. Meanwhile nothing stops a
 * climber *running* one: `startProgram` has no kit check at all. The app will
 * schedule Iron Grip, log its hangboard sessions, chart the max hangs — and
 * go on telling them in the finder that they have no hangboard.
 *
 * ## The evidence, and why each piece is the app's own claim
 *
 * Nothing here is inferred from prose. Every source is a table the app
 * already authored for another purpose:
 *
 * - **The program you are running.** `program.equipment` is what the
 *   catalogue says the block needs. Running it is the strongest statement a
 *   climber can make about their kit, and it is one the app acted on.
 * - **A benchmark you recorded.** `BENCHMARKS` in `onboarding.ts` carries
 *   `requires` per prompt, which is how the battery already hides a max hang
 *   from a climber with no board. The same field, read the other way.
 * - **A drill you completed.** `drill.equipment`, cleaned up at M39 so a tag
 *   means what the drill makes you *do* rather than what its rationale
 *   mentions. Only three drills declare a board, so this is the weakest of
 *   the three — kept because it costs nothing and is occasionally the only
 *   one a climber has.
 *
 * ## It offers and never decides
 *
 * The climber's answer is the climber's. They may have moved gym, sold the
 * board, or be logging sessions done at a friend's. So this returns evidence
 * and a sentence, and the only thing that writes `equipment` is a tap in
 * Settings — which is also why it is one-directional: *used and not declared*
 * is worth raising, and *declared and not used* is a hangboard in a cupboard.
 */

import type { Session } from '@/db/sessions';
import type { MetricEntry } from '@/db/metrics';
import type { Equipment, MetricId, Program } from '@/content/types';
import { getMetric } from '@/content/metrics';
import { getDrill } from '@/content/drills/index';
import { BENCHMARKS } from './onboarding';
import { shortLabel } from './dates';

/**
 * Metrics that cannot be recorded without a board, beyond the battery's own.
 *
 * `BENCHMARKS` is the onboarding battery and is short on purpose — it says so:
 * *"Metrics that only mean something inside a program (repeaters, min edge,
 * density hangs) are left to that program's own assessment schedule."* That is
 * a statement about which questions to ask on day one, not about what the
 * tests need, so the four it leaves out need naming here.
 *
 * Every one is a hang on a 20mm edge by its own description, and
 * `kit.test.ts` holds each entry to that: an id added here whose description
 * never mentions an edge or a board is a guess, and a guess is exactly what
 * this module is not allowed to be.
 */
const EDGE_METRICS: readonly MetricId[] = [
  'repeater_weight',
  'density_hang_bw_20mm',
  'min_edge',
  'dead_hang',
];

/** Metric to the kit it cannot be done without, from both tables. */
export function kitForMetric(metricId: MetricId): Equipment | null {
  const prompt = BENCHMARKS.find((b) => b.metricId === metricId);
  if (prompt?.requires !== undefined) return prompt.requires;
  return EDGE_METRICS.includes(metricId) ? 'hangboard' : null;
}

export interface KitEvidence {
  kit: Equipment;
  /** What in the log says so, in a sentence a climber can check. */
  why: string;
}

export interface KitInput {
  declared: readonly Equipment[];
  sessions: readonly Session[];
  metrics: readonly MetricEntry[];
  /** The program being run, if there is one. */
  program?: Program | undefined;
}

/**
 * Kit the log has used and the profile does not claim, strongest first.
 *
 * At most one entry per kind, and it carries the best evidence rather than
 * all of it: *"Iron Grip asks for one, and you recorded a max hang in March,
 * and you completed Graduation Retest"* is a list nobody reads. One reason a
 * climber can check is the whole job.
 */
export function unclaimedKit(input: KitInput): KitEvidence[] {
  const have = new Set(input.declared);
  const found = new Map<Equipment, string>();

  const note = (kit: Equipment, why: string): void => {
    if (kit === 'none' || have.has(kit) || found.has(kit)) return;
    found.set(kit, why);
  };

  // Strongest first, because the first one to land is the one that is kept.
  for (const kit of input.program?.equipment ?? []) {
    note(kit, `${input.program!.name} asks for one.`);
  }

  // Newest reading first: a max hang last month is a better answer than one
  // from two years ago, and the date is most of what makes it checkable.
  const readings = [...input.metrics].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const entry of readings) {
    const kit = kitForMetric(entry.metricId);
    if (kit === null) continue;
    const label = getMetric(entry.metricId)?.label ?? entry.metricId;
    note(kit, `You recorded a ${label} on ${shortLabel(entry.date)}.`);
  }

  const done = [...input.sessions]
    .filter((s) => s.completed && s.drillDone === true && s.drillId !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const session of done) {
    const drill = getDrill(session.drillId!);
    if (drill === undefined) continue;
    for (const kit of drill.equipment) {
      note(kit, `You completed ${drill.name} on ${shortLabel(session.date)}.`);
    }
  }

  return [...found].map(([kit, why]) => ({ kit, why }));
}

/**
 * What each kit is called, on a chip and in a sentence.
 *
 * Both, here, because they were neither. Settings authored its own five
 * labels inline — *Weights & bands*, *Added weight* — and `finder.ts` has a
 * one-line `equipmentWord` that returns the raw enum for four of the six and
 * a phrase for the fifth, so the same board is a *Hangboard* on one screen
 * and a `hangboard` on another. This is the table both can read.
 *
 * `none` has no chip, because it is the absence of the other five rather
 * than a sixth thing to own, so its label is null and `kit.test.ts` holds it
 * to that.
 */
export const KIT_NAMES: Record<Equipment, { chip: string | null; word: string }> = {
  none: { chip: null, word: 'nothing' },
  wall: { chip: 'Climbing wall', word: 'a climbing wall' },
  hangboard: { chip: 'Hangboard', word: 'a hangboard' },
  campus: { chip: 'Campus board', word: 'a campus board' },
  gym: { chip: 'Weights & bands', word: 'weights and bands' },
  weight: { chip: 'Added weight', word: 'a way to add weight' },
};

/** The five a climber can be asked about, in the order Settings shows them. */
export const KIT_CHIPS: readonly Equipment[] = ['wall', 'hangboard', 'campus', 'gym', 'weight'];

/**
 * What a program asks for that this climber has not got (PLAN.md M251).
 *
 * The rule was written inline in `finder.ts`, where it turns a program away.
 * `ProgramDetailPage` — the screen a climber is on when they actually decide
 * — listed the kit a program needs and never once compared it to theirs, and
 * the comment on those very lines says the fix out loud: *"The finder already
 * refuses a program on this; the page said nothing, so a climber arriving
 * from the catalogue found out at the first fingerboard session."* Half of it
 * was done. One rule now, so the second reader cannot drift from the first.
 *
 * `none` is not kit, so it never counts as missing.
 */
export function missingKit(
  needs: readonly Equipment[],
  have: readonly Equipment[],
): Equipment[] {
  const owned = new Set(have);
  return needs.filter((kit) => kit !== 'none' && !owned.has(kit));
}

/** "a hangboard and a campus board", for a sentence about what is missing. */
export function kitList(kit: readonly Equipment[], join = 'and'): string {
  const names = kit.map((e) => KIT_NAMES[e].word);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${join} ${names[names.length - 1]}`;
}

/**
 * The offer, as one sentence. Null when the log has nothing to add.
 *
 * Written as a question rather than a correction: the app noticed something
 * and the climber decides. *"Your kit is wrong"* would be the app telling a
 * climber about their own life from six sessions of evidence.
 */
export function kitOffer(evidence: readonly KitEvidence[]): string | null {
  if (evidence.length === 0) return null;
  const names = evidence.map((e) => KIT_NAMES[e.kit].word);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  return `Your log has you using ${list}.`;
}
