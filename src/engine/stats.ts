/**
 * The five derived stats (PLAN.md §5.6).
 *
 * Every point comes from something you actually did, and the breakdown says
 * which — "STR 34 = base 10 + max hang 12 + hard sends 9 + pull-ups 3". The
 * prototype had the same five stats and roughly these inputs, but stacked
 * ten separate buff sources on top, including achievement bonuses of +10 and
 * +100 to all stats that broke the 0–100 scale outright (AUDIT.md §4). Here
 * there is one table, it sums to exactly 100, and nothing else may touch it.
 *
 * The rates below are a design, not a measurement — the prototype's exact
 * constants are not recoverable. They are collected in one table so they can
 * be argued with and retuned in one place. Each stat's caps sum to 90 over a
 * base of 10, so a maxed stat is 100 by construction, not by clamping.
 *
 * They are deliberately slow. Tuned to reach a cap in months, a stat pins
 * near 90 inside the first season and then says nothing for years; the rates
 * here put a full cap at roughly 200 sessions, 1,000 sends or 40 consistent
 * weeks, so six months of good training reads around the mid-fifties and
 * there is somewhere left to go.
 */

import { getMetric } from '@/content/metrics';
import type { MetricId } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import { seriesFor } from './assessments';
import type { ClimberState } from './derive';

export type StatId = 'STR' | 'END' | 'TEC' | 'MEN' | 'AGI';

export const STAT_LABELS: Record<StatId, { name: string; blurb: string }> = {
  STR: { name: 'Strength', blurb: 'Fingers, pulling power, and the hardest thing you have held.' },
  END: { name: 'Endurance', blurb: 'Time on the wall, volume, and weeks that held together.' },
  TEC: { name: 'Technique', blurb: 'Drills, breadth of grades and styles, and clean first goes.' },
  MEN: { name: 'Mental', blurb: 'History, consistency, projects finished, and days on real rock.' },
  AGI: { name: 'Mobility', blurb: 'Flexibility, shoulder health, and committing to movement.' },
};

export const BASE_STAT = 10;
export const MAX_STAT = 100;

/** −5 TEC when the weekly target is missed with no streak behind it. */
export const RUST_PENALTY = 5;

interface Resolved {
  state: ClimberState;
  metric: (id: MetricId) => number | null;
  projectsSent: number;
}

interface Contributor {
  label: string;
  /** Raw magnitude, in the unit `detail` describes. Null when unmeasured. */
  read: (r: Resolved) => number | null;
  /** Stat points per unit. */
  per: number;
  cap: number;
  unit: string;
}

/**
 * The table. Caps per stat sum to 90; base 10 makes 100.
 */
export const CONTRIBUTORS: Record<StatId, Contributor[]> = {
  STR: [
    { label: 'Max hang', read: (r) => r.metric('max_hang_20mm_7s'), per: 0.5, cap: 30, unit: 'lbs added' },
    { label: 'Weighted pull-up', read: (r) => r.metric('weighted_pullup_3rm'), per: 0.4, cap: 20, unit: 'lbs added' },
    { label: 'Max pull-ups', read: (r) => r.metric('max_pullups'), per: 0.8, cap: 15, unit: 'reps' },
    { label: 'Hardest boulder', read: (r) => nonNegative(r.state.boulder.bestOrdinal), per: 1.6, cap: 25, unit: 'V-grades' },
  ],
  END: [
    { label: 'Sessions logged', read: (r) => r.state.completedSessions, per: 0.125, cap: 25, unit: 'sessions' },
    { label: 'Hours climbing', read: (r) => r.state.totalMinutes / 60, per: 0.08, cap: 20, unit: 'hours' },
    { label: 'ARC duration', read: (r) => r.metric('arc_duration'), per: 0.5, cap: 15, unit: 'min' },
    {
      label: 'Total sends',
      read: (r) => r.state.boulder.totalSends + r.state.sport.totalSends,
      per: 0.015,
      cap: 15,
      unit: 'sends',
    },
    { label: 'Best weekly streak', read: (r) => r.state.longestStreakWeeks, per: 0.5, cap: 15, unit: 'weeks' },
  ],
  TEC: [
    { label: 'Drills completed', read: (r) => r.state.drillsCompleted, per: 0.2, cap: 30, unit: 'drills' },
    { label: 'Grade variety', read: (r) => distinctGrades(r.state), per: 1.5, cap: 20, unit: 'grades sent' },
    {
      // On-sight counts double: doing it with no beta at all is the harder
      // version of the same skill.
      label: 'Clean first goes',
      read: (r) => r.state.styleSends.onsight * 2 + r.state.styleSends.flash,
      per: 0.15,
      cap: 20,
      unit: 'style points',
    },
    {
      label: 'Session types trained',
      read: (r) => Object.keys(r.state.sessionsByType).length,
      per: 3,
      cap: 15,
      unit: 'types',
    },
    { label: 'Warmup habit', read: (r) => r.state.warmupRate, per: 5, cap: 5, unit: 'of sessions' },
  ],
  MEN: [
    { label: 'Weeks logging', read: (r) => r.state.load.daysOfHistory / 7, per: 0.25, cap: 25, unit: 'weeks' },
    { label: 'Best weekly streak', read: (r) => r.state.longestStreakWeeks, per: 0.5, cap: 20, unit: 'weeks' },
    { label: 'Projects sent', read: (r) => r.projectsSent, per: 5, cap: 25, unit: 'projects' },
    { label: 'Days on rock', read: (r) => r.state.outdoorDays, per: 0.25, cap: 20, unit: 'outdoor days' },
  ],
  AGI: [
    { label: 'Flexibility', read: (r) => r.metric('flexibility'), per: 2.5, cap: 25, unit: 'score' },
    {
      // Lower is better here, so the contribution is distance closed.
      label: 'Toe touch',
      read: (r) => {
        const inches = r.metric('toe_touch');
        return inches === null ? null : Math.max(0, 12 - inches);
      },
      per: 1.25,
      cap: 15,
      unit: 'inches closed',
    },
    { label: 'Shoulder screen', read: (r) => r.metric('wall_angel'), per: 10, cap: 10, unit: 'pass' },
    { label: 'Box jump', read: (r) => r.metric('box_jump_height'), per: 0.5, cap: 15, unit: 'inches' },
    {
      label: 'Dynamic climbing',
      read: (r) => r.metric('max_dynamic_grade'),
      per: 1.5,
      cap: 25,
      unit: 'V-grades',
    },
  ],
};

export interface StatContribution {
  label: string;
  points: number;
  /** What produced it, in the climber's own units. Null when unmeasured. */
  detail: string | null;
  cap: number;
}

export interface Stat {
  id: StatId;
  name: string;
  blurb: string;
  value: number;
  contributions: StatContribution[];
  /** Applied after the sum, e.g. Rust. */
  debuff?: { label: string; points: number; note: string };
}

export interface StatsInput {
  state: ClimberState;
  metrics?: MetricEntry[];
  projects?: Project[];
}

export function deriveStats(input: StatsInput): Record<StatId, Stat> {
  const entries = input.metrics ?? [];
  const resolved: Resolved = {
    state: input.state,
    metric: (id) => {
      const latest = seriesFor(entries, id).at(-1);
      if (!latest) return null;
      // A text metric has no numeric meaning, so it contributes nothing.
      return getMetric(id)?.kind === 'text' ? null : latest.value;
    },
    projectsSent: (input.projects ?? []).filter((p) => p.status === 'sent').length,
  };

  const rusted = input.state.streakWeeks === 0 && input.state.completedSessions > 0;

  const out = {} as Record<StatId, Stat>;
  for (const id of Object.keys(CONTRIBUTORS) as StatId[]) {
    const contributions = CONTRIBUTORS[id].map((c) => {
      const amount = c.read(resolved);
      return {
        label: c.label,
        points: amount === null ? 0 : Math.min(c.cap, Math.max(0, amount * c.per)),
        detail: amount === null ? null : `${trim(amount)} ${c.unit}`,
        cap: c.cap,
      };
    });

    const raw = BASE_STAT + contributions.reduce((sum, c) => sum + c.points, 0);
    const debuff =
      id === 'TEC' && rusted
        ? {
            label: 'Rust',
            points: RUST_PENALTY,
            note: 'You missed your weekly target with no streak behind it. It comes back the week you hit it again.',
          }
        : undefined;

    out[id] = {
      id,
      name: STAT_LABELS[id].name,
      blurb: STAT_LABELS[id].blurb,
      value: Math.max(0, Math.min(MAX_STAT, Math.round(raw - (debuff?.points ?? 0)))),
      contributions,
      ...(debuff ? { debuff } : {}),
    };
  }
  return out;
}

function distinctGrades(state: ClimberState): number {
  return Object.keys(state.boulder.sends).length + Object.keys(state.sport.sends).length;
}

function nonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
