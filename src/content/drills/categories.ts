/**
 * The drill categories, and the library by category (PLAN.md M345).
 *
 * Out of `index.ts`, the registry the first load reads drills through. The
 * category table is text for the drill pages and the objective page, and
 * the plateau and challenge readings list drills by it — none of which is
 * on the boot path.
 */

import type { Drill, DrillCategory } from '../types';
import { allDrills } from './index';

export const DRILL_CATEGORIES: Record<DrillCategory, { label: string; description: string }> = {
  technique: { label: 'Technique', description: 'Movement quality, footwork, body position.' },
  power: { label: 'Power', description: 'Maximal force and explosive movement.' },
  'finger-strength': { label: 'Finger Strength', description: 'Hangboard, crimp, and contact strength.' },
  endurance: { label: 'Endurance', description: 'Aerobic capacity and time on the wall.' },
  'power-endurance': {
    label: 'Power Endurance',
    description: 'Repeated hard efforts under accumulating pump.',
  },
  performance: { label: 'Performance', description: 'Send-focused sessions and peak expression.' },
  strategy: { label: 'Strategy', description: 'Beta reading, tactics, and projecting process.' },
  mental: { label: 'Mental', description: 'Fear, focus, and pressure management.' },
  recovery: { label: 'Recovery', description: 'Deloads, active rest, and tissue care.' },
  assessment: { label: 'Assessment', description: 'Benchmark testing and retests.' },
};

export function drillsByCategory(category: DrillCategory): Drill[] {
  return allDrills().filter((d) => d.category === category);
}
