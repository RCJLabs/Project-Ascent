/**
 * The Altimeter — every send adds real height to a lifetime climb.
 *
 * Pure real-climbing maths. No game action adds a single foot, ever: the
 * altimeter is the one number in the app that is only ever moved by pulling
 * on rock or plastic, which is what makes "Everest in eleven months" mean
 * something rather than being a second XP bar.
 *
 * Like `deriveXp`, this reads sessions directly rather than `ClimberState`:
 * height needs each send's scale *and* whether it was outdoors, which the
 * climber-state aggregation deliberately collapses. One function owns the
 * concept, which is what the single-chokepoint rule is actually protecting.
 */

import type { Session } from '@/db/sessions';
import { addDays, daysBetween, today as todayKey } from './dates';

/** Feet per send. The old app's values; tune here and nowhere else. */
export const HEIGHT = {
  boulder: 15,
  route: 50,
  /** Outdoor sends are longer and scarier. */
  outdoor: 1.25,
} as const;

export interface Milestone {
  /** Cumulative feet at which this is reached. */
  feet: number;
  name: string;
  note: string;
}

/**
 * The ladder: ten real climbs to Everest, then the remaining thirteen
 * eight-thousanders stacked on top as the long tail.
 */
export const MILESTONES: Milestone[] = buildLadder();

function buildLadder(): Milestone[] {
  const toEverest: Milestone[] = [
    { feet: 45, name: 'First gym wall', note: 'A single lead wall, floor to anchor.' },
    { feet: 867, name: 'Devils Tower', note: 'The Durrance route, Wyoming.' },
    { feet: 2_000, name: 'Half Dome', note: 'Regular Northwest Face, Yosemite.' },
    { feet: 2_900, name: 'El Capitan', note: 'The Nose. Thirty-one pitches.' },
    { feet: 5_790, name: 'Mt. Washington', note: 'New Hampshire, and the weather that comes with it.' },
    { feet: 14_505, name: 'Mt. Whitney', note: 'The highest summit in the lower 48.' },
    { feet: 19_341, name: 'Kilimanjaro', note: 'Tanzania. The first of the big ones.' },
    { feet: 20_310, name: 'Denali', note: 'Alaska. Cold in a way the others are not.' },
    { feet: 22_838, name: 'Aconcagua', note: 'Argentina. The highest peak outside Asia.' },
    { feet: 29_032, name: 'Everest', note: 'Sea level to the summit. All of it.' },
  ];

  /** The other thirteen 8,000-metre peaks, tallest first. */
  const eightThousanders: [string, number, string][] = [
    ['K2', 28_251, 'Pakistan. The savage mountain.'],
    ['Kangchenjunga', 28_169, 'Nepal and Sikkim.'],
    ['Lhotse', 27_940, 'Everest’s neighbour, sharing its approach.'],
    ['Makalu', 27_838, 'Nepal. A near-perfect pyramid.'],
    ['Cho Oyu', 26_864, 'Nepal and Tibet.'],
    ['Dhaulagiri I', 26_795, 'Nepal. The white mountain.'],
    ['Manaslu', 26_781, 'Nepal. Mountain of the spirit.'],
    ['Nanga Parbat', 26_660, 'Pakistan. The naked mountain.'],
    ['Annapurna I', 26_545, 'Nepal. The first 8,000er ever climbed.'],
    ['Gasherbrum I', 26_509, 'Pakistan. Hidden Peak.'],
    ['Broad Peak', 26_414, 'Pakistan, on the Baltoro.'],
    ['Gasherbrum II', 26_362, 'Pakistan.'],
    ['Shishapangma', 26_335, 'Tibet. The lowest of the fourteen.'],
  ];

  const ladder = [...toEverest];
  let running = toEverest.at(-1)!.feet;
  for (const [name, height, note] of eightThousanders) {
    running += height;
    ladder.push({ feet: running, name, note });
  }
  return ladder;
}

/** Total height of one full lap of the ladder. */
export const LADDER_TOP = MILESTONES.at(-1)!.feet;
export const EVEREST = MILESTONES.find((m) => m.name === 'Everest')!;

/** Feet added by one session's sends. */
export function sessionHeight(session: Session): number {
  if (!session.completed) return 0;
  let feet = 0;
  for (const climb of session.climbs) {
    if (climb.result !== 'send') continue;
    const per = climb.scale === 'V' ? HEIGHT.boulder : HEIGHT.route;
    feet += per * climb.count * (session.mode === 'outdoor' ? HEIGHT.outdoor : 1);
  }
  return feet;
}

export interface WeekHeight {
  /** Date the seven-day window opens. */
  week: string;
  feet: number;
}

export interface AltimeterState {
  feet: number;
  meters: number;
  reached: Milestone[];
  next: Milestone | null;
  /** Height already banked toward `next`, and the span it sits in. */
  intoSegment: number;
  segment: number;
  fraction: number;
  toNext: number;
  /** Feet per week, measured over recent history. */
  pace: number;
  /** Null when there is not enough history, or no pace to project from. */
  etaWeeks: number | null;
  etaLabel: string | null;
  everest: { reached: boolean; fraction: number; toGo: number; etaLabel: string | null };
  /** Complete laps of the whole ladder. */
  laps: number;
}

export interface AltimeterOptions {
  today?: string;
  /** Weeks of history the pace is measured over. */
  paceWeeks?: number;
}

export function deriveAltimeter(
  sessions: Session[],
  options: AltimeterOptions = {},
): AltimeterState {
  const today = options.today ?? todayKey();
  const paceWeeks = options.paceWeeks ?? 8;

  let feet = 0;
  let recentFeet = 0;
  let firstDate: string | null = null;

  for (const session of sessions) {
    const height = sessionHeight(session);
    if (height === 0) continue;
    feet += height;
    if (firstDate === null || session.date < firstDate) firstDate = session.date;
    const age = daysBetween(session.date, today);
    if (age >= 0 && age < paceWeeks * 7) recentFeet += height;
  }

  feet = Math.round(feet);

  const lapFeet = feet % LADDER_TOP;
  const laps = Math.floor(feet / LADDER_TOP);
  const reached = MILESTONES.filter((m) => m.feet <= lapFeet);
  const next = MILESTONES.find((m) => m.feet > lapFeet) ?? null;
  const floor = reached.at(-1)?.feet ?? 0;
  const segment = next ? next.feet - floor : 0;
  const intoSegment = lapFeet - floor;

  // Pace over the window, but never over more weeks than actually exist —
  // a climber four weeks in should not be told their pace is half of what
  // they have really been doing.
  const weeksOfHistory =
    firstDate === null ? 0 : Math.max(1, (daysBetween(firstDate, today) + 1) / 7);
  const window = Math.min(paceWeeks, weeksOfHistory);
  const pace = window === 0 ? 0 : recentFeet / window;

  const enoughHistory = weeksOfHistory >= 3 && pace > 0;
  const toNext = next ? next.feet - lapFeet : 0;
  const etaWeeks = enoughHistory && next ? toNext / pace : null;

  const everestGap = EVEREST.feet - feet;
  const everestEta = enoughHistory && everestGap > 0 ? everestGap / pace : null;

  return {
    feet,
    meters: Math.round(feet * 0.3048),
    reached,
    next,
    intoSegment,
    segment,
    fraction: segment === 0 ? 1 : intoSegment / segment,
    toNext,
    pace: Math.round(pace),
    etaWeeks,
    etaLabel: etaWeeks === null ? null : describeWeeks(etaWeeks),
    everest: {
      reached: feet >= EVEREST.feet,
      fraction: Math.min(1, feet / EVEREST.feet),
      toGo: Math.max(0, everestGap),
      etaLabel: everestEta === null ? null : describeWeeks(everestEta),
    },
    laps,
  };
}

/**
 * Weeks as a phrase a person would use.
 *
 * Deliberately coarse past a couple of months: projecting "37 weeks" from
 * eight weeks of data implies a precision the data does not have.
 */
export function describeWeeks(weeks: number): string {
  if (weeks < 1) return 'this week';
  if (weeks < 2) return 'about a week';
  if (weeks < 9) return `about ${Math.round(weeks)} weeks`;
  const months = weeks / 4.345;
  if (months < 22) return `about ${Math.round(months)} months`;
  const years = months / 12;
  if (years < 10) return `about ${years < 1.5 ? 'a year' : `${Math.round(years)} years`}`;
  return 'a very long way off';
}

/**
 * Height per rolling week, oldest first.
 *
 * Buckets are seven days back from today rather than calendar weeks, so the
 * last bar is always the week you are actually in; each is labelled with the
 * date that window opens.
 */
export function weeklyHeight(sessions: Session[], weeks = 12, today = todayKey()): WeekHeight[] {
  const buckets = new Map<number, number>();
  for (const session of sessions) {
    const age = daysBetween(session.date, today);
    if (age < 0 || age >= weeks * 7) continue;
    const bucket = Math.floor(age / 7);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + sessionHeight(session));
  }
  return Array.from({ length: weeks }, (_, i) => {
    const bucket = weeks - 1 - i;
    return {
      week: addDays(today, -7 * bucket),
      feet: Math.round(buckets.get(bucket) ?? 0),
    };
  });
}
