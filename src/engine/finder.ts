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

import { gradeOrdinal, type GradeScale } from '@/engine/grades';
import { GENERAL_TRAINING, PROGRAMS } from '@/content/programs';
import type { Discipline, Equipment, Program } from '@/content/types';

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
  discipline: Discipline;
  experience: Experience;
  /** Highest grade climbed consistently, per ladder. Either may be omitted. */
  boulderGrade?: string;
  sportGrade?: string;
  goal: Goal;
  daysPerWeek: number;
  equipment: Equipment[];
  /** Body parts currently injured, from the injury tracker's vocabulary. */
  injuries?: string[];
  /** Coming back after time away — biases toward rebuilding safely. */
  comingOffBreak?: boolean;
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
}[] = [
  {
    parts: ['finger', 'pulley', 'hand'],
    equipment: 'hangboard',
    severity: 'block',
    note: (p) => `Not while a ${p} injury is healing — this program's hangboard work loads exactly that tissue`,
  },
  {
    parts: ['finger', 'pulley', 'hand'],
    equipment: 'campus',
    severity: 'block',
    note: (p) => `Campus work is the highest-force protocol here, and you have logged a ${p} injury`,
  },
  {
    parts: ['elbow', 'shoulder'],
    equipment: 'campus',
    severity: 'block',
    note: (p) => `Campus work spikes ${p} load — not while that is healing`,
  },
  {
    parts: ['elbow', 'shoulder', 'wrist'],
    equipment: 'hangboard',
    severity: 'caution',
    note: (p) => `Heavy hangboarding with a ${p} injury needs care — reduce load and stop at any sharp pain`,
  },
];

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
    if (fit === 'in') {
      score += 30;
      reasons.push(`${program.gradeRange.label} matches where you climb`);
    } else if (fit === 'below') {
      score -= 25;
      cautions.push(`Written for ${program.gradeRange.label} — harder than your current grade`);
    } else if (fit === 'above') {
      score -= 10;
      cautions.push(`Written for ${program.gradeRange.label} — you may have outgrown it`);
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
    const have = new Set(input.equipment);
    const missing = program.equipment.filter((e) => e !== 'none' && !have.has(e));
    if (missing.length > 0) {
      blockers.push(`Needs ${missing.join(' and ')} you do not have access to`);
    } else if (program.equipment.some((e) => e !== 'none')) {
      score += 5;
    }

    // ── Days available ─────────────────────────────────────────────────
    const perWeek = program.constraints.find((c) => c.kind === 'sessions-per-week');
    if (perWeek && perWeek.kind === 'sessions-per-week') {
      if (input.daysPerWeek < perWeek.min) {
        score -= 20;
        cautions.push(`Asks for ${perWeek.min}-${perWeek.max} days a week; you have ${input.daysPerWeek}`);
      } else {
        score += 10;
        reasons.push(`Fits ${input.daysPerWeek} days a week`);
      }
    }

    // ── Prerequisites ──────────────────────────────────────────────────
    for (const prereq of program.prerequisites?.metrics ?? []) {
      const scaleForPrereq: GradeScale = prereq.metricId === 'redpoint_grade' ? 'YDS' : 'V';
      const actual = climberOrdinal(input, scaleForPrereq);
      if (actual === null) {
        cautions.push(program.prerequisites!.note);
      } else if (actual < prereq.atLeast) {
        blockers.push(program.prerequisites!.note);
      } else {
        score += 10;
        reasons.push('You meet its entry requirement');
      }
    }

    // ── Injuries ───────────────────────────────────────────────────────
    const injured = (input.injuries ?? []).map((i) => i.toLowerCase());
    for (const rule of INJURY_RULES) {
      if (!program.equipment.includes(rule.equipment)) continue;
      const hit = injured.find((i) => rule.parts.some((p) => i.includes(p)));
      if (!hit) continue;
      if (rule.severity === 'block') {
        if (!blockers.some((b) => b.includes(hit))) blockers.push(rule.note(hit));
      } else {
        score -= 20;
        cautions.push(rule.note(hit));
      }
    }

    results.push({ program, score, reasons, cautions, blockers });
  }

  return results.sort((a, b) => {
    const aBlocked = a.blockers.length > 0 ? 1 : 0;
    const bBlocked = b.blockers.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    return b.score - a.score;
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
export function findProgram(input: FinderInput): FinderResult {
  const ranked = recommend(input);
  const viable = ranked.filter((r) => r.blockers.length === 0);
  const blocked = ranked.filter((r) => r.blockers.length > 0);

  const best = viable[0];
  const weak = !best || best.score < 40;

  if (!best) {
    return { top: openLogging(input, blocked), alternatives: [], fallback: true, blocked: blocked.slice(0, 3) };
  }

  return {
    top: best,
    alternatives: viable.slice(1, 3),
    fallback: weak,
    blocked: blocked.slice(0, 3),
  };
}
