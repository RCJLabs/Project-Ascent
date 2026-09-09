/**
 * The five skill trees (PLAN.md §5.6).
 *
 * 130 nodes, every requirement drawn from real training — drill counts,
 * sends by grade, assessment numbers, consecutive weeks, days on rock,
 * height on the altimeter. Nothing unlocks from a minigame or a purchase,
 * and there are no points to spend: a node lights up because you did it.
 *
 * Each tree is five branches of five, plus a capstone that asks for a stat
 * in the seventies — which no single branch can produce, so a capstone
 * really does mean the whole tree.
 */

import type { SkillEffect, SkillNode, SkillRequirement, SkillTree, TreeId } from '@/engine/skills';

type Rung = [name: string, threshold: number, effect?: SkillEffect];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Five rungs of one branch, thresholds climbing. */
function branch(
  tree: TreeId,
  name: string,
  rungs: Rung[],
  build: (threshold: number) => SkillRequirement,
): SkillNode[] {
  return rungs.map(([label, threshold, effect], i) => ({
    id: `${tree}-${slug(name)}-${i + 1}`,
    tree,
    tier: i + 1,
    branch: name,
    name: label,
    requirement: build(threshold),
    ...(effect ? { effect } : {}),
  }));
}

/** A branch whose rungs differ in kind, not just in threshold. */
function mixed(
  tree: TreeId,
  name: string,
  rungs: [label: string, requirement: SkillRequirement, effect?: SkillEffect][],
): SkillNode[] {
  return rungs.map(([label, requirement, effect], i) => ({
    id: `${tree}-${slug(name)}-${i + 1}`,
    tree,
    tier: i + 1,
    branch: name,
    name: label,
    requirement,
    ...(effect ? { effect } : {}),
  }));
}

function capstone(tree: TreeId, name: string, stat: 'STR' | 'END' | 'TEC' | 'MEN' | 'AGI', effect: SkillEffect): SkillNode {
  return {
    id: `${tree}-capstone`,
    tree,
    tier: 6,
    branch: 'Capstone',
    name,
    requirement: { kind: 'stat', stat, atLeast: 70 },
    effect,
  };
}

// ── Dynamic Power ─────────────────────────────────────────────────────────

const POWER: SkillTree = {
  id: 'power',
  name: 'Dynamic Power',
  blurb: 'Contact strength, explosive pulling, and the nerve to commit to a move.',
  nodes: [
    ...branch('power', 'Contact Strength', [
      ['First Hangs', 1],
      ['Half Crimp', 10],
      ['Iron Fingers', 20],
      ['Edge Hunter', 35],
      ['Vice Grip', 50, { kind: 'cosmetic', id: 'kit-iron', label: 'the Iron kit' }],
    ], (v) => ({ kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: v })),

    ...branch('power', 'Explosive Pull', [
      ['Bodyweight', 1],
      ['Loaded', 15],
      ['Heavy Pull', 30],
      ['One-Arm Bound', 50],
      ['Freight Train', 70],
    ], (v) => ({ kind: 'metric', metricId: 'weighted_pullup_3rm', atLeast: v })),

    ...branch('power', 'Campus Work', [
      ['First Rungs', 2],
      ['Laddering', 5],
      ['Skip a Rung', 12],
      ['Double Dyno', 24],
      ['Campus Fluent', 40, { kind: 'ascent-boon', id: 'boon-reach', label: 'start each run with a longer reach' }],
    ], (v) => ({ kind: 'drills', category: 'power', count: v })),

    ...branch('power', 'Committing Moves', [
      ['First Dyno', 2],
      ['Deadpoint', 4],
      ['Big Throw', 6],
      ['Cut Loose', 8],
      ['Airborne', 10, { kind: 'ascent-boon', id: 'boon-doublejump', label: 'one extra lane jump per run' }],
    ], (v) => ({ kind: 'metric', metricId: 'max_dynamic_grade', atLeast: v })),

    // A pyramid, not a ladder: the grade climbs as the count falls.
    ...mixed('power', 'Boulder Ceiling', [
      ['Warmed Up', { kind: 'sends', scale: 'V', grade: 'V3', count: 10 }],
      ['Solid', { kind: 'sends', scale: 'V', grade: 'V4', count: 25 }],
      ['Strong', { kind: 'sends', scale: 'V', grade: 'V6', count: 12 }],
      ['Hard', { kind: 'sends', scale: 'V', grade: 'V8', count: 5 }],
      ['Elite', { kind: 'sends', scale: 'V', grade: 'V10', count: 1 }],
    ]),

    capstone('power', 'Explosive', 'STR', {
      kind: 'ascent-boon',
      id: 'boon-slowmo',
      label: 'begin every run with a slow-mo charge',
    }),
  ],
};

// ── Static Tension ────────────────────────────────────────────────────────

const TENSION: SkillTree = {
  id: 'tension',
  name: 'Static Tension',
  blurb: 'Lock-offs, core line, and the control to do it slowly.',
  nodes: [
    ...branch('tension', 'Lock-Off', [
      ['Bent Arm', 3],
      ['Held', 6],
      ['Steady', 10],
      ['Rock Solid', 15],
      ['Immovable', 22],
    ], (v) => ({ kind: 'metric', metricId: 'lock_off_90', atLeast: v })),

    ...branch('tension', 'Core Line', [
      ['Braced', 30],
      ['Connected', 60],
      ['Rigid', 90],
      ['Unbending', 150],
      ['One Piece', 240, { kind: 'cosmetic', id: 'kit-tension', label: 'the Tension kit' }],
    ], (v) => ({ kind: 'metric', metricId: 'core_plank', atLeast: v })),

    ...branch('tension', 'Front Lever', [
      ['Tuck', 2],
      ['Advanced Tuck', 5],
      ['One Leg', 8],
      ['Straddle', 12],
      ['Full Lever', 18],
    ], (v) => ({ kind: 'metric', metricId: 'front_lever_hold', atLeast: v })),

    ...branch('tension', 'Hollow Body', [
      ['Flat Back', 20],
      ['Compressed', 40],
      ['Long Hold', 60],
      ['Locked', 90],
      ['Iron Middle', 120],
    ], (v) => ({ kind: 'metric', metricId: 'hollow_body', atLeast: v })),

    ...branch('tension', 'Static Ceiling', [
      ['No Swing', 2],
      ['Controlled', 4],
      ['Precise', 6],
      ['Deliberate', 8],
      ['Slow Is Smooth', 10],
    ], (v) => ({ kind: 'metric', metricId: 'max_static_grade', atLeast: v })),

    capstone('tension', 'Unshakeable', 'STR', {
      kind: 'cosmetic',
      id: 'gear-tension',
      label: 'the Slate kit',
    }),
  ],
};

// ── Endurance ─────────────────────────────────────────────────────────────

const ENDURANCE: SkillTree = {
  id: 'endurance',
  name: 'Endurance',
  blurb: 'Aerobic base, volume, and the hours that build both.',
  nodes: [
    ...branch('endurance', 'ARC Base', [
      ['First Laps', 5],
      ['Ten Minutes', 10],
      ['Quarter Hour', 15],
      ['Long Burn', 25],
      ['Bottomless', 40],
    ], (v) => ({ kind: 'metric', metricId: 'arc_duration', atLeast: v })),

    ...branch('endurance', 'Mileage', [
      ['Getting Started', 10],
      ['Regular', 30],
      ['Committed', 75],
      ['Relentless', 150],
      ['Lifer', 300, { kind: 'warmup-variety', extra: 3 }],
    ], (v) => ({ kind: 'sessions', count: v })),

    ...branch('endurance', 'Time on the Wall', [
      ['Ten Hours', 10],
      ['Forty Hours', 40],
      ['A Hundred', 100],
      ['Two Fifty', 250],
      ['Five Hundred', 500],
    ], (v) => ({ kind: 'hours', hours: v })),

    ...mixed('endurance', 'Route Ladder', [
      ['Moving Up', { kind: 'sends', scale: 'YDS', grade: '5.9', count: 10 }],
      ['Comfortable', { kind: 'sends', scale: 'YDS', grade: '5.10a', count: 20 }],
      ['Sustained', { kind: 'sends', scale: 'YDS', grade: '5.11a', count: 12 }],
      ['Pumped and Still Going', { kind: 'sends', scale: 'YDS', grade: '5.12a', count: 5 }],
      ['Endurance Monster', { kind: 'sends', scale: 'YDS', grade: '5.13a', count: 2 }],
    ]),

    ...branch('endurance', 'Capacity Work', [
      ['First Circuits', 2],
      ['Circuit Regular', 5],
      ['Pump Tolerant', 12],
      ['Deep Well', 24],
      ['Aerobic Engine', 40],
    ], (v) => ({ kind: 'drills', category: 'endurance', count: v })),

    capstone('endurance', 'Inexhaustible', 'END', { kind: 'rest-recovery', bonus: 0.25 }),
  ],
};

// ── Technique ─────────────────────────────────────────────────────────────

const TECHNIQUE: SkillTree = {
  id: 'technique',
  name: 'Technique',
  blurb: 'Footwork, breadth of styles, and climbing things first go.',
  nodes: [
    ...branch('technique', 'Footwork', [
      ['Quiet Feet', 3],
      ['Precise', 8],
      ['Trusting', 18],
      ['Efficient', 35],
      ['Effortless', 60, { kind: 'warmup-variety', extra: 3 }],
    ], (v) => ({ kind: 'drills', category: 'technique', count: v })),

    ...branch('technique', 'Breadth', [
      ['Four Grades', 4],
      ['Eight Grades', 8],
      ['Twelve Grades', 12],
      ['Sixteen Grades', 16],
      ['Anything on the Wall', 20],
    ], (v) => ({ kind: 'grade-variety', count: v })),

    ...branch('technique', 'Flash', [
      ['First Flash', 5],
      ['Reader', 15],
      ['Quick Study', 40],
      ['First Go', 80],
      ['Flash Artist', 150],
    ], (v) => ({ kind: 'style-sends', style: 'flash', count: v })),

    ...branch('technique', 'On-Sight', [
      ['No Beta', 1],
      ['Cold Start', 5],
      ['Ground Up', 15],
      ['Eyes Only', 35],
      ['On-Sight Specialist', 70],
    ], (v) => ({ kind: 'style-sends', style: 'onsight', count: v })),

    ...branch('technique', 'Tactics', [
      ['Sequencing', 2],
      ['Rest Reading', 5],
      ['Beta Building', 12],
      ['Route Craft', 24],
      ['Tactician', 40, { kind: 'bounty-slot', extra: 1 }],
    ], (v) => ({ kind: 'drills', category: 'strategy', count: v })),

    capstone('technique', 'Fluent', 'TEC', { kind: 'bounty-slot', extra: 1 }),
  ],
};

// ── Mental Grit ───────────────────────────────────────────────────────────

const GRIT: SkillTree = {
  id: 'grit',
  name: 'Mental Grit',
  blurb: 'Turning up, finishing projects, resting properly, and days on real rock.',
  nodes: [
    ...branch('grit', 'Consistency', [
      ['Two Weeks', 2],
      ['A Month', 4],
      ['Two Months', 8],
      ['A Season', 16],
      ['Unbroken', 30],
    ], (v) => ({ kind: 'streak-weeks', weeks: v })),

    ...branch('grit', 'Projects', [
      ['First Send', 1],
      ['Closer', 3],
      ['Finisher', 6],
      ['Serial Projector', 12],
      ['Nothing Left Undone', 25, { kind: 'project-slot', extra: 1 }],
    ], (v) => ({ kind: 'projects-sent', count: v })),

    ...branch('grit', 'Real Rock', [
      ['First Day Out', 1],
      ['Weekend Regular', 5],
      ['Road Trip', 15],
      ['Local', 40],
      ['At Home Outside', 90, { kind: 'cosmetic', id: 'kit-granite', label: 'the Granite kit' }],
    ], (v) => ({ kind: 'outdoor-days', count: v })),

    ...branch('grit', 'Recovery Discipline', [
      ['Took a Day', 5],
      ['Rest Is Training', 15],
      ['Patient', 40],
      ['Sustainable', 90],
      ['Never Injured', 180, { kind: 'rest-recovery', bonus: 0.15 }],
    ], (v) => ({ kind: 'rest-days', count: v })),

    ...branch('grit', 'The Long Climb', [
      ['El Capitan', 2_900],
      ['Mt. Whitney', 14_505],
      ['Everest', 29_032],
      ['Six Figures', 100_000],
      ['The Whole Ladder', 380_495, { kind: 'cosmetic', id: 'kit-alpine', label: 'the Alpine kit' }],
    ], (v) => ({ kind: 'height', feet: v })),

    capstone('grit', 'Unbreakable', 'MEN', { kind: 'project-slot', extra: 2 }),
  ],
};

export const SKILL_TREES: SkillTree[] = [POWER, TENSION, ENDURANCE, TECHNIQUE, GRIT];

export function getTree(id: TreeId): SkillTree | undefined {
  return SKILL_TREES.find((t) => t.id === id);
}
