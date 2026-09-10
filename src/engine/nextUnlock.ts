import { BASE_STAT } from './stats';
import type { Measurement, SkillNode, SkillProgress, SkillRequirement, SkillState } from './skills';

/**
 * The one thing closest to unlocking (PLAN.md M29).
 *
 * There are 130 skill nodes and they were reachable from one page. The
 * character page did carry a "Closest:" line, but it quoted the requirement
 * — *Send 3 at V5 or harder* — and never the gap, so the app could tell a
 * climber what a node wanted and never that they were one send away. It also
 * ranked by how much of the requirement was done, which is wrong twice over:
 *
 * - A **blocked** node — requirement met, rung below it still locked — is at
 *   ratio 1 and sorts to the top. A climber with twelve V6s and no V4s was
 *   told the closest thing was "Send 12 at V6 or harder", which they had
 *   already done and which could not unlock until the V4 rung did.
 * - A fraction rewards a big requirement you are mostly through. A real
 *   year-long log ranked *Reach END 70* (67/70, a capstone, and not
 *   something you can go and do) above *2 more days on rock* and *one more
 *   grade you have not sent*.
 *
 * So: only reachable nodes, ranked by what is left to do rather than what
 * fraction is behind you.
 */

export interface NextUnlock {
  node: SkillNode;
  measurement: Measurement;
  /** What is left, in the requirement's own words. */
  remaining: string;
  /** Ordering weight. Never shown — see `EFFORT`. */
  effort: number;
}

/**
 * Roughly what one unit of each requirement costs, in sessions of training.
 *
 * **This is an ordering device, not a forecast**, and nothing built on it may
 * say "three weeks away". Two rows are measured from the app's own
 * arithmetic over a year-long log — 1.5 hours and 113 ft per logged session,
 * so 0.67 and 0.009 — and the rest are judgement: a day on rock is rarer
 * than a gym session, a tracked project is a season's work, rest days
 * accumulate whether you chase them or not.
 *
 * The last two rows read differently: an assessment number has arbitrary
 * units (kilos, seconds, millimetres) and a gap of 7 means nothing next to a
 * gap of 7 sessions, so for those the weight is the cost of the **whole**
 * requirement and it is scaled by the fraction still to close.
 */
export const EFFORT: Record<SkillRequirement['kind'], number> = {
  sessions: 1,
  hours: 0.67,
  sends: 0.5,
  'style-sends': 0.5,
  'grade-variety': 3,
  drills: 1,
  'streak-weeks': 3,
  'outdoor-days': 5,
  'projects-sent': 8,
  'rest-days': 0.5,
  height: 0.009,
  level: 4,
  stat: 5,
  metric: 60,
  'metric-under': 60,
};

/** The two kinds whose weight is the whole requirement rather than a unit. */
const WHOLE: SkillRequirement['kind'][] = ['metric', 'metric-under'];

export function effortFor(node: SkillNode, measurement: Measurement): number {
  const weight = EFFORT[node.requirement.kind];
  if (WHOLE.includes(node.requirement.kind)) {
    const closed =
      measurement.target <= 0
        ? 1
        : Math.min(1, Math.max(0, measurement.current / measurement.target));
    return (1 - closed) * weight;
  }
  return measurement.short * weight;
}

/**
 * Progress the climber actually earned.
 *
 * Every stat starts at `BASE_STAT` so that a maxed one lands on exactly 100
 * by construction, which means a raw `current` of 10 is a floor the app
 * handed out rather than training anyone did. Counted as progress it made a
 * *capstone* the closest thing to unlocking for a climber with an empty log:
 * "60 more END", three hundred sessions of work, offered as a first step.
 */
function earned(node: SkillNode, measurement: Measurement): number {
  return node.requirement.kind === 'stat'
    ? measurement.current - BASE_STAT
    : measurement.current;
}

/**
 * The first locked node in every branch — the only nodes that can unlock next.
 *
 * A branch is a ladder, so everything above the first locked rung is gated
 * behind it however close its own numbers look. This also removes the
 * blocked nodes for free: a first locked rung has every rung below it
 * unlocked, so if its requirement were met it would be unlocked itself.
 */
export function reachable(state: SkillState): SkillProgress[] {
  const out: SkillProgress[] = [];
  for (const tree of state.trees) {
    const branches = new Map<string, SkillProgress[]>();
    for (const entry of tree.nodes) {
      branches.set(entry.node.branch, [...(branches.get(entry.node.branch) ?? []), entry]);
    }
    for (const [, entries] of branches) {
      const first = [...entries]
        .sort((a, b) => a.node.tier - b.node.tier)
        .find((entry) => !entry.unlocked);
      if (first) out.push(first);
    }
  }
  return out;
}

/**
 * Nearest first, among the things you have actually started.
 *
 * Least-work-remaining on its own picks the cheapest *first rung* anywhere in
 * the 130, and a first rung with a threshold of one is cheaper than anything
 * a climber is genuinely close to. Ranked that way, a climber 150 sessions
 * deep got the same line as one who had logged nothing — *1 more on-sight* —
 * and would go on getting it forever, because plenty of climbers log grades
 * and never touch the on-sight chip or run a program's drills.
 *
 * A zero is evidence: either you do not do that thing or you do not log it,
 * and in both cases it is a poor thing to point at. So the pull comes from
 * requirements with something already on them, and the untouched ones are
 * the fallback for a climber who has not started anything yet.
 *
 * Ties break to the lower tier and then the node id, so the order is stable
 * across renders — a prompt that reshuffles between two equally-close nodes
 * reads as noise rather than as a target.
 */
export function nextUnlocks(state: SkillState, limit = 3): NextUnlock[] {
  const all = reachable(state)
    .filter((entry) => entry.measurement.target > 0 && entry.measurement.remaining !== '')
    .map((entry) => ({
      node: entry.node,
      measurement: entry.measurement,
      remaining: entry.measurement.remaining,
      effort: effortFor(entry.node, entry.measurement),
    }));

  const started = all.filter((entry) => earned(entry.node, entry.measurement) > 0);
  const pool = started.length > 0 ? started : all;

  return pool
    .sort(
      (a, b) =>
        a.effort - b.effort || a.node.tier - b.node.tier || a.node.id.localeCompare(b.node.id),
    )
    .slice(0, limit);
}

/**
 * Just the one.
 *
 * The plan is explicit that this stays singular: a list of five things you
 * are nearly at is a chore, and the pull comes from there being one.
 */
export function nextUnlock(state: SkillState): NextUnlock | null {
  return nextUnlocks(state, 1)[0] ?? null;
}

/** The whole prompt, in one line. */
export function describeNext(next: NextUnlock | null): string {
  if (!next) return 'Every skill unlocked.';
  return `${cap(next.remaining)} and ${next.node.name} unlocks.`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
