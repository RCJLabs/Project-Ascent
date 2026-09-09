/**
 * Training-state diagnosis, and the reset that follows a plateau.
 *
 * Five verdicts, decided by rules over numbers the app already derives —
 * no model, no sentiment analysis, no API key. The prototype reached the
 * same five verdicts deterministically and only called out to an AI for the
 * reset protocol (AUDIT.md §2); that call is replaced here by a template
 * built from the climber's own history, which is both cheaper and more
 * specific than the generated version ever was.
 *
 * Order is the design. Recovery is checked before anything else, because a
 * climber who is hurt or buried in load does not need to be told they have
 * plateaued — the flat line is the symptom, not the problem.
 *
 * Pure: state in, verdict out.
 */

import { DRILL_CATEGORIES, filterDrills } from '@/content/drills';
import type { DrillCategory, Equipment, MetricId, Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import type { BodyPart } from '@/content/warmups';
import { getDrill } from '@/content/drills';
import { getMetric } from '@/content/metrics';
import { seriesFor } from './assessments';
import { addDays, daysBetween, shortLabel, today as todayKey } from './dates';
import type { ClimberState } from './derive';
import { V_GRADES, YDS_GRADES, type GradeScale } from './grades';
import { pyramid } from './progress';

export type Verdict =
  | 'insufficient-data'
  | 'recovery-compromised'
  | 'breakthrough'
  | 'plateau'
  | 'optimal';

/** Thresholds, named so the reasoning is readable and tunable in one place. */
export const RULES = {
  /** Below this you are describing a new user, not a training state. */
  minSessions: 8,
  minDaysOfHistory: 28,
  /** Days back a personal record still counts as a breakthrough. */
  prIsRecentDays: 21,
  /** Days without a record before a flat line becomes a plateau. */
  plateauDays: 42,
  /** Sessions in the last 30 days that count as "actually training". */
  trainingVolume: 6,
  /** Consecutive training days that make recovery the priority. */
  consecutiveDays: 5,
} as const;

export interface Evidence {
  label: string;
  value: string;
}

export interface ResetStep {
  days: string;
  title: string;
  detail: string;
}

export interface ResetProtocol {
  rationale: string;
  steps: ResetStep[];
}

export interface Diagnosis {
  verdict: Verdict;
  headline: string;
  explanation: string;
  evidence: Evidence[];
  /** Only ever attached to a plateau — it is that verdict's prescription. */
  reset?: ResetProtocol;
}

export interface DiagnosisInput {
  state: ClimberState;
  sessions: Session[];
  injuries?: BodyPart[];
  equipment?: Equipment[];
  metrics?: MetricEntry[];
  program?: Program | undefined;
  /** Which ladder to judge the ceiling on. */
  scale?: GradeScale;
  today?: string;
}

export function diagnose(input: DiagnosisInput): Diagnosis {
  const today = input.today ?? todayKey();
  const { state } = input;
  const injuries = input.injuries ?? [];
  const scale = input.scale ?? 'V';
  const tally = scale === 'V' ? state.boulder : state.sport;

  const latestPr = [...state.personalRecords]
    .filter((pr) => pr.scale === scale)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .at(-1);
  const daysSincePr = latestPr ? Math.max(0, daysBetween(latestPr.date, today)) : null;

  // ── 1. Recovery override, first and unconditionally ────────────────────
  const overloaded = state.load.zone === 'danger';
  const grinding = state.consecutiveTrainingDays >= RULES.consecutiveDays;
  if (injuries.length > 0 || overloaded || grinding) {
    return {
      verdict: 'recovery-compromised',
      headline: 'Recovery first',
      explanation: recoveryExplanation(injuries, overloaded, grinding, state),
      evidence: [
        ...(injuries.length > 0
          ? [{ label: 'Active injuries', value: injuries.join(', ') }]
          : []),
        ...(state.load.acwr !== null
          ? [{ label: 'Acute:chronic load', value: state.load.acwr.toFixed(2) }]
          : []),
        ...(state.consecutiveTrainingDays > 0
          ? [{ label: 'Consecutive training days', value: String(state.consecutiveTrainingDays) }]
          : []),
        { label: 'Sessions warmed up', value: `${Math.round(state.warmupRate * 100)}%` },
      ],
    };
  }

  // ── 2. Not enough to say anything honest ───────────────────────────────
  if (state.completedSessions < RULES.minSessions || state.load.daysOfHistory < RULES.minDaysOfHistory) {
    return {
      verdict: 'insufficient-data',
      headline: 'Too early to tell',
      explanation: `A training state needs ${RULES.minSessions} sessions across ${Math.round(
        RULES.minDaysOfHistory / 7,
      )} weeks before it means anything. Keep logging — the read gets sharper on its own.`,
      evidence: [
        { label: 'Sessions logged', value: `${state.completedSessions} of ${RULES.minSessions}` },
        {
          label: 'History',
          value: `${state.load.daysOfHistory} of ${RULES.minDaysOfHistory} days`,
        },
      ],
    };
  }

  const baseEvidence: Evidence[] = [
    {
      label: 'Last personal record',
      value: latestPr
        ? `${latestPr.grade}, ${daysAgo(daysSincePr!)}`
        : 'none logged',
    },
    { label: 'Sessions in 30 days', value: String(state.recentSessions) },
    ...(state.load.acwr !== null
      ? [{ label: 'Acute:chronic load', value: state.load.acwr.toFixed(2) }]
      : []),
  ];

  // ── 3. Something just moved ────────────────────────────────────────────
  if (daysSincePr !== null && daysSincePr <= RULES.prIsRecentDays) {
    return {
      verdict: 'breakthrough',
      headline: 'Breaking through',
      explanation: `You sent ${latestPr!.grade} ${daysAgo(daysSincePr)} — your hardest on this ladder. Whatever the last block was doing, it worked. Hold the pattern rather than adding to it.`,
      evidence: baseEvidence,
    };
  }

  // ── 4. Training hard, going nowhere ────────────────────────────────────
  const stalled = daysSincePr === null || daysSincePr >= RULES.plateauDays;
  const training = state.recentSessions >= RULES.trainingVolume;
  if (stalled && training) {
    const wall = stuckGrade(tally, scale);
    return {
      verdict: 'plateau',
      headline: 'Plateaued',
      explanation: `${state.recentSessions} sessions in the last month and no new grade ${
        daysSincePr === null ? 'yet' : `in ${Math.round(daysSincePr / 7)} weeks`
      }. That is the signature of a body that has adapted to what you keep asking of it.`,
      evidence: [
        ...baseEvidence,
        ...(wall
          ? [{ label: `${wall.grade} conversion`, value: `${wall.sends} sent from ${wall.attempts} tries` }]
          : []),
      ],
      reset: buildReset(input, today, wall?.grade ?? null, scale),
    };
  }

  // ── 5. Nothing is blocking you ─────────────────────────────────────────
  return {
    verdict: 'optimal',
    headline: training ? 'Building' : 'Ticking over',
    explanation: training
      ? 'Load is where it should be, nothing is flagged, and you are inside the window where a record would be normal. This is the boring part that works.'
      : `Only ${state.recentSessions} sessions in the last month. Nothing is wrong — there is just not enough training here to break through or to stall. Volume is the lever.`,
    evidence: baseEvidence,
  };
}

function daysAgo(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 21) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

function recoveryExplanation(
  injuries: BodyPart[],
  overloaded: boolean,
  grinding: boolean,
  state: ClimberState,
): string {
  const reasons: string[] = [];
  if (injuries.length > 0) reasons.push(`you have logged a ${injuries.join(' and ')} injury`);
  if (overloaded) {
    reasons.push(
      `your load has jumped to ${state.load.acwr!.toFixed(2)}× your baseline`,
    );
  }
  if (grinding) reasons.push(`you are ${state.consecutiveTrainingDays} training days deep with no rest`);
  return `No verdict on your training until this is dealt with: ${joinList(
    reasons,
  )}. Progress measured through a compromised recovery is measuring the wrong thing.`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The grade you keep trying and not sending — the plateau's actual location. */
function stuckGrade(
  tally: ClimberState['boulder'],
  scale: GradeScale,
): { grade: string; sends: number; attempts: number } | null {
  const rows = pyramid(tally, scale);
  const stuck = rows.filter((r) => r.attempts > 0 && r.sends === 0);
  const worst = stuck.sort((a, b) => b.attempts - a.attempts)[0];
  return worst ? { grade: worst.grade, sends: worst.sends, attempts: worst.attempts } : null;
}

/**
 * The seven-day reset, assembled from the climber's own history.
 *
 * Three ingredients, exactly as specified: deload days, one novel stimulus
 * from a drill category they have not trained, and one concrete retest on a
 * named day. Everything is chosen from real data — a category their logs
 * show is missing, a benchmark their own battery says is overdue — so the
 * plan is specific in a way a generated one could not reliably be.
 */
function buildReset(
  input: DiagnosisInput,
  today: string,
  wallGrade: string | null,
  scale: GradeScale,
): ResetProtocol {
  const novel = novelStimulus(input);
  const retest = retestTarget(input, wallGrade, scale, today);

  return {
    rationale:
      'Adaptation stops when the stimulus stops changing. Drop the load first so the change lands on a recovered body, then change one thing and measure it.',
    steps: [
      {
        days: 'Days 1–2',
        title: 'Nothing',
        detail:
          'Two full rest days. Not easy climbing — rest. This is the part that gets skipped, and it is the part that makes the rest of the week work.',
      },
      {
        days: 'Days 3–5',
        title: 'Half volume, capped effort',
        detail:
          'Two sessions, RPE 6 or below, half your usual time on the wall. You are not training here; you are keeping the pattern alive while the fatigue clears.',
      },
      {
        days: 'Day 6',
        title: novel.title,
        detail: novel.detail,
      },
      {
        days: 'Day 7',
        title: retest.title,
        detail: retest.detail,
      },
    ],
  };
}

/** Preference order among categories worth introducing as a new stimulus.
 *  Recovery and assessment are excluded — neither is a novel stimulus. */
const STIMULUS_ORDER: DrillCategory[] = [
  'power',
  'finger-strength',
  'power-endurance',
  'technique',
  'endurance',
  'mental',
  'strategy',
  'performance',
];

function novelStimulus(input: DiagnosisInput): { title: string; detail: string } {
  const trained = new Map<DrillCategory, number>();
  for (const session of input.sessions) {
    if (!session.drillId || session.drillDone === false) continue;
    const drill = getDrill(session.drillId);
    if (drill) trained.set(drill.category, (trained.get(drill.category) ?? 0) + 1);
  }

  const equipment = input.equipment ?? [];
  const ranked = [...STIMULUS_ORDER].sort(
    (a, b) => (trained.get(a) ?? 0) - (trained.get(b) ?? 0),
  );

  for (const category of ranked) {
    const options = filterDrills({ category, ...(equipment.length > 0 ? { equipment } : {}) });
    const drill = options[0];
    if (!drill) continue;
    const count = trained.get(category) ?? 0;
    return {
      title: `One novel stimulus: ${drill.name}`,
      // The drill's full description belongs in the drill, not in a summary
      // card — its focus line is enough to know whether this is the lever.
      detail:
        `${DRILL_CATEGORIES[category].label} — ${DRILL_CATEGORIES[category].description} ` +
        (count === 0
          ? 'Your logs have no drill from this category at all, which makes it the largest untouched lever you have.'
          : `You have logged this category ${count} time${count === 1 ? '' : 's'}, less than anything else you train.`) +
        ` Trains: ${drill.focus}, ${drill.duration}.`,
    };
  }

  return {
    title: 'One novel stimulus',
    detail:
      'Pick any drill from a category you have not trained this block. The specific choice matters far less than the fact that it is unfamiliar.',
  };
}

function retestTarget(
  input: DiagnosisInput,
  wallGrade: string | null,
  scale: GradeScale,
  today: string,
): { title: string; detail: string } {
  const metric = stalestBatteryMetric(input, today);
  if (metric) {
    const label = getMetric(metric.id)!.label;
    return {
      title: `One retest: ${label}`,
      detail: metric.last
        ? `Last measured ${shortLabel(metric.last)} — ${Math.round(metric.days / 7)} weeks ago. Retest it on the same day of the week, warmed up the same way, so the number is comparable.`
        : `You have never taken a baseline for this. Do it rested, on day 7, and the next six weeks finally have something to move.`,
    };
  }

  const target = wallGrade ?? nextGrade(input.state, scale);
  return {
    title: `One retest: ${target ?? 'your ceiling'}`,
    detail: target
      ? `Three fresh attempts at ${target}, rested, early in the session. If the high point has moved, the week worked; if not, the next block needs a different lever, not more of the same.`
      : 'Pick the grade you have been failing on and give it three fresh attempts, rested and early in the session.',
  };
}

interface StaleMetric {
  id: MetricId;
  last: string | null;
  days: number;
}

/** The program benchmark that has gone longest without a number. */
function stalestBatteryMetric(input: DiagnosisInput, today: string): StaleMetric | null {
  const ids = input.program?.assessments ?? [];
  const entries = input.metrics ?? [];
  if (ids.length === 0) return null;

  let worst: StaleMetric | null = null;
  for (const id of ids) {
    const metric = getMetric(id);
    if (!metric || metric.kind === 'text') continue;
    const latest = seriesFor(entries, id).at(-1);
    const candidate: StaleMetric = latest
      ? { id, last: latest.date, days: Math.max(0, daysBetween(latest.date, today)) }
      : { id, last: null, days: Number.POSITIVE_INFINITY };
    if (!worst || candidate.days > worst.days) worst = candidate;
  }
  return worst;
}

/** One rung above the hardest grade sent, for a retest target. */
function nextGrade(state: ClimberState, scale: GradeScale): string | null {
  const tally = scale === 'V' ? state.boulder : state.sport;
  if (tally.best === null) return null;
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;
  return ladder[tally.bestOrdinal + 1] ?? tally.best;
}

/** The date each reset step falls on, for display. */
export function resetDates(today: string): string[] {
  return [today, addDays(today, 2), addDays(today, 5), addDays(today, 6)];
}
