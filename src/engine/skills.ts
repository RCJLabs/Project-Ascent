/**
 * Skill trees (PLAN.md §5.6).
 *
 * Every requirement is real training. Nothing in here unlocks from a
 * minigame, a purchase, or a point you spend — the audit called the old
 * app's trees "the best log→character bridge in the app" precisely because
 * of that, and the one change here is that the effects now only grant
 * things that exist.
 *
 * There are no skill points. A node is unlocked because you did the thing,
 * which makes the tree a map of your training rather than a shop. That also
 * means it can never be out of step with the log: nothing is stored.
 */

import { getMetric } from '@/content/metrics';
import type { DrillCategory, MetricId } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import { seriesFor } from './assessments';
import type { ClimberState } from './derive';
import { DEFAULT_DISPLAY, displayGrade, gradeOrdinal, type GradeDisplay, type GradeScale } from './grades';
import type { Stat, StatId } from './stats';

export type TreeId = 'power' | 'tension' | 'endurance' | 'technique' | 'grit';

export type SkillRequirement =
  | { kind: 'level'; level: number }
  | { kind: 'sessions'; count: number }
  | { kind: 'hours'; hours: number }
  | { kind: 'sends'; scale: GradeScale; grade: string; count: number }
  | { kind: 'style-sends'; style: 'onsight' | 'flash'; count: number }
  | { kind: 'grade-variety'; count: number }
  | { kind: 'drills'; category: DrillCategory; count: number }
  | { kind: 'streak-weeks'; weeks: number }
  | { kind: 'outdoor-days'; count: number }
  | { kind: 'projects-sent'; count: number }
  | { kind: 'rest-days'; count: number }
  | { kind: 'height'; feet: number }
  | { kind: 'metric'; metricId: MetricId; atLeast: number }
  | { kind: 'metric-under'; metricId: MetricId; atMost: number }
  | { kind: 'stat'; stat: StatId; atLeast: number };

/**
 * Effects, pruned to systems that exist. `ascent-boon` is the exception: the
 * arcade game is M5, so those nodes declare their effect and it stays inert
 * until the game reads it. Declaring them now beats renumbering the trees
 * later.
 */
export type SkillEffect =
  | { kind: 'project-slot'; extra: number }
  | { kind: 'bounty-slot'; extra: number }
  | { kind: 'warmup-variety'; extra: number }
  | { kind: 'rest-recovery'; bonus: number }
  | { kind: 'cosmetic'; id: string; label: string }
  | { kind: 'ascent-boon'; id: string; label: string };

export interface SkillNode {
  id: string;
  tree: TreeId;
  tier: number;
  branch: string;
  name: string;
  requirement: SkillRequirement;
  effect?: SkillEffect;
}

export interface SkillTree {
  id: TreeId;
  name: string;
  blurb: string;
  nodes: SkillNode[];
}

// ── Measuring ─────────────────────────────────────────────────────────────

export interface SkillInput {
  state: ClimberState;
  stats?: Record<StatId, Stat>;
  metrics?: MetricEntry[];
  projects?: Project[];
  level?: number;
  feet?: number;
  /** Notation to write grades in. Defaults to the stored ladders. */
  display?: GradeDisplay;
}

export interface Measurement {
  current: number;
  target: number;
  met: boolean;
  /** What the requirement asks for, in words. */
  detail: string;
  /**
   * Units still to do, zero once met. Usually `target - current` — but not
   * always, and `streak-weeks` is the exception that makes the field worth
   * having rather than deriving.
   */
  short: number;
  /** `short` in the requirement's own words, or '' once it is met. */
  remaining: string;
}

function metricValue(input: SkillInput, id: MetricId): number | null {
  return seriesFor(input.metrics ?? [], id).at(-1)?.value ?? null;
}

/** The registry's own label, so a requirement never says "max hang 20mm 7s". */
function metricLabel(id: MetricId): string {
  return getMetric(id)?.label ?? id.replace(/_/g, ' ');
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

function trim(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

/**
 * The target in words, and the gap in words.
 *
 * `detail` says what the node asks for; `remaining` says what is left. Both,
 * because they answer different questions — the tree wants the requirement
 * and the one-line prompt on Home wants "two more days on rock". Quoting the
 * requirement where the gap belongs is what the old prompt did, and it is
 * why nothing in the app ever told a climber how close they were.
 */
export function measure(requirement: SkillRequirement, input: SkillInput): Measurement {
  const s = input.state;
  const display = input.display ?? DEFAULT_DISPLAY;
  const done = (
    current: number,
    target: number,
    detail: string,
    gap: (short: number) => string,
    /** Where to count the gap from, when that is not where progress stands. */
    shortFrom: number = current,
  ): Measurement => {
    const met = current >= target;
    const short = met ? 0 : Math.max(0, target - shortFrom);
    return { current, target, met, detail, short, remaining: short > 0 ? gap(short) : '' };
  };

  switch (requirement.kind) {
    case 'level':
      return done(
        input.level ?? 0,
        requirement.level,
        `Reach level ${requirement.level}`,
        (n) => `${n} more ${plural(n, 'level')}`,
      );
    case 'sessions':
      return done(
        s.completedSessions,
        requirement.count,
        `Log ${requirement.count} ${plural(requirement.count, 'session')}`,
        (n) => `${n} more ${plural(n, 'session')}`,
      );
    case 'hours':
      return done(
        Math.floor(s.totalMinutes / 60),
        requirement.hours,
        `Climb ${requirement.hours} ${plural(requirement.hours, 'hour')}`,
        (n) => `${n} more ${plural(n, 'hour')}`,
      );
    case 'sends': {
      const tally = requirement.scale === 'V' ? s.boulder : s.sport;
      const floor = gradeOrdinal(requirement.scale, requirement.grade);
      const current = Object.entries(tally.sends)
        .filter(([grade]) => gradeOrdinal(requirement.scale, grade) >= floor)
        .reduce((sum, [, n]) => sum + n, 0);
      const shown = displayGrade(requirement.scale, requirement.grade, display);
      return done(
        current,
        requirement.count,
        `Send ${requirement.count} at ${shown} or harder`,
        (n) => `${n} more at ${shown} or harder`,
      );
    }
    case 'style-sends': {
      const current = s.styleSends[requirement.style];
      const word = requirement.style === 'onsight' ? 'on-sight' : 'flash';
      const many = requirement.style === 'onsight' ? 'on-sights' : 'flashes';
      return done(
        current,
        requirement.count,
        `${cap(word)} ${requirement.count} ${plural(requirement.count, 'climb')}`,
        (n) => `${n} more ${plural(n, word, many)}`,
      );
    }
    case 'grade-variety': {
      const current = Object.keys(s.boulder.sends).length + Object.keys(s.sport.sends).length;
      return done(
        current,
        requirement.count,
        `Send ${requirement.count} different ${plural(requirement.count, 'grade')}`,
        (n) => `${n} more ${plural(n, 'grade')} you have not sent`,
      );
    }
    case 'drills': {
      const current = s.drillsByCategory[requirement.category] ?? 0;
      const category = requirement.category.replace('-', ' ');
      return done(
        current,
        requirement.count,
        `Complete ${requirement.count} ${category} ${plural(requirement.count, 'drill')}`,
        (n) => `${n} more ${category} ${plural(n, 'drill')}`,
      );
    }
    case 'streak-weeks':
      // Counted from the streak you are *on*, not your best one. A broken
      // streak starts over, so telling a climber whose record is behind them
      // that they are "two weeks away" would be false — their best is two
      // weeks away, and they are sixteen.
      return done(
        s.longestStreakWeeks,
        requirement.weeks,
        `Hit your weekly target ${requirement.weeks} ${plural(requirement.weeks, 'week')} running`,
        (n) => `${n} more ${plural(n, 'week')} in a row`,
        s.streakWeeks,
      );
    case 'outdoor-days':
      return done(
        s.outdoorDays,
        requirement.count,
        `Climb outdoors on ${requirement.count} ${plural(requirement.count, 'day')}`,
        (n) => `${n} more ${plural(n, 'day')} on rock`,
      );
    case 'projects-sent': {
      const current = (input.projects ?? []).filter((p) => p.status === 'sent').length;
      return done(
        current,
        requirement.count,
        `Send ${requirement.count} tracked ${plural(requirement.count, 'project')}`,
        (n) => `${n} more tracked ${plural(n, 'project')}`,
      );
    }
    case 'rest-days':
      return done(
        s.restSessions,
        requirement.count,
        `Log ${requirement.count} rest ${plural(requirement.count, 'day')}`,
        (n) => `${n} more rest ${plural(n, 'day')}`,
      );
    case 'height':
      return done(
        Math.round(input.feet ?? 0),
        requirement.feet,
        `Climb ${requirement.feet.toLocaleString()} ft on the altimeter`,
        (n) => `${n.toLocaleString()} more ft`,
      );
    case 'metric': {
      const current = metricValue(input, requirement.metricId);
      const label = metricLabel(requirement.metricId);
      return done(
        current ?? 0,
        requirement.atLeast,
        `Reach ${requirement.atLeast} on ${label}`,
        (n) => `${trim(n)} more on ${label}`,
      );
    }
    case 'metric-under': {
      const current = metricValue(input, requirement.metricId);
      // Lower is better, so progress is the distance closed rather than the
      // raw number — a bar that fills as the measurement drops.
      const met = current !== null && current <= requirement.atMost;
      const detail = `Get ${metricLabel(requirement.metricId)} to ${requirement.atMost} or under`;
      return {
        current: met ? 1 : 0,
        target: 1,
        met,
        detail,
        short: met ? 0 : 1,
        // Reduced to met-or-not above, so there is no gap left to quote and
        // the target is the whole of what can honestly be said.
        remaining: met ? '' : detail,
      };
    }
    case 'stat': {
      const current = input.stats?.[requirement.stat]?.value ?? 0;
      return done(
        current,
        requirement.atLeast,
        `Reach ${requirement.stat} ${requirement.atLeast}`,
        (n) => `${n} more ${requirement.stat}`,
      );
    }
  }
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── Evaluation ────────────────────────────────────────────────────────────

export interface SkillProgress {
  node: SkillNode;
  unlocked: boolean;
  measurement: Measurement;
  /** True when the requirement is met but an earlier node in the branch is not. */
  blocked: boolean;
}

export interface SkillTreeState {
  id: TreeId;
  name: string;
  blurb: string;
  nodes: SkillProgress[];
  unlocked: number;
  total: number;
}

export interface SkillEffects {
  projectSlots: number;
  bountySlots: number;
  warmupVariety: number;
  restRecovery: number;
  cosmetics: { id: string; label: string }[];
  ascentBoons: { id: string; label: string }[];
}

export interface SkillState {
  trees: SkillTreeState[];
  unlocked: number;
  total: number;
  effects: SkillEffects;
}

const EMPTY_EFFECTS = (): SkillEffects => ({
  projectSlots: 0,
  bountySlots: 0,
  warmupVariety: 0,
  restRecovery: 0,
  cosmetics: [],
  ascentBoons: [],
});

/**
 * A node unlocks when its own requirement is met and every node before it in
 * its branch is unlocked. Thresholds inside a branch climb, so the ordering
 * rule almost never bites — it exists so a node can never light up because a
 * one-off assessment was entered out of order.
 */
export function evaluateSkills(trees: SkillTree[], input: SkillInput): SkillState {
  const treeStates: SkillTreeState[] = [];
  const effects = EMPTY_EFFECTS();
  let unlockedTotal = 0;
  let total = 0;

  for (const tree of trees) {
    const byBranch = new Map<string, SkillNode[]>();
    for (const node of tree.nodes) {
      const list = byBranch.get(node.branch) ?? [];
      list.push(node);
      byBranch.set(node.branch, list);
    }

    const results = new Map<string, SkillProgress>();
    for (const [, branchNodes] of byBranch) {
      const ordered = [...branchNodes].sort((a, b) => a.tier - b.tier);
      let previousUnlocked: boolean = true;
      for (const node of ordered) {
        const measurement = measure(node.requirement, input);
        const unlocked: boolean = measurement.met && previousUnlocked;
        results.set(node.id, {
          node,
          unlocked,
          measurement,
          blocked: measurement.met && !previousUnlocked,
        });
        previousUnlocked = unlocked;
      }
    }

    const nodes: SkillProgress[] = tree.nodes.map((n) => results.get(n.id)!);
    const unlocked: number = nodes.filter((n) => n.unlocked).length;
    unlockedTotal += unlocked;
    total += nodes.length;

    for (const entry of nodes) {
      if (entry.unlocked) applyEffect(effects, entry.node.effect);
    }

    treeStates.push({
      id: tree.id,
      name: tree.name,
      blurb: tree.blurb,
      nodes,
      unlocked,
      total: nodes.length,
    });
  }

  // What is closest to unlocking is `nextUnlock.ts`, not a second list here:
  // ranking by how much of a requirement is done put a *blocked* node first
  // (ratio ≥ 1, and unreachable until the rung below it lights up) and put a
  // stat capstone three points away ahead of one more day on rock.
  return { trees: treeStates, unlocked: unlockedTotal, total, effects };
}

function applyEffect(effects: SkillEffects, effect: SkillEffect | undefined): void {
  if (!effect) return;
  switch (effect.kind) {
    case 'project-slot':
      effects.projectSlots += effect.extra;
      break;
    case 'bounty-slot':
      effects.bountySlots += effect.extra;
      break;
    case 'warmup-variety':
      effects.warmupVariety += effect.extra;
      break;
    case 'rest-recovery':
      effects.restRecovery += effect.bonus;
      break;
    case 'cosmetic':
      effects.cosmetics.push({ id: effect.id, label: effect.label });
      break;
    case 'ascent-boon':
      effects.ascentBoons.push({ id: effect.id, label: effect.label });
      break;
  }
}

/** What an effect does, in words, for the node card. */
export function describeEffect(effect: SkillEffect): string {
  switch (effect.kind) {
    case 'project-slot':
      return `+${effect.extra} active project slot`;
    case 'bounty-slot':
      return `+${effect.extra} bounty slot`;
    case 'warmup-variety':
      return `+${effect.extra} warmup exercises to draw from`;
    case 'rest-recovery':
      return `Rest days recover ${Math.round(effect.bonus * 100)}% more`;
    case 'cosmetic':
      return `Unlocks ${effect.label}`;
    case 'ascent-boon':
      return `The Ascent: ${effect.label}`;
  }
}
