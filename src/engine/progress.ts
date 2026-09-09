/**
 * Progress analytics (PLAN.md §5.9).
 *
 * Pyramids, weekly grade progression, and a linear projection of where the
 * current trend lands. Everything here takes a `ClimberState` or a session
 * list and returns plain data for charting — no rendering decisions.
 */

import type { Session } from '@/db/sessions';
import {
  DEFAULT_DISPLAY,
  V_GRADES,
  YDS_GRADES,
  displayGrade,
  gradeOrdinal,
  type GradeDisplay,
  type GradeScale,
} from './grades';
import { addDays, startOfWeek, today as todayKey } from './dates';
import type { GradeTally } from './derive';

export interface PyramidRow {
  grade: string;
  sends: number;
  attempts: number;
  /** Sends ÷ (sends + attempts). Null when nothing was tried at this grade. */
  conversion: number | null;
}

/**
 * Send counts from the hardest grade downward, including grades with
 * attempts but no sends — those rows are the interesting ones, since a wall
 * of attempts at one grade is exactly what a plateau looks like.
 */
export function pyramid(tally: GradeTally, scale: GradeScale, depth = 8): PyramidRow[] {
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  const touched = new Set([...Object.keys(tally.sends), ...Object.keys(tally.attempts)]);
  if (touched.size === 0) return [];

  const ordinals = [...touched].map((g) => gradeOrdinal(scale, g)).filter((o) => o >= 0);
  const highest = Math.max(...ordinals);
  // Stop at the easiest grade actually climbed. Padding down to V0 would
  // imply a base the climber has never touched, which reads as a gap in
  // ability rather than a gap in the log.
  const lowest = Math.max(Math.min(...ordinals), highest - depth + 1);

  const rows: PyramidRow[] = [];
  for (let ord = highest; ord >= lowest; ord--) {
    const grade = ladder[ord]!;
    const sends = tally.sends[grade] ?? 0;
    const attempts = tally.attempts[grade] ?? 0;
    const total = sends + attempts;
    rows.push({ grade, sends, attempts, conversion: total === 0 ? null : sends / total });
  }
  return rows;
}

export interface WeekPoint {
  /** Sunday date key that starts the week. */
  week: string;
  /** Hardest grade sent that week, as a ladder ordinal. Null if none. */
  ordinal: number | null;
  grade: string | null;
  sends: number;
}

/** Hardest send per week over the last `weeks` weeks, oldest first. */
export function weeklyProgression(
  sessions: Session[],
  scale: GradeScale,
  weeks = 12,
  today = todayKey(),
): WeekPoint[] {
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  const best = new Map<string, { ordinal: number; sends: number }>();

  for (const s of sessions) {
    if (!s.completed) continue;
    const week = startOfWeek(s.date);
    for (const climb of s.climbs) {
      if (climb.scale !== scale || climb.result !== 'send') continue;
      const ord = gradeOrdinal(scale, climb.grade);
      if (ord < 0) continue;
      const entry = best.get(week) ?? { ordinal: -1, sends: 0 };
      best.set(week, { ordinal: Math.max(entry.ordinal, ord), sends: entry.sends + climb.count });
    }
  }

  const points: WeekPoint[] = [];
  const thisWeek = startOfWeek(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(thisWeek, -7 * i);
    const entry = best.get(week);
    points.push({
      week,
      ordinal: entry ? entry.ordinal : null,
      grade: entry ? (ladder[entry.ordinal] ?? null) : null,
      sends: entry?.sends ?? 0,
    });
  }
  return points;
}

export interface Projection {
  /** Ladder ordinals gained per week. */
  slope: number;
  /** Next grade up from the current best. */
  nextGrade: string | null;
  /** Weeks until the trend reaches it, or null when it never does. */
  weeksToNext: number | null;
  /** Plain-language summary, always safe to show. */
  summary: string;
  /** False when there is too little data to say anything. */
  confident: boolean;
}

/**
 * Least-squares fit over weekly best grades.
 *
 * Deliberately conservative: fewer than four weeks with data says nothing,
 * and a flat or negative slope is reported as "holding steady" rather than
 * extrapolated into a date. A projection that promises V7 in 400 weeks is
 * worse than no projection.
 */
export function projectGrade(
  points: WeekPoint[],
  scale: GradeScale,
  display: GradeDisplay = DEFAULT_DISPLAY,
): Projection {
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  const label = (grade: string) => displayGrade(scale, grade, display);
  const known = points
    .map((p, i) => ({ x: i, y: p.ordinal }))
    .filter((p): p is { x: number; y: number } => p.y !== null);

  if (known.length < 4) {
    return {
      slope: 0,
      nextGrade: null,
      weeksToNext: null,
      summary: `Log a few more weeks and a trend will show up here.`,
      confident: false,
    };
  }

  const n = known.length;
  const meanX = known.reduce((s, p) => s + p.x, 0) / n;
  const meanY = known.reduce((s, p) => s + p.y, 0) / n;
  const varX = known.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const cov = known.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const slope = varX === 0 ? 0 : cov / varX;

  const currentOrdinal = Math.max(...known.map((p) => p.y));
  const nextOrdinal = currentOrdinal + 1;
  const nextGrade = ladder[nextOrdinal] ?? null;

  if (slope <= 0.02 || !nextGrade) {
    return {
      slope,
      nextGrade,
      weeksToNext: null,
      summary:
        slope < -0.02
          ? 'Your hardest grades have eased off lately — worth a look at recovery.'
          : 'Holding steady at your current grade.',
      confident: true,
    };
  }

  const lastX = known.at(-1)!.x;
  const projectedNow = meanY + slope * (lastX - meanX);
  const weeks = Math.ceil((nextOrdinal - projectedNow) / slope);

  if (weeks <= 0) {
    return { slope, nextGrade, weeksToNext: 0, summary: `${label(nextGrade)} looks within reach now.`, confident: true };
  }
  if (weeks > 26) {
    return {
      slope,
      nextGrade,
      weeksToNext: null,
      summary: `Trending up slowly. ${label(nextGrade)} is a long-term target at this pace.`,
      confident: true,
    };
  }
  return {
    slope,
    nextGrade,
    weeksToNext: weeks,
    summary: `At this pace, ${label(nextGrade)} in about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}.`,
    confident: true,
  };
}

export interface VolumePoint {
  week: string;
  minutes: number;
  sessions: number;
}

export function weeklyVolume(sessions: Session[], weeks = 12, today = todayKey()): VolumePoint[] {
  const byWeek = new Map<string, { minutes: number; sessions: number }>();
  for (const s of sessions) {
    if (!s.completed) continue;
    const week = startOfWeek(s.date);
    const entry = byWeek.get(week) ?? { minutes: 0, sessions: 0 };
    byWeek.set(week, { minutes: entry.minutes + (s.durationMin ?? 0), sessions: entry.sessions + 1 });
  }
  const thisWeek = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => {
    const week = addDays(thisWeek, -7 * (weeks - 1 - i));
    const entry = byWeek.get(week);
    return { week, minutes: entry?.minutes ?? 0, sessions: entry?.sessions ?? 0 };
  });
}
