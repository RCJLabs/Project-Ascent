/**
 * The Challenge Board — one board, not six (PLAN.md §5.7).
 *
 * The prototype ran bounties, contracts, daily challenges, a season pass,
 * quests and sponsor quotas as six parallel task systems (AUDIT.md §4).
 * They are one board here, with three shapes on it: a daily quality task, a
 * weekly set scaled to your own numbers, and bounties you accept.
 *
 * Everything resolves from the log and nothing else. There is no "mark
 * done" — a challenge is complete because the sessions say so, which is why
 * the board cannot be gamed without doing the thing.
 *
 * Pure: sessions in, challenges out. Generation is deterministic from the
 * date, so the same day always produces the same board.
 */

import { DRILL_CATEGORIES, drillsByCategory, getDrill } from '@/content/drills';
import type { DrillCategory } from '@/content/types';
import type { Session } from '@/db/sessions';
import { addDays, daysBetween, startOfWeek, today as todayKey } from './dates';
import type { ClimberState } from './derive';
import { DEFAULT_DISPLAY, V_GRADES, YDS_GRADES, displayGrade, gradeOrdinal, type GradeDisplay, type GradeScale } from './grades';
import type { BodyPart } from '@/content/warmups';
import { partsInText } from './bodyLoad';

export type ChallengeKind = 'daily' | 'weekly' | 'bounty';

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  title: string;
  detail: string;
  progress: number;
  target: number;
  unit: string;
  done: boolean;
  /** Fraction of a level, priced by the economy. */
  reward: number;
  /** Inclusive window the challenge resolves over. */
  from: string;
  to: string;
}

/**
 * Rewards, as fractions of a level.
 *
 * A perfect week — seven dailies, three weeklies, three bounties — is worth
 * under three sessions, and a test enforces it. The board is a nudge toward
 * better training, not a second way to earn; my first pass paid nearly six
 * sessions a week, which would have made the board the main event.
 */
export const CHALLENGE_REWARD = {
  daily: 0.02,
  weekly: 0.04,
  bounty: 0.06,
} as const;

/** Measures run over the sessions inside a challenge's window. */
type Measure = (sessions: Session[]) => number;

interface Spec {
  key: string;
  title: string;
  detail: string;
  unit: string;
  target: number;
  measure: Measure;
}

// ── Measures ──────────────────────────────────────────────────────────────

const isRest = (s: Session) => s.restChecklist !== undefined && s.climbs.length === 0;
const trained = (sessions: Session[]) => sessions.filter((s) => s.completed && !isRest(s));

const countTrained: Measure = (s) => trained(s).length;
const countWarmed: Measure = (s) => trained(s).filter((x) => x.warmup).length;
const countHardWarmed: Measure = (s) => trained(s).filter((x) => x.warmup && (x.rpe ?? 0) >= 7).length;
const countDrills: Measure = (s) => trained(s).filter((x) => x.drillDone).length;
const countNotes: Measure = (s) => s.filter((x) => x.completed && (x.notes ?? '').trim().length > 0).length;
const countRpe: Measure = (s) => trained(s).filter((x) => x.rpe !== undefined).length;
const countFullRest: Measure = (s) =>
  s.filter((x) => x.completed && x.restChecklist && Object.values(x.restChecklist).every(Boolean)).length;
const countOutdoorDays: Measure = (s) =>
  new Set(trained(s).filter((x) => x.mode === 'outdoor').map((x) => x.date)).size;
const countTypes: Measure = (s) =>
  new Set(trained(s).map((x) => x.sessionTypeId).filter(Boolean)).size;
const countBurns: Measure = (s) =>
  s.reduce((sum, x) => sum + (x.projectAttempts ?? []).reduce((n, a) => n + a.count, 0), 0);

function sendsAtOrAbove(scale: GradeScale, grade: string): Measure {
  const floor = gradeOrdinal(scale, grade);
  return (sessions) =>
    sessions.reduce((sum, s) => {
      if (!s.completed) return sum;
      return (
        sum +
        s.climbs
          .filter((c) => c.result === 'send' && c.scale === scale && gradeOrdinal(c.scale, c.grade) >= floor)
          .reduce((n, c) => n + c.count, 0)
      );
    }, 0);
}

function drillsInCategory(category: DrillCategory): Measure {
  return (sessions) =>
    trained(sessions).filter((s) => {
      if (!s.drillDone || !s.drillId) return false;
      return getDrill(s.drillId)?.category === category;
    }).length;
}

// ── Deterministic picking ─────────────────────────────────────────────────

/** Small stable string hash, so a given day always yields the same board. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length]!;
}

// ── Daily ─────────────────────────────────────────────────────────────────

/**
 * A quality ladder rather than a volume one. The rung is chosen by how much
 * the climber has logged, so a beginner is asked to warm up at all and
 * someone forty sessions in is asked to warm up before the hard ones.
 */
const DAILY_LADDER: Spec[][] = [
  [
    { key: 'warmup', title: 'Warm up', detail: 'Warm up before today’s session.', unit: 'session', target: 1, measure: countWarmed },
    { key: 'rpe', title: 'Rate the effort', detail: 'Log an RPE on today’s session.', unit: 'session', target: 1, measure: countRpe },
    { key: 'notes', title: 'Write it down', detail: 'Leave a note on today’s session — anything you noticed.', unit: 'note', target: 1, measure: countNotes },
  ],
  [
    { key: 'warmup-hard', title: 'Warm up for the hard one', detail: 'Warm up before a session you take to RPE 7 or above.', unit: 'session', target: 1, measure: countHardWarmed },
    { key: 'drill', title: 'Do the drill', detail: 'Complete the week’s drill.', unit: 'drill', target: 1, measure: countDrills },
    { key: 'rest', title: 'Rest properly', detail: 'Log a rest day with the whole checklist ticked.', unit: 'rest day', target: 1, measure: countFullRest },
  ],
  [
    { key: 'warmup-hard', title: 'Warm up for the hard one', detail: 'Warm up before a session you take to RPE 7 or above.', unit: 'session', target: 1, measure: countHardWarmed },
    { key: 'drill-notes', title: 'Drill, and say how it went', detail: 'Complete the drill and leave a note about it.', unit: 'session', target: 1, measure: (s) => Math.min(countDrills(s), countNotes(s)) },
    { key: 'rest', title: 'Rest properly', detail: 'Log a rest day with the whole checklist ticked.', unit: 'rest day', target: 1, measure: countFullRest },
  ],
];

function dailyTier(state: ClimberState): number {
  if (state.completedSessions >= 60) return 2;
  if (state.completedSessions >= 20) return 1;
  return 0;
}

export function dailyChallenge(sessions: Session[], state: ClimberState, today: string): Challenge {
  const tier = DAILY_LADDER[dailyTier(state)]!;
  const spec = pick(tier, `daily:${today}`);
  return resolve(spec, sessions, 'daily', today, today, CHALLENGE_REWARD.daily);
}

// ── Weekly ────────────────────────────────────────────────────────────────

/** Variety slot, rotated deterministically by the week. */
const WEEKLY_VARIETY: Spec[] = [
  { key: 'outdoor', title: 'Get outside', detail: 'One day on real rock this week.', unit: 'day', target: 1, measure: countOutdoorDays },
  { key: 'types', title: 'Mix it up', detail: 'Train two different session types this week.', unit: 'types', target: 2, measure: countTypes },
  { key: 'drills', title: 'Drill week', detail: 'Complete the drill in three sessions.', unit: 'sessions', target: 3, measure: countDrills },
  { key: 'warm-all', title: 'Warm up every time', detail: 'Warm up before every session this week.', unit: 'sessions', target: 3, measure: countWarmed },
];

export function weeklyChallenges(
  sessions: Session[],
  state: ClimberState,
  today: string,
  weeklyTarget = 3,
  display: GradeDisplay = DEFAULT_DISPLAY,
): Challenge[] {
  const from = startOfWeek(today);
  const to = addDays(from, 6);

  // Volume scales to what the climber has actually been doing, nudged up a
  // notch — a fixed target is either trivial or impossible depending on who
  // is reading it.
  const scale: GradeScale = state.boulder.totalSends >= state.sport.totalSends ? 'V' : 'YDS';
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  const tally = scale === 'V' ? state.boulder : state.sport;
  const floorOrdinal = Math.max(0, tally.bestOrdinal - 2);
  const grade = ladder[floorOrdinal] ?? ladder[0]!;
  const weeklySends = Math.max(4, Math.round((tally.totalSends / Math.max(1, state.load.daysOfHistory / 7)) * 1.1));

  const volume: Spec = {
    key: `volume-${grade}`,
    title: `${weeklySends} sends at ${displayGrade(scale, grade, display)} or harder`,
    detail: 'Scaled to your recent weeks, nudged up a little.',
    unit: 'sends',
    target: weeklySends,
    measure: sendsAtOrAbove(scale, grade),
  };

  const consistency: Spec = {
    key: 'consistency',
    title: `${weeklyTarget} sessions this week`,
    detail: 'The target your program asks for.',
    unit: 'sessions',
    target: weeklyTarget,
    measure: countTrained,
  };

  const variety = pick(WEEKLY_VARIETY, `weekly:${from}`);

  return [volume, consistency, variety].map((spec) =>
    resolve(spec, sessions, 'weekly', from, to, CHALLENGE_REWARD.weekly),
  );
}

// ── Bounties ──────────────────────────────────────────────────────────────

export interface BountySpec {
  key: string;
  title: string;
  detail: string;
  unit: string;
  target: number;
  /** How to measure it, as data so an accepted bounty survives a reload. */
  measure:
    | { kind: 'sends'; scale: GradeScale; grade: string }
    | { kind: 'drill-category'; category: DrillCategory }
    | { kind: 'burns' }
    | { kind: 'outdoor-days' };
}

export interface AcceptedBounty {
  id: string;
  spec: BountySpec;
  /**
   * ISO timestamp, not a date.
   *
   * A date is not enough: accept "send 3 at V4" in the evening and the three
   * V4s you already logged this morning would complete it instantly. Only
   * sessions *created* at or after this moment count, which is the
   * accepted-at snapshot the plan asks for.
   */
  acceptedAt: string;
}

function measureOf(spec: BountySpec): Measure {
  switch (spec.measure.kind) {
    case 'sends':
      return sendsAtOrAbove(spec.measure.scale, spec.measure.grade);
    case 'drill-category':
      return drillsInCategory(spec.measure.category);
    case 'burns':
      return countBurns;
    case 'outdoor-days':
      return countOutdoorDays;
  }
}

/**
 * Bounties generated from the climber's own distribution.
 *
 * Grade targets sit one notch above where they are comfortable, the
 * boulder/rope split follows their history, and the drill bounty targets
 * whichever category their logs show least. Nothing here is a fixed list.
 */
/**
 * What a bounty would ask you to load.
 *
 * Sending at your limit and burning on a project both put force through
 * fingers and the pulling chain; a drill bounty loads whatever its category's
 * drills load; days outside load nothing in particular. Used to stop the
 * board asking a climber to do the one thing they have told it not to.
 */
export function bountyLoads(spec: BountySpec): BodyPart[] {
  switch (spec.measure.kind) {
    case 'sends':
    case 'burns':
      return ['fingers', 'pulley', 'elbow', 'shoulder'];
    case 'drill-category':
      return categoryLoads(spec.measure.category);
    default:
      return [];
  }
}

function clashes(spec: BountySpec, injured: readonly BodyPart[]): boolean {
  return bountyLoads(spec).some((part) => injured.includes(part));
}

/** What a drill category's drills load, across the whole catalog. */
function categoryLoads(category: DrillCategory): BodyPart[] {
  const parts = drillsByCategory(category).flatMap((d) =>
    partsInText(`${d.name} ${d.focus} ${d.description}`),
  );
  return [...new Set(parts)];
}

export function offeredBounties(
  _sessions: Session[],
  state: ClimberState,
  today: string,
  count = 3,
  /** Parts load should stay off. A bounty that asks for them is not offered. */
  injured: readonly BodyPart[] = [],
): BountySpec[] {
  const out: BountySpec[] = [];

  const prefersBoulder = state.boulder.totalSends >= state.sport.totalSends;
  const scale: GradeScale = prefersBoulder ? 'V' : 'YDS';
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  const tally = prefersBoulder ? state.boulder : state.sport;

  // Comfort is the grade you send most, not the hardest you have ever done.
  const comfort = Object.entries(tally.sends).sort((a, b) => b[1] - a[1])[0]?.[0];
  const comfortOrdinal = comfort ? gradeOrdinal(scale, comfort) : 0;
  const stretch = ladder[Math.min(ladder.length - 1, comfortOrdinal + 1)]!;

  out.push({
    key: `sends-${stretch}`,
    title: `Send 3 at ${stretch}`,
    detail: comfort
      ? `One notch above ${comfort}, where most of your sends sit.`
      : 'A starting target until there is a distribution to read.',
    unit: 'sends',
    target: 3,
    measure: { kind: 'sends', scale, grade: stretch },
  });

  // The drill category the logs show least, which is the useful one — but
  // chosen from the ones that do not load something that is healing, rather
  // than picked first and discarded after.
  const counts = state.drillsByCategory;
  const candidates = (Object.keys(DRILL_CATEGORIES) as DrillCategory[])
    .filter((c) => c !== 'recovery' && c !== 'assessment')
    .filter((c) => !categoryLoads(c).some((part) => injured.includes(part)));
  const weakest = candidates.sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
  if (weakest) {
    out.push({
      key: `drill-${weakest}`,
      title: `Two ${DRILL_CATEGORIES[weakest].label.toLowerCase()} drills`,
      detail: `${DRILL_CATEGORIES[weakest].description} Your least-trained category.`,
      unit: 'sessions',
      target: 2,
      measure: { kind: 'drill-category', category: weakest },
    });
  }

  const extras: BountySpec[] = [
    {
      key: 'burns',
      title: 'Five burns on a project',
      detail: 'Any tracked project. Rehearsal counts.',
      unit: 'burns',
      target: 5,
      measure: { kind: 'burns' },
    },
    {
      key: 'outdoor',
      title: 'Two days outside',
      detail: 'Real rock, any grade.',
      unit: 'days',
      target: 2,
      measure: { kind: 'outdoor-days' },
    },
  ];
  // Pick from the extras that are safe, rather than picking then discarding:
  // a climber with several injuries should still be offered something.
  const safeExtras = extras.filter((spec) => !clashes(spec, injured));
  if (safeExtras.length > 0) out.push(pick(safeExtras, `bounty:${today}`));

  // A board that asks a climber to send at their limit on a healing pulley
  // is worse than a board with one fewer bounty on it.
  return out.filter((spec) => !clashes(spec, injured)).slice(0, count);
}

export function resolveBounty(bounty: AcceptedBounty, sessions: Session[], today: string): Challenge {
  const spec = bounty.spec;
  const measure = measureOf(spec);
  const window = sessions.filter((s) => s.createdAt >= bounty.acceptedAt && s.date <= today);
  const progress = Math.min(spec.target, measure(window));
  return {
    id: bounty.id,
    kind: 'bounty',
    title: spec.title,
    detail: spec.detail,
    progress,
    target: spec.target,
    unit: spec.unit,
    done: progress >= spec.target,
    reward: CHALLENGE_REWARD.bounty,
    from: bounty.acceptedAt.slice(0, 10),
    to: today,
  };
}

// ── The board ─────────────────────────────────────────────────────────────

export interface Board {
  daily: Challenge;
  weekly: Challenge[];
  bounties: Challenge[];
  offers: BountySpec[];
  /** Fraction of a level currently sitting unclaimed. */
  claimable: number;
}

export interface BoardInput {
  sessions: Session[];
  state: ClimberState;
  accepted?: AcceptedBounty[];
  weeklyTarget?: number;
  today?: string;
  /** Ids already claimed, so the board can stop offering them. */
  claimed?: readonly string[];
  /** Notation to write grades in. Defaults to the stored ladders. */
  display?: GradeDisplay;
  /** Parts load should stay off, so the board stops asking for them. */
  injured?: readonly BodyPart[];
}

export function deriveBoard(input: BoardInput): Board {
  const today = input.today ?? todayKey();
  const accepted = input.accepted ?? [];
  const claimed = new Set(input.claimed ?? []);

  const daily = dailyChallenge(input.sessions, input.state, today);
  const weekly = weeklyChallenges(
    input.sessions, input.state, today, input.weeklyTarget, input.display ?? DEFAULT_DISPLAY,
  );
  const bounties = accepted.map((b) => resolveBounty(b, input.sessions, today));

  const acceptedKeys = new Set(accepted.map((b) => b.spec.key));
  const offers = offeredBounties(
    input.sessions, input.state, today, undefined, input.injured ?? [],
  ).filter((o) => !acceptedKeys.has(o.key));

  const claimable = [daily, ...weekly, ...bounties]
    .filter((c) => c.done && !claimed.has(c.id))
    .reduce((sum, c) => sum + c.reward, 0);

  return { daily, weekly, bounties, offers, claimable };
}

/** Priced in the economy's own units, so the board can never out-pay a session. */
export function boardRewardCeiling(): number {
  return CHALLENGE_REWARD.daily * 7 + CHALLENGE_REWARD.weekly * 3 + CHALLENGE_REWARD.bounty * 3;
}

function resolve(
  spec: Spec,
  sessions: Session[],
  kind: ChallengeKind,
  from: string,
  to: string,
  reward: number,
  id = `${kind}:${from}:${spec.key}`,
): Challenge {
  const window = sessions.filter((s) => s.date >= from && s.date <= to);
  const progress = Math.min(spec.target, spec.measure(window));
  return {
    id,
    kind,
    title: spec.title,
    detail: spec.detail,
    progress,
    target: spec.target,
    unit: spec.unit,
    done: progress >= spec.target,
    reward,
    from,
    to,
  };
}

/** Days left in a challenge's window, for the board's urgency line. */
export function daysLeft(challenge: Challenge, today: string): number {
  return Math.max(0, daysBetween(today, challenge.to));
}
