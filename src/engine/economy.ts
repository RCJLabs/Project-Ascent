/**
 * The economy: what an action is worth, and what a total makes you.
 *
 * Two rules from the prototype survive because they were the good ones
 * (AUDIT.md §4): awards are expressed as a *fraction of a level*, so
 * progress stays at the same pace at level 5 and level 50; and real
 * climbing always outpays the game lane, which is capped hard enough that
 * grinding it can never beat training.
 *
 * Everything here is a pure function over a table. The tables are the
 * design — they are meant to be argued with and retuned in one place.
 */

import type { Session } from '@/db/sessions';
import type { AcwrZone } from './derive';
import { vEquivalent, type GradeScale } from './grades';

// ── Levels ────────────────────────────────────────────────────────────────

/** Total XP required to reach a level. Quadratic, so each level is wider
 *  than the last while a level's *worth* in sessions stays constant. */
export function xpForLevel(level: number): number {
  return Math.max(0, level) ** 2 * 100;
}

export function levelFor(xp: number): number {
  return Math.max(0, Math.floor(Math.sqrt(Math.max(0, xp) / 100)));
}

/** XP spanned by one level at `level` — the unit every award is priced in. */
export function levelWidth(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level);
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  width: number;
  /** 0..1 through the level. */
  fraction: number;
  toNext: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  const width = levelWidth(level);
  const into = xp - xpForLevel(level);
  return { level, into, width, fraction: width === 0 ? 0 : into / width, toNext: width - into };
}

// ── Ranks ─────────────────────────────────────────────────────────────────

export interface Rank {
  level: number;
  title: string;
}

/** Twenty-four titles to level 100, in the order you actually grow: the
 *  gym, then the rock, then the disciplines, then the long game. */
export const RANKS: Rank[] = [
  { level: 0, title: 'Newcomer' },
  { level: 2, title: 'Gym Regular' },
  { level: 5, title: 'Top Roper' },
  { level: 8, title: 'Boulderer' },
  { level: 12, title: 'Route Reader' },
  { level: 16, title: 'Crimp Apprentice' },
  { level: 20, title: 'Slab Technician' },
  { level: 25, title: 'Roof Climber' },
  { level: 30, title: 'Flash Artist' },
  { level: 35, title: 'Project Hunter' },
  { level: 40, title: 'Onsight Specialist' },
  { level: 45, title: 'Redpoint Specialist' },
  { level: 50, title: 'Crusher' },
  { level: 55, title: 'Highball Veteran' },
  { level: 60, title: 'Granite Local' },
  { level: 65, title: 'Limestone Local' },
  { level: 70, title: 'Grit Veteran' },
  { level: 75, title: 'Alpine Journeyman' },
  { level: 80, title: 'Multipitch Master' },
  { level: 85, title: 'Hard Grit Master' },
  { level: 90, title: 'Boulder Legend' },
  { level: 94, title: 'Rock Legend' },
  { level: 97, title: 'Living Legend' },
  { level: 100, title: 'GOAT' },
];

export function rankFor(level: number): Rank {
  let current = RANKS[0]!;
  for (const rank of RANKS) if (level >= rank.level) current = rank;
  return current;
}

export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.level > level) ?? null;
}

// ── The award table ───────────────────────────────────────────────────────

/**
 * One level's worth of XP, and the only number that sets the pace.
 *
 * PLAN.md prices awards as fractions of a level ("session = 15% of a
 * level"). Read literally — recomputing the fraction against your *current*
 * level every time — the sqrt levelling curve is exactly cancelled and
 * progress becomes linear in levels: three sessions a week reaches level 40
 * inside a year on the session award alone, and level 123 in three. That
 * contradicts the same plan's other stated target, GOAT at level 100 being
 * a multi-year climb.
 *
 * So the fractions below are kept as the *ratios* the plan specifies, and
 * this constant converts them to fixed XP once. Levels then decelerate the
 * way sqrt intends. At 3 sessions a week with ten sends around V4 that is
 * roughly level 43 after a year, 75 after three, 97 after five; a twice-a-
 * week climber sits near 48 at three years. Change this one number to
 * change the whole curve.
 */
export const LEVEL_UNIT = 2000;

/** Every award, as a fraction of one level (see LEVEL_UNIT). */
export const AWARDS = {
  session: 0.15,
  restDay: 0.0375,
  warmup: 0.05,
  drillDone: 0.03,
  /** Per send: a floor plus a slope in V-equivalent grades. */
  sendBase: 0.01,
  sendPerGrade: 0.005,
  personalRecord: 0.5,
  projectSend: 0.4,
} as const;

/**
 * Game-lane actions can never pay more than this fraction of a level.
 * The prototype's rule, kept verbatim: no RPG action > 7.5%, which is half
 * of what showing up and training pays. Grinding the game can never beat
 * climbing, and that is enforced here rather than trusted to tuning.
 */
export const GAME_ACTION_CAP = 0.075;

export const MULTIPLIERS = {
  outdoor: 1.1,
  projectSendOutdoor: 1.5,
  /** Style bonuses on a send, applied to that send only. */
  onsight: 2,
  flash: 1.5,
} as const;

/**
 * Effort multiplier from RPE — braked to 1.0 when load is already spiking.
 *
 * The brake is the honest part of the whole economy: the app will not pay
 * you a bonus for digging the hole deeper, and it says so in the toast.
 */
export function effortMultiplier(rpe: number | undefined, zone: AcwrZone): number {
  if (zone === 'danger' || zone === 'caution') return 1;
  if (rpe === undefined) return 1;
  if (rpe >= 10) return 1.5;
  if (rpe >= 8) return 1.2;
  if (rpe >= 7) return 1.15;
  return 1;
}

/** Consecutive sessions with the week's drill completed. */
export function drillStreakMultiplier(streak: number): number {
  if (streak >= 8) return 1.2;
  if (streak >= 5) return 1.15;
  if (streak >= 3) return 1.1;
  return 1;
}

// ── Session awards ────────────────────────────────────────────────────────

export type AwardSource = 'real' | 'game';

export interface Award {
  /** Stable within a session, so a list can be keyed and diffed. */
  id: string;
  label: string;
  /** Fraction of a level, before multipliers. */
  units: number;
  source: AwardSource;
  /** Multiplier applied to this award alone (style bonuses). */
  own?: number;
}

export interface SessionContext {
  /** ACWR zone as of this session's date, not today's. */
  zone: AcwrZone;
  /** Consecutive drill-completed sessions ending at this one. */
  drillStreak: number;
  /** Grades that are a personal record on their ladder, first time only. */
  records?: { scale: GradeScale; grade: string }[];
}

export interface SessionReward {
  awards: Award[];
  /** The stack applied to the session's own awards. */
  multiplier: number;
  effort: number;
  drill: number;
  outdoor: number;
  /** True when a bonus was withheld because load was already high. */
  effortBraked: boolean;
}

/**
 * What one session is worth, itemised.
 *
 * Itemised on purpose: the reward moment shows the climber every line,
 * because a number that appears without a reason is the part of
 * gamification that stops meaning anything.
 */
export function sessionReward(session: Session, context: SessionContext): SessionReward {
  const awards: Award[] = [];

  if (session.restChecklist !== undefined && session.climbs.length === 0) {
    awards.push({ id: 'rest', label: 'Rest day logged', units: AWARDS.restDay, source: 'real' });
  } else {
    awards.push({ id: 'session', label: 'Session completed', units: AWARDS.session, source: 'real' });
    if (session.warmup) {
      awards.push({ id: 'warmup', label: 'Warmed up', units: AWARDS.warmup, source: 'real' });
    }
    if (session.drillDone) {
      awards.push({ id: 'drill', label: 'Drill completed', units: AWARDS.drillDone, source: 'real' });
    }
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      const v = vEquivalent(climb.scale, climb.grade);
      if (v < 0) continue;
      const own =
        climb.style === 'onsight'
          ? MULTIPLIERS.onsight
          : climb.style === 'flash'
            ? MULTIPLIERS.flash
            : 1;
      awards.push({
        id: `send-${climb.id}`,
        label:
          `${climb.count}× ${climb.grade}` +
          (climb.style === 'onsight' ? ' on-sight' : climb.style === 'flash' ? ' flashed' : ''),
        units: (AWARDS.sendBase + AWARDS.sendPerGrade * v) * climb.count,
        source: 'real',
        ...(own === 1 ? {} : { own }),
      });
    }
  }

  for (const record of context.records ?? []) {
    awards.push({
      id: `pr-${record.scale}-${record.grade}`,
      label: `First ${record.grade}`,
      units: AWARDS.personalRecord,
      source: 'real',
    });
  }

  const effortBraked = context.zone === 'danger' || context.zone === 'caution';
  const effort = effortMultiplier(session.rpe, context.zone);
  const drill = drillStreakMultiplier(context.drillStreak);
  const outdoor = session.mode === 'outdoor' ? MULTIPLIERS.outdoor : 1;

  return {
    awards,
    effort,
    drill,
    outdoor,
    multiplier: effort * drill * outdoor,
    effortBraked: effortBraked && (session.rpe ?? 0) >= 7,
  };
}

/** Convert a fraction-of-a-level award into XP. */
export function unitsToXp(units: number): number {
  return Math.round(units * LEVEL_UNIT);
}
