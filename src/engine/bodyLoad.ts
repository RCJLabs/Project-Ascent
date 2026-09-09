/**
 * Which tissue a piece of training loads (PLAN.md §9.7, M8).
 *
 * Warmups carry a hand-tagged `loads` list, which is why injuries already
 * filter them. Nothing else in the catalog does: drills and exercises are
 * authored prose, across eleven programs and hundreds of lines, and tagging
 * every one of them by hand is a content project rather than a feature.
 *
 * So this reads them. **It is a keyword scan, not a taxonomy**, and that is
 * worth being blunt about: it will miss an exercise named something unusual
 * and it will over-flag a few that share a word. Both are acceptable because
 * of what the output is used for — a flag beside a line, saying "this loads
 * the thing you told us is hurt". Advisory, never blocking, never a refusal
 * to show you your own program. A missed flag costs a warning the climber
 * could have had; a false one costs a moment's irritation. Neither is worth
 * the alternative, which is no flags at all until every program is re-tagged.
 *
 * The table is the whole thing, deliberately: one place to argue with, one
 * place to fix, and every rule carries the words that trigger it.
 */

import type { BodyPart } from '@/content/warmups';
import type { Drill, Equipment, Exercise, SessionType } from '@/content/types';

export interface LoadRule {
  /** What the words say. */
  pattern: RegExp;
  parts: BodyPart[];
  /** Shown to the climber when this fires, so a flag is never mysterious. */
  because: string;
}

/**
 * Ordered by force through the tissue, hardest first, so the reason a
 * climber sees is the most serious one that applies.
 */
export const LOAD_RULES: LoadRule[] = [
  {
    pattern: /\bcampus|\bbump\b|ladder(ing)?\b|double dyno/i,
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'campus work is the highest-force protocol there is',
  },
  {
    pattern: /one[- ]?arm|1[- ]?arm|unilateral hang/i,
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'one-arm work doubles the load through a single side',
  },
  {
    pattern: /max hang|repeater|dead ?hang|min(imum)? edge|density hang|hangboard|fingerboard|\bedge\b|crimp/i,
    parts: ['fingers', 'pulley'],
    because: 'it loads the fingers directly',
  },
  {
    pattern: /front lever|back lever|\blever\b|muscle[- ]?up|typewriter/i,
    parts: ['elbow', 'shoulder', 'back'],
    because: 'it holds the elbow and shoulder under tension',
  },
  {
    pattern: /lock[- ]?off|pull[- ]?up|chin[- ]?up|\brow\b|lat pull|\bpulldown\b/i,
    parts: ['elbow', 'shoulder', 'back'],
    because: 'pulling loads the elbow and shoulder',
  },
  {
    pattern: /dyno|dynamic|deadpoint|explosive|throw|pop\b|jump/i,
    parts: ['shoulder', 'elbow', 'knee'],
    because: 'catching a dynamic move is a shock load',
  },
  {
    // Sustained gripping is not a low-force activity for a healing tendon,
    // even though it feels like the easy end of training.
    pattern: /\barc\b|linked lap|\blaps?\b|circuit|\bpump\b|4 ?x ?4|continuous|traverse/i,
    parts: ['fingers', 'pulley'],
    because: 'sustained gripping keeps the fingers under load for a long time',
  },
  {
    pattern: /sloper|open hand|pinch|gaston/i,
    parts: ['fingers', 'shoulder'],
    because: 'it holds an open-handed position under load',
  },
  {
    pattern: /overhead|press|dip\b|push[- ]?up|shoulder|scapul|face pull|\bY\b|\bT\b|\bW\b/i,
    parts: ['shoulder'],
    because: 'it works through the shoulder',
  },
  {
    pattern: /wrist|forearm|extensor|hammer curl|reverse curl|rice bucket/i,
    parts: ['wrist', 'elbow'],
    because: 'it loads the forearm and wrist',
  },
  {
    pattern: /heel hook|toe hook|high ?step|drop ?knee|rock ?over|flag\b/i,
    parts: ['knee', 'hip'],
    because: 'it torques the knee and hip',
  },
  {
    pattern: /hip|hamstring|adductor|frog|pigeon|split|straddle/i,
    parts: ['hip'],
    because: 'it works through the hip',
  },
  {
    pattern: /squat|lunge|calf|ankle|hop\b|landing|drop\b/i,
    parts: ['ankle', 'knee'],
    because: 'it loads the ankle and knee',
  },
  {
    pattern: /core|plank|hollow|dead ?bug|leg raise|\bab\b|oblique|hanging knee/i,
    parts: ['back'],
    because: 'it works through the trunk',
  },
];

/** What a piece of equipment loads by simply being used. */
export const EQUIPMENT_LOADS: Partial<Record<Equipment, { parts: BodyPart[]; because: string }>> = {
  hangboard: { parts: ['fingers', 'pulley'], because: 'hangboarding loads the fingers directly' },
  campus: {
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'campus work is the highest-force protocol there is',
  },
};

export interface LoadFinding {
  parts: BodyPart[];
  because: string;
}

/** Every rule that matches some text, hardest first. Empty when none do. */
export function scanText(text: string): LoadFinding[] {
  const out: LoadFinding[] = [];
  for (const rule of LOAD_RULES) {
    if (rule.pattern.test(text)) out.push({ parts: rule.parts, because: rule.because });
  }
  return out;
}

/** The parts a text loads, deduplicated. */
export function partsInText(text: string): BodyPart[] {
  return [...new Set(scanText(text).flatMap((f) => f.parts))];
}

function joinExercise(exercise: Exercise): string {
  return [exercise.name, exercise.notes, exercise.load].filter(Boolean).join(' ');
}

/**
 * Whether an exercise loads any of the injured parts, and why.
 *
 * Returns null rather than an empty finding so a caller can render nothing
 * without checking a length.
 */
export function exerciseConflict(exercise: Exercise, injured: readonly BodyPart[]): LoadFinding | null {
  return firstConflict(scanText(joinExercise(exercise)), injured);
}

/** A drill's own words: its name, focus and the prose that describes it. */
export function drillConflict(drill: Drill, injured: readonly BodyPart[]): LoadFinding | null {
  const byEquipment = drill.equipment
    .map((e) => EQUIPMENT_LOADS[e])
    .filter((v): v is { parts: BodyPart[]; because: string } => v !== undefined);
  const findings = [...byEquipment, ...scanText(`${drill.name} ${drill.focus} ${drill.description}`)];
  return firstConflict(findings, injured);
}

function firstConflict(findings: LoadFinding[], injured: readonly BodyPart[]): LoadFinding | null {
  if (injured.length === 0) return null;
  for (const finding of findings) {
    const hit = finding.parts.filter((p) => injured.includes(p));
    if (hit.length > 0) return { parts: hit, because: finding.because };
  }
  return null;
}

export interface SessionConflict {
  /** Block name, or undefined for the session type itself. */
  block?: string;
  exercise: string;
  finding: LoadFinding;
}

/**
 * Everything in a session type that loads an injured part, in the phase
 * given. A program-wide count is what makes the warning worth reading:
 * "four exercises here load your elbow" is a decision, "this one does" is a
 * shrug.
 */
export function sessionConflicts(
  type: SessionType,
  phaseId: string,
  injured: readonly BodyPart[],
): SessionConflict[] {
  if (injured.length === 0) return [];
  const out: SessionConflict[] = [];
  for (const block of type.blocks ?? []) {
    const prescription = block.perPhase[phaseId];
    if (!prescription) continue;
    for (const exercise of prescription.exercises) {
      const finding = exerciseConflict(exercise, injured);
      if (finding) out.push({ block: block.name, exercise: exercise.name, finding });
    }
  }
  return out;
}

/** "your elbow", "your left pulley and your elbow". */
export function describeParts(parts: readonly BodyPart[]): string {
  const names = parts.map((p) => (p === 'pulley' ? 'pulley' : p));
  if (names.length === 0) return '';
  if (names.length === 1) return `your ${names[0]}`;
  return `your ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
