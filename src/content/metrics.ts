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

  // Core
  core_lever: {
    id: 'core_lever',
    label: 'Core Lever',
    unit: 'level/sec',
    kind: 'text',
    higherIsBetter: true,
    description: 'Front lever progression reached and hold time, e.g. "advanced tuck / 8s".',
  },

  // Mobility
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
};

export function getMetric(id: MetricId): Metric | undefined {
  return METRICS[id];
}
