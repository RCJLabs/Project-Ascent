/**
 * Global metric registry (PLAN.md §4.7).
 *
 * Assessment history is keyed by these stable ids, so editing or reordering
 * a program's assessment list can never silently reassign past values —
 * the old app keyed results by `${programId}-${phaseIndex}-${metricIndex}`
 * (AUDIT.md §8.4).
 *
 * Metrics are shared across programs: 'max_hang_20mm_7s' means the same
 * test whether Iron Grip or The Siege asks for it, so the chart is
 * continuous when a climber moves between programs.
 */

import type { Metric, MetricId } from './types';

export const METRICS: Record<MetricId, Metric> = {
  // Finger strength
  max_hang_20mm_7s: {
    id: 'max_hang_20mm_7s',
    label: 'Max Hang 20mm 7s',
    unit: 'BW+lbs',
    kind: 'number',
    higherIsBetter: true,
    description:
      'Added weight for a 7-second half-crimp hang on a 20mm edge. The standard finger-strength benchmark.',
  },
  repeater_weight: {
    id: 'repeater_weight',
    label: 'Repeater Weight',
    unit: 'lbs',
    kind: 'number',
    higherIsBetter: true,
    description: 'Added weight used for 7/3 repeaters at the prescribed RPE.',
  },
  min_edge: {
    id: 'min_edge',
    label: 'Min Edge Achievable',
    unit: 'mm',
    kind: 'number',
    higherIsBetter: false,
    description: 'Smallest edge held for 7 seconds at bodyweight.',
  },
  dead_hang: {
    id: 'dead_hang',
    label: 'Dead Hang',
    unit: 'sec',
    kind: 'number',
    higherIsBetter: true,
    description: 'Bodyweight hang to failure on a 20mm edge.',
  },

  // Pulling and pressing
  weighted_pullup_3rm: {
    id: 'weighted_pullup_3rm',
    label: 'Weighted Pull-Ups 3RM',
    unit: 'BW+lbs',
    kind: 'number',
    higherIsBetter: true,
  },
  max_pullups: {
    id: 'max_pullups',
    label: 'Max Pull-Ups',
    unit: 'reps',
    kind: 'number',
    higherIsBetter: true,
  },
  max_pushups: {
    id: 'max_pushups',
    label: 'Max Push-Ups',
    unit: 'reps',
    kind: 'number',
    higherIsBetter: true,
  },
  lock_off_90: {
    id: 'lock_off_90',
    label: 'Lock-Off 90°',
    unit: 'sec',
    kind: 'number',
    higherIsBetter: true,
    description: 'Single-arm lock-off hold at 90 degrees of elbow flexion.',
  },

  scapular_pushup: {
    id: 'scapular_pushup',
    label: 'Scapular Push-Up',
    unit: 'reps',
    kind: 'number',
    higherIsBetter: true,
    description: 'Protraction/retraction reps in a push-up position, with arms straight throughout.',
  },
  wrist_extensor_curls: {
    id: 'wrist_extensor_curls',
    label: 'Wrist Extensor Curls',
    unit: 'reps',
    kind: 'number',
    higherIsBetter: true,
  },

  // Core
  core_plank: {
    id: 'core_plank',
    label: 'Core Plank',
    unit: 'sec',
    kind: 'number',
    higherIsBetter: true,
    description: 'Front plank held to the first form breakdown.',
  },
  dead_bug_20: {
    id: 'dead_bug_20',
    label: 'Dead Bug 20 reps',
    unit: 'pass/fail',
    kind: 'passfail',
    higherIsBetter: true,
    description: 'Twenty controlled reps with the lower back staying flat on the floor.',
  },
  core_lever: {
    id: 'core_lever',
    label: 'Core Lever',
    unit: 'level/sec',
    kind: 'text',
    higherIsBetter: true,
    description: 'Front lever progression reached and hold time, e.g. "advanced tuck / 8s".',
  },

  // Mobility
  wall_angel: {
    id: 'wall_angel',
    label: 'Wall Angel',
    unit: 'pass/fail',
    kind: 'passfail',
    higherIsBetter: true,
    description:
      'Back flat to the wall, arms sliding overhead with wrists and elbows staying in contact. A shoulder-mobility screen.',
  },
  toe_touch: {
    id: 'toe_touch',
    label: 'Toe Touch',
    unit: 'in from floor',
    kind: 'number',
    higherIsBetter: false,
    description: 'Distance from fingertips to the floor on a straight-leg forward fold. Lower is better.',
  },
  flexibility: {
    id: 'flexibility',
    label: 'Flexibility',
    unit: 'score',
    kind: 'number',
    higherIsBetter: true,
    description: 'Self-scored mobility check used by the derived AGI stat.',
  },

  // Performance ceilings
  max_boulder_grade: {
    id: 'max_boulder_grade',
    label: 'Max Boulder Grade',
    unit: '',
    kind: 'grade',
    scale: 'V',
    higherIsBetter: true,
  },
  max_sport_grade: {
    id: 'max_sport_grade',
    label: 'Max Sport Grade',
    unit: '',
    kind: 'grade',
    scale: 'YDS',
    higherIsBetter: true,
  },
  flash_grade: {
    id: 'flash_grade',
    label: 'Flash Grade',
    unit: '',
    kind: 'grade',
    scale: 'V',
    higherIsBetter: true,
    description: 'The hardest grade you reliably send first try.',
  },
  capacity_test_4x4: {
    id: 'capacity_test_4x4',
    label: 'Capacity Test (4x4)',
    unit: 'sends',
    kind: 'number',
    higherIsBetter: true,
    description: 'Completed climbs in a 4x4 interval session — a work-capacity benchmark.',
  },
};

export function getMetric(id: MetricId): Metric | undefined {
  return METRICS[id];
}
