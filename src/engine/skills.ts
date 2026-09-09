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
import { gradeOrdinal, type GradeScale } from './grades';
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
}

export interface Measurement {
  current: number;
  target: number;
  met: boolean;
  /** What the requirement asks for, in words. */
  detail: string;
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

export function measure(requirement: SkillRequirement, input: SkillInput): Measurement {
  const s = input.state;
  const done = (current: number, target: number, detail: string): Measurement => ({
    current,
    target,
    met: current >= target,
    detail,
  });

  switch (requirement.kind) {
    case 'level':
      return done(input.level ?? 0, requirement.level, `Reach level ${requirement.level}`);
    case 'sessions':
      return done(s.completedSessions, requirement.count, `Log ${requirement.count} ${plural(requirement.count, 'session')}`);
    case 'hours':
      return done(Math.floor(s.totalMinutes / 60), requirement.hours, `Climb ${requirement.hours} ${plural(requirement.hours, 'hour')}`);
    case 'sends': {
      const tally = requirement.scale === 'V' ? s.boulder : s.sport;
      const floor = gradeOrdinal(requirement.scale, requirement.grade);
      const current = Object.entries(tally.sends)
        .filter(([grade]) => gradeOrdinal(requirement.scale, grade) >= floor)
        .reduce((sum, [, n]) => sum + n, 0);
      return done(current, requirement.count, `Send ${requirement.count} at ${requirement.grade} or harder`);
    }
    case 'style-sends': {
      const current = s.styleSends[requirement.style];
      const word = requirement.style === 'onsight' ? 'on-sight' : 'flash';
      return done(current, requirement.count, `${cap(word)} ${requirement.count} ${plural(requirement.count, 'climb')}`);
    }
    case 'grade-variety': {
      const current = Object.keys(s.boulder.sends).length + Object.keys(s.sport.sends).length;
      return done(current, requirement.count, `Send ${requirement.count} different ${plural(requirement.count, 'grade')}`);
    }
    case 'drills': {
      const current = s.drillsByCategory[requirement.category] ?? 0;
      return done(current, requirement.count, `Complete ${requirement.count} ${requirement.category.replace('-', ' ')} ${plural(requirement.count, 'drill')}`);
    }
    case 'streak-weeks':
      return done(s.longestStreakWeeks, requirement.weeks, `Hit your weekly target ${requirement.weeks} ${plural(requirement.weeks, 'week')} running`);
    case 'outdoor-days':
      return done(s.outdoorDays, requirement.count, `Climb outdoors on ${requirement.count} ${plural(requirement.count, 'day')}`);
    case 'projects-sent': {
      const current = (input.projects ?? []).filter((p) => p.status === 'sent').length;
      return done(current, requirement.count, `Send ${requirement.count} tracked ${plural(requirement.count, 'project')}`);
    }
    case 'rest-days':
      return done(s.restSessions, requirement.count, `Log ${requirement.count} rest ${plural(requirement.count, 'day')}`);
    case 'height':
      return done(Math.round((input.feet ?? 0)), requirement.feet, `Climb ${requirement.feet.toLocaleString()} ft on the altimeter`);
    case 'metric': {
      const current = metricValue(input, requirement.metricId);
      return done(current ?? 0, requirement.atLeast, `Reach ${requirement.atLeast} on ${metricLabel(requirement.metricId)}`);
    }
    case 'metric-under': {
      const current = metricValue(input, requirement.metricId);
      // Lower is better, so progress is the distance closed rather than the
      // raw number — a bar that fills as the measurement drops.
      const met = current !== null && current <= requirement.atMost;
      return {
        current: met ? 1 : 0,
        target: 1,
        met,
        detail: `Get ${metricLabel(requirement.metricId)} to ${requirement.atMost} or under`,
      };
    }
    case 'stat': {
      const current = input.stats?.[requirement.stat]?.value ?? 0;
      return done(current, requirement.atLeast, `Reach ${requirement.stat} ${requirement.atLeast}`);
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
  /** The closest unlocks that are not yet met, nearest first. */
  next: SkillProgress[];
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
  const pending: SkillProgress[] = [];

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
      else pending.push(entry);
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

  // Nearest first, by how much of the requirement is already done.
  const next = pending
    .filter((p) => p.measurement.target > 0)
    .sort(
      (a, b) =>
        b.measurement.current / b.measurement.target - a.measurement.current / a.measurement.target,
    )
    .slice(0, 5);

  return { trees: treeStates, unlocked: unlockedTotal, total, effects, next };
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
