/**
 * Warmup exercise library (PLAN.md §5.1, §6.7).
 *
 * Each entry declares the tissue it loads, which is what lets the generator
 * refuse to prescribe something that pulls on an injury you have logged.
 * The prototype had this idea and it was one of its better ones; here the
 * body-part vocabulary is shared with the injury tracker and the finder so
 * all three agree on what "elbow" means.
 */

import type { Equipment } from './types';

export type BodyPart =
  | 'fingers'
  | 'pulley'
  | 'wrist'
  | 'elbow'
  | 'shoulder'
  | 'back'
  | 'hip'
  | 'knee'
  | 'ankle';

export type WarmupCategory = 'pulse' | 'shoulder' | 'fingers' | 'hips' | 'core' | 'climbing';

export interface WarmupExercise {
  id: string;
  name: string;
  description: string;
  /** Typical time on task, used to fill the warmup to length. */
  seconds: number;
  category: WarmupCategory;
  equipment: Equipment[];
  /** Tissue this actively loads. Empty means it loads nothing meaningfully. */
  loads: BodyPart[];
}

export const WARMUP_CATEGORY_LABEL: Record<WarmupCategory, string> = {
  pulse: 'Raise the pulse',
  shoulder: 'Shoulders',
  fingers: 'Fingers and forearms',
  hips: 'Hips and legs',
  core: 'Core and tension',
  climbing: 'On the wall',
};

export const WARMUP_EXERCISES: WarmupExercise[] = [
  // ── Pulse raisers ───────────────────────────────────────────────────────
  {
    id: 'easy_cardio',
    name: 'Easy cardio',
    description: 'Five minutes of brisk walking, cycling, or skipping — enough to feel warm, not winded.',
    seconds: 300,
    category: 'pulse',
    equipment: ['none'],
    loads: ['knee', 'ankle'],
  },
  {
    id: 'jumping_jacks',
    name: 'Jumping jacks',
    description: 'Two minutes, steady rhythm. Land softly through the knees.',
    seconds: 120,
    category: 'pulse',
    equipment: ['none'],
    loads: ['knee', 'ankle', 'shoulder'],
  },
  {
    id: 'arm_swings',
    name: 'Arm swings',
    description: 'Big forward and backward circles, then across the body. Builds blood flow without load.',
    seconds: 90,
    category: 'pulse',
    equipment: ['none'],
    loads: ['shoulder'],
  },
  {
    id: 'brisk_walk',
    name: 'Brisk walk',
    description: 'Four minutes at a pace that warms you without raising your breathing much.',
    seconds: 240,
    category: 'pulse',
    equipment: ['none'],
    loads: [],
  },

  // ── Shoulders ───────────────────────────────────────────────────────────
  {
    id: 'band_external_rotations',
    name: 'Band external rotations',
    description: 'Elbow tucked to your side, rotate out against light band tension. 15 per arm.',
    seconds: 90,
    category: 'shoulder',
    equipment: ['gym'],
    loads: ['shoulder', 'elbow'],
  },
  {
    id: 'band_pull_aparts',
    name: 'Band pull-aparts',
    description: 'Arms straight, pull the band apart at chest height. 15 slow reps.',
    seconds: 75,
    category: 'shoulder',
    equipment: ['gym'],
    loads: ['shoulder'],
  },
  {
    id: 'scapular_pull_ups',
    name: 'Scapular pull-ups',
    description: 'Hang with straight arms, then pull the shoulder blades down without bending the elbows. 8 reps.',
    seconds: 90,
    category: 'shoulder',
    equipment: ['hangboard'],
    loads: ['shoulder', 'fingers', 'elbow'],
  },
  {
    id: 'wall_angels',
    name: 'Wall angels',
    description: 'Back flat to the wall, slide the arms overhead keeping wrists and elbows in contact. 10 reps.',
    seconds: 90,
    category: 'shoulder',
    equipment: ['none'],
    loads: ['shoulder'],
  },
  {
    id: 'shoulder_cars',
    name: 'Shoulder CARs',
    description: 'Slow controlled circles at the end of your range, one arm at a time. 5 per side.',
    seconds: 120,
    category: 'shoulder',
    equipment: ['none'],
    loads: ['shoulder'],
  },

  // ── Fingers and forearms ────────────────────────────────────────────────
  {
    id: 'finger_rolls',
    name: 'Finger rolls',
    description: 'Open and close the hands slowly, then roll each finger through its full range. No load.',
    seconds: 60,
    category: 'fingers',
    equipment: ['none'],
    loads: [],
  },
  {
    id: 'wrist_circles',
    name: 'Wrist circles and stretches',
    description: 'Circles both directions, then gentle flexor and extensor stretches. 90 seconds total.',
    seconds: 90,
    category: 'fingers',
    equipment: ['none'],
    loads: ['wrist'],
  },
  {
    id: 'rubber_band_extensions',
    name: 'Finger extensions',
    description: 'Open the fingers against a rubber band or ring. 15 slow reps — the antagonist work your flexors need.',
    seconds: 75,
    category: 'fingers',
    equipment: ['gym'],
    loads: ['fingers', 'wrist'],
  },
  {
    id: 'jug_hangs',
    name: 'Easy jug hangs',
    description: 'Three hangs of 10 seconds on a large hold. Shoulders engaged, never fully passive.',
    seconds: 120,
    category: 'fingers',
    equipment: ['hangboard'],
    loads: ['fingers', 'pulley', 'shoulder', 'elbow'],
  },
  {
    id: 'hang_ladder',
    name: 'Hang ladder',
    description: 'Progressive hangs from a 30mm edge down toward your working size, at low intensity. Never to failure.',
    seconds: 240,
    category: 'fingers',
    equipment: ['hangboard'],
    loads: ['fingers', 'pulley', 'elbow'],
  },

  // ── Hips and legs ───────────────────────────────────────────────────────
  {
    id: 'leg_swings',
    name: 'Leg swings',
    description: 'Forward-back then side-to-side, holding a wall. 10 each way per leg.',
    seconds: 120,
    category: 'hips',
    equipment: ['none'],
    loads: ['hip'],
  },
  {
    id: 'deep_squat_hold',
    name: 'Deep squat hold',
    description: 'Sink into a deep squat and hold, gently pushing the knees out. 60 seconds.',
    seconds: 60,
    category: 'hips',
    equipment: ['none'],
    loads: ['hip', 'knee', 'ankle'],
  },
  {
    id: 'worlds_greatest_stretch',
    name: "World's greatest stretch",
    description: 'Lunge, drop the elbow inside the front foot, then rotate open. 3 per side.',
    seconds: 120,
    category: 'hips',
    equipment: ['none'],
    loads: ['hip', 'back', 'knee'],
  },
  {
    id: 'high_steps',
    name: 'High steps',
    description: 'Step onto a bench or hold at hip height, controlled up and down. 8 per side.',
    seconds: 120,
    category: 'hips',
    equipment: ['none'],
    loads: ['hip', 'knee'],
  },

  // ── Core and tension ────────────────────────────────────────────────────
  {
    id: 'cat_cow',
    name: 'Cat-cow',
    description: 'Ten slow cycles, moving the spine segment by segment.',
    seconds: 90,
    category: 'core',
    equipment: ['none'],
    loads: ['back'],
  },
  {
    id: 'dead_bugs_warmup',
    name: 'Dead bugs',
    description: 'Ten per side with the lower back pressed flat. Wakes up the anti-extension pattern.',
    seconds: 90,
    category: 'core',
    equipment: ['none'],
    loads: ['back'],
  },
  {
    id: 'glute_bridges_warmup',
    name: 'Glute bridges',
    description: 'Fifteen reps, squeezing at the top. Switches on the hips before you load them.',
    seconds: 75,
    category: 'core',
    equipment: ['none'],
    loads: ['hip', 'back'],
  },
  {
    id: 'plank_warmup',
    name: 'Short plank',
    description: 'Thirty seconds of full-body tension — not an endurance test, just a switch-on.',
    seconds: 60,
    category: 'core',
    equipment: ['none'],
    loads: ['shoulder', 'back'],
  },

  // ── On the wall ─────────────────────────────────────────────────────────
  {
    id: 'easy_traverse',
    name: 'Easy traversing',
    description: 'Five minutes of low, easy traversing on big holds. Feet quiet, arms straight.',
    seconds: 300,
    category: 'climbing',
    equipment: ['wall'],
    loads: ['fingers', 'shoulder', 'elbow'],
  },
  {
    id: 'easy_problems',
    name: 'Easy problems',
    description: 'Four or five boulders several grades below your limit, climbed smoothly.',
    seconds: 480,
    category: 'climbing',
    equipment: ['wall'],
    loads: ['fingers', 'pulley', 'shoulder', 'elbow'],
  },
  {
    id: 'downclimbing',
    name: 'Downclimb everything',
    description: 'Climb easy problems and downclimb them rather than jumping off. Doubles the mileage, halves the impact.',
    seconds: 300,
    category: 'climbing',
    equipment: ['wall'],
    loads: ['fingers', 'shoulder', 'knee'],
  },
];

export function getWarmupExercise(id: string): WarmupExercise | undefined {
  return WARMUP_EXERCISES.find((e) => e.id === id);
}
