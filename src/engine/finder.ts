/**
 * Program finder (PLAN.md §5.1).
 *
 * Scores every program against what a climber tells us and returns a ranked
 * list with the reasons shown. This is the piece the prototype never really
 * had: its finder was a three-question quiz, unreachable from the UI, and
 * wrong where it was reachable — it could not recommend The Siege at all,
 * and dropped an experienced climber wanting technique work into a
 * maintenance program (AUDIT.md §9.1-9.2).
 *
 * Design rules:
 *  - Never a dead end. Something is always recommended, with a reason.
 *  - Every score component produces human-readable text. A recommendation
 *    you cannot explain is not a recommendation.
 *  - Blockers (no equipment, unmet prerequisite) exclude a program from the
 *    top pick but still show, so the climber learns what to work toward.
 */

import { DEFAULT_DISPLAY, displayRange, gradeOrdinal, type GradeDisplay, type GradeScale } from '@/engine/grades';
import { GENERAL_TRAINING, PROGRAMS } from '@/content/programs';
import { getMetric } from '@/content/metrics';
import { MIN_ADAPTED_WEEKS } from './adapt';
import type { Discipline, Equipment, MetricId, Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { seriesFor } from './assessments';

export type Goal =
  | 'prep'
  | 'fundamentals'
  | 'technique'
  | 'power'
  | 'fingers'
  | 'endurance'
  | 'dynamic'
  | 'project'
  | 'maintain';

export type Experience = 'new' | 'returning' | 'intermediate' | 'advanced';

export interface FinderInput {
  /**
   * Logged benchmarks, for entry standards the seven questions do not ask
   * about. Absent is not failing — see `meetsPrerequisite`.
   */
  metrics?: MetricEntry[];
  discipline: Discipline;
  experience: Experience;
  /** Highest grade climbed consistently, per ladder. Either may be omitted. */
  boulderGrade?: string;
  sportGrade?: string;
  goal: Goal;
  daysPerWeek: number;
  /**
   * Weeks until the thing they are training for (PLAN.md M57).
   *
   * Undefined means no deadline, which is most of the time — it is a fact
   * about a trip rather than about a climber, which is why the baseline does
   * not ask and the finder screen does.
   */
  weeksAvailable?: number;
  equipment: Equipment[];
  /** Body parts currently injured, from the injury tracker's vocabulary. */
  injuries?: string[];
  /** Coming back after time away — biases toward rebuilding safely. */
  comingOffBreak?: boolean;
  /** How this climber reads grades, so the reasons say it their way. */
  display?: GradeDisplay;
}

export interface Recommendation {
  program: Program;
  score: number;
  /** Why this fits, in plain language. */
  reasons: string[];
  /** Why it might not — shown, never hidden. */
  cautions: string[];
  /** Hard reasons it cannot be run right now. Blocked programs never win. */
  blockers: string[];
}

/** Goals each program serves well. */
const GOAL_FIT: Record<string, Goal[]> = {
  ground_zero: ['prep'],
  base_camp: ['fundamentals', 'technique'],
  gravity_defied: ['dynamic', 'technique'],
  lockdown: ['power', 'technique'],
  iron_grip: ['fingers'],
  peak_performance: ['project', 'power'],
  the_long_game: ['endurance'],
  the_siege: ['project', 'endurance'],
  the_cruiser: ['maintain'],
  general_training: ['maintain'],
  outdoor_climbing: [],
};

/**
 * Injury rules. A finger or pulley injury is a hard stop on finger-strength
 * work — "proceed with a warning" is the wrong answer when a pulley is
 * healing, so these block rather than merely deduct. Elbow and shoulder
 * injuries block campus work (the highest-force protocol in the catalog)
 * and caution against hangboarding.
 */
const INJURY_RULES: {
  parts: string[];
  equipment: Equipment;
  severity: 'block' | 'caution';
  note: (part: string) => string;
  /**
   * The same risk when the program only *offers* the equipment. Written
   * separately rather than suffixed onto `note`, because "not while that is
   * healing" and "the program runs without it" are different sentences and
   * stapling them together produced three em-dash clauses in a row.
   */
  optional?: (part: string) => string;
}[] = [
  // `your ${part}` throughout: the part is the logged injury's own name, so
  // an article in front of it wrote "a a2 pulley injury" and "a elbow injury".
  {
    parts: ['finger', 'pulley', 'hand'],
    equipment: 'hangboard',
    severity: 'block',
    note: (p) => `Not while your ${p} injury is healing — this program's hangboard work loads exactly that tissue`,
  },
  {
    parts: ['finger', 'pulley', 'hand'],
    equipment: 'campus',
    severity: 'block',
    note: (p) => `Campus work is the highest-force protocol here, and your ${p} is healing`,
    optional: (p) => `Leave the campus board alone until your ${p} has healed — the rest of the program runs without it`,
  },
  {
    parts: ['elbow', 'shoulder'],
    equipment: 'campus',
    severity: 'block',
    note: (p) => `Campus work spikes ${p} load — not while that is healing`,
    optional: (p) => `Campus work spikes ${p} load, so run the no-board track until that has healed`,
  },
  {
    parts: ['elbow', 'shoulder', 'wrist'],
    equipment: 'hangboard',
    severity: 'caution',
    note: (p) => `Heavy hangboarding with your ${p} injury needs care — reduce load and stop at any sharp pain`,
  },
];

/**
 * Whether a climber clears one entry standard: true, false, or unknown.
 *
 * **Grades come from the form, everything else from the log.** The finder
 * asks for a boulder and a sport grade, so a grade prerequisite can always
 * be judged; a dead hang or a push-up count can only come from an
 * assessment the climber has actually sat.
 *
 * This used to read `metricId === 'redpoint_grade' ? 'YDS' : 'V'` and then
 * compare *the climber's grade ordinal* against the threshold whatever the
 * metric was — so a `dead_hang >= 60` prerequisite would have compared V8
 * (ordinal 8) against 60 and blocked every climber alive from a program
 * they qualified for. The registry has said `kind` and `scale` all along.
 */
function meetsPrerequisite(
  prereq: { metricId: MetricId; atLeast: number },
  input: FinderInput,
): boolean | null {
  const metric = getMetric(prereq.metricId);
  if (metric?.kind === 'grade') {
    const ordinal = climberOrdinal(input, metric.scale ?? 'V');
    return ordinal === null ? null : ordinal >= prereq.atLeast;
  }
  const value = seriesFor(input.metrics ?? [], prereq.metricId).at(-1)?.value;
  return value === undefined ? null : value >= prereq.atLeast;
}

/** The word a climber would use, not the enum. */
function equipmentWord(kit: Equipment): string {
  return kit === 'weight' ? 'a way to add weight' : kit;
}

function gradeIn(scale: GradeScale, grade: string | undefined, min: string, max: string): 'below' | 'in' | 'above' | null {
  if (!grade) return null;
  const g = gradeOrdinal(scale, grade);
  if (g < 0) return null;
  const lo = gradeOrdinal(scale, min);
  const hi = gradeOrdinal(scale, max);
  if (g < lo) return 'below';
  if (g > hi) return 'above';
  return 'in';
}

function climberOrdinal(input: FinderInput, scale: GradeScale): number | null {
  const grade = scale === 'V' ? input.boulderGrade : input.sportGrade;
  if (!grade) return null;
  const ord = gradeOrdinal(scale, grade);
  return ord < 0 ? null : ord;
}

export function recommend(input: FinderInput): Recommendation[] {
  const results: Recommendation[] = [];

  for (const program of PROGRAMS) {
    // Logging modes are never *recommended* as training.
    if (program.kind === 'mode') continue;

    const reasons: string[] = [];
    const cautions: string[] = [];
    const blockers: string[] = [];
    let score = 0;

    // ── Goal ───────────────────────────────────────────────────────────
    const goals = GOAL_FIT[program.id] ?? [];
    if (goals[0] === input.goal) {
      score += 50;
      reasons.push(`Built for exactly this goal`);
    } else if (goals.includes(input.goal)) {
      score += 30;
      reasons.push(`Trains this goal alongside its main focus`);
    }

    // ── Grade fit ──────────────────────────────────────────────────────
    const scale = program.gradeRange.scale;
    const fit = gradeIn(scale, scale === 'V' ? input.boulderGrade : input.sportGrade, program.gradeRange.min, program.gradeRange.max);
    // The finder speaks to a climber, so it says the range the way that
    // climber reads grades (PLAN.md M47).
    const range = displayRange(program.gradeRange, input.display ?? DEFAULT_DISPLAY);
    if (fit === 'in') {
      score += 30;
      reasons.push(`${range} matches where you climb`);
    } else if (fit === 'below') {
      score -= 25;
      cautions.push(`Written for ${range} — harder than your current grade`);
    } else if (fit === 'above') {
      score -= 10;
      cautions.push(`Written for ${range} — you may have outgrown it`);
    }

    // ── Discipline ─────────────────────────────────────────────────────
    if (program.discipline === input.discipline) {
      score += 15;
      reasons.push(input.discipline === 'both' ? 'Works for boulder and rope' : `Built for ${input.discipline} climbing`);
    } else if (program.discipline === 'both' || input.discipline === 'both') {
      score += 5;
    } else {
      score -= 20;
      cautions.push(`This is a ${program.discipline} program`);
    }

    // ── Experience ─────────────────────────────────────────────────────
    if (input.experience === 'new' && program.id === 'ground_zero') {
      score += 40;
      reasons.push('The right starting point when you are new to training');
    }
    if (input.experience === 'new' && program.stage === 'advanced') {
      score -= 40;
      cautions.push('Assumes years of climbing behind it');
    }
    if (input.comingOffBreak && program.id === 'ground_zero') {
      score += 25;
      reasons.push('Rebuilds structural capacity safely after time away');
    }
    if (input.comingOffBreak && program.stage === 'advanced') {
      score -= 25;
      cautions.push('Too much load for a first block back');
    }

    // ── Equipment ──────────────────────────────────────────────────────
    //
    // Required kit blocks; helpful kit never does. A program that runs
    // bodyweight and would go further with a barbell says so, rather than
    // turning the climber away — which is what seven of nine used to do for
    // between one and eight prescriptions out of thirty to a hundred and
    // thirty (PLAN.md M36).
    const have = new Set(input.equipment);
    const missing = program.equipment.filter((e) => e !== 'none' && !have.has(e));
    if (missing.length > 0) {
      blockers.push(`Needs ${missing.map(equipmentWord).join(' and ')} you do not have access to`);
    } else if (program.equipment.some((e) => e !== 'none')) {
      score += 5;
    }

    // No score attached: if the program runs without it, it runs. Scoring
    // the absence would rebuild the same wall a step lower down.
    const helpfulMissing = (program.helpfulEquipment ?? []).filter(
      (e) => e !== 'none' && !have.has(e) && !missing.includes(e),
    );
    if (helpfulMissing.length > 0 && missing.length === 0) {
      cautions.push(
        `Runs without ${helpfulMissing.map(equipmentWord).join(' or ')} — some of the loading work needs improvising`,
      );
    }

    // ── Weeks available ────────────────────────────────────────────────
    //
    // A twelve-week block is not out of reach for a climber with six weeks —
    // it can be run over six (PLAN.md M56) — but it is not the same block,
    // and something written to fit is a better answer where one exists.
    // Logging modes never reach here — the loop skips them — so every
    // program in hand has a written length to compare against.
    if (input.weeksAvailable !== undefined) {
      const weeks = input.weeksAvailable;
      if (program.weeks <= weeks) {
        score += 10;
        reasons.push(
          program.weeks === weeks
            ? `Runs exactly your ${weeks} weeks`
            : `Runs in ${program.weeks} of your ${weeks} weeks`,
        );
      } else if (weeks >= MIN_ADAPTED_WEEKS && weeks >= program.phases.length) {
        score -= 8;
        cautions.push(`Written as ${program.weeks} weeks — you would run it over ${weeks}`);
      } else {
        score -= 20;
        cautions.push(
          `Written as ${program.weeks} weeks, and ${weeks} is too few to run it over`,
        );
      }
    }

    // ── Days available ─────────────────────────────────────────────────
    //
    // Three cases, not two. `max` used to be ignored, so a program asking
    // for four or five days told a climber with seven that it "fits 7 days
    // a week" — which is not what it asks for, and the rest days it leaves
    // are the point of a hangboard block rather than slack in the schedule
    // (PLAN.md M38).
    const perWeek = program.constraints.find((c) => c.kind === 'sessions-per-week');
    if (perWeek && perWeek.kind === 'sessions-per-week') {
      const asks = perWeek.min === perWeek.max ? `${perWeek.min}` : `${perWeek.min}-${perWeek.max}`;
      if (input.daysPerWeek < perWeek.min) {
        score -= 20;
        cautions.push(`Asks for ${asks} days a week; you have ${input.daysPerWeek}`);
      } else if (input.daysPerWeek > perWeek.max) {
        // Spare days are not a misfit — the program simply does not use
        // them, and saying so is the difference between a reason and a
        // claim that happens to be false.
        score += 10;
        reasons.push(`Uses ${asks} of your ${input.daysPerWeek} days`);
      } else {
        score += 10;
        reasons.push(`Fits ${input.daysPerWeek} days a week`);
      }
    }

    // ── Prerequisites ──────────────────────────────────────────────────
    //
    // Once per program, not once per metric: the note used to be pushed for
    // every entry standard, so a program with four of them said the same
    // sentence four times (PLAN.md M35).
    const prereqs = program.prerequisites?.metrics ?? [];
    if (prereqs.length > 0) {
      const results = prereqs.map((prereq) => meetsPrerequisite(prereq, input));
      const failed = results.filter((r) => r === false).length;
      const met = results.filter((r) => r === true).length;
      if (failed > 0) {
        if (program.prerequisites!.soft) cautions.push(program.prerequisites!.note);
        else blockers.push(program.prerequisites!.note);
      } else if (met > 0) {
        // Proportional, not flat: meeting one standard out of four is not
        // the same evidence as meeting all four, and a flat bonus made a
        // single logged dead hang worth as much as a full assessment.
        score += Math.round((10 * met) / prereqs.length);
        reasons.push(
          met === prereqs.length
            ? 'You meet its entry requirements'
            : 'You meet the entry requirements you have measured',
        );
      }
      // Everything unmeasured stays silent. A climber who has not logged a
      // dead hang has not failed one, and cautioning them for it would put
      // a warning on every program until they sat an assessment.
    }

    // ── Injuries ───────────────────────────────────────────────────────
    //
    // Kit a program merely *offers* still carries its risk, but the climber
    // can decline it, so an optional protocol warns where a required one
    // blocks. Reading required kit alone silently dropped Iron Grip's
    // campus rules the moment campus became optional (PLAN.md M39) — the
    // protocol did not get safer, it got skippable.
    const injured = (input.injuries ?? []).map((i) => i.toLowerCase());
    for (const rule of INJURY_RULES) {
      const required = program.equipment.includes(rule.equipment);
      const offered = program.helpfulEquipment?.includes(rule.equipment) ?? false;
      if (!required && !offered) continue;
      const hit = injured.find((i) => rule.parts.some((p) => i.includes(p)));
      if (!hit) continue;
      if (rule.severity === 'block' && required) {
        if (!blockers.some((b) => b.includes(hit))) blockers.push(rule.note(hit));
      } else {
        score -= 20;
        cautions.push(required ? rule.note(hit) : (rule.optional ?? rule.note)(hit));
      }
    }

    results.push({ program, score, reasons, cautions, blockers });
  }

  return results.sort((a, b) => {
    const aBlocked = a.blockers.length > 0 ? 1 : 0;
    const bBlocked = b.blockers.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    if (a.score !== b.score) return b.score - a.score;
    // A tie used to be settled by the order programs happen to sit in the
    // catalogue, which is not a reason. Fewer warnings wins, and the id
    // settles what is left so the same input always gives the same answer.
    if (a.cautions.length !== b.cautions.length) return a.cautions.length - b.cautions.length;
    return a.program.id.localeCompare(b.program.id);
  });
}

export interface FinderResult {
  top: Recommendation;
  alternatives: Recommendation[];
  /**
   * True when no structured program was a confident match, so the answer is
   * open logging plus an explanation. Distinct from a weak-but-real pick.
   */
  fallback: boolean;
  /** Programs that fit but are out of reach, with what stands in the way. */
  blocked: Recommendation[];
  /**
   * What the catalogue cannot answer, when the honest answer is "nothing
   * here really does this".
   *
   * A climber with a wall and no hangboard who asks for finger strength was
   * handed Perpetual Maintenance at every grade up to V10 and told nothing
   * (PLAN.md M39). The pick is still the best available one; this is the
   * sentence that stops it reading as the right one.
   */
  gap?: string;
}

/** The honest answer when nothing fits: log what you climb, and here is why. */
function openLogging(input: FinderInput, blocked: Recommendation[]): Recommendation {
  const reasons = ['Log what you climb while you build toward a structured block'];
  const missing = new Set(
    blocked.flatMap((b) => b.blockers).filter((b) => b.startsWith('Needs')),
  );
  if (missing.size > 0 && input.equipment.filter((e) => e !== 'none').length === 0) {
    reasons.push('Every structured program here needs equipment you do not have yet');
  }
  return {
    program: GENERAL_TRAINING,
    score: 0,
    reasons,
    cautions: [],
    blockers: [],
  };
}

/**
 * The finder's answer: one pick, two alternatives, and honesty when nothing
 * really fits. Never returns nothing, and never recommends a program the
 * climber has no way to run.
 */
/**
 * The one hole the catalogue genuinely has, named rather than papered over.
 *
 * Every program that trains fingers deliberately needs a hangboard. Without
 * one, finger strength is a by-product of climbing rather than something you
 * can program, and that is worth saying out loud to someone who just asked
 * for it — including which single piece of kit changes the answer.
 */
function catalogueGap(input: FinderInput): string | undefined {
  if (input.goal !== 'fingers') return undefined;
  if (input.equipment.includes('hangboard')) return undefined;
  return 'Nothing here trains fingers without a hangboard — off the wall, finger strength needs a load you can measure and repeat. A hangboard is the one piece of kit that opens Iron Grip, and the cheapest thing you can buy for this goal.';
}

export function findProgram(input: FinderInput): FinderResult {
  const ranked = recommend(input);
  const viable = ranked.filter((r) => r.blockers.length === 0);
  const blocked = ranked.filter((r) => r.blockers.length > 0);

  const best = viable[0];
  const weak = !best || best.score < 40;

  const gap = catalogueGap(input);

  if (!best) {
    return {
      top: openLogging(input, blocked),
      alternatives: [],
      fallback: true,
      blocked: blocked.slice(0, 3),
      ...(gap ? { gap } : {}),
    };
  }

  return {
    top: best,
    alternatives: viable.slice(1, 3),
    fallback: weak,
    blocked: blocked.slice(0, 3),
    ...(gap ? { gap } : {}),
  };
}
