/**
 * Drill library (PLAN.md §4.2).
 *
 * The single source for drills. Programs reference these by id — the old
 * app kept a 108-entry library *and* 144 inline copies inside the program
 * data, referenced nothing by id, and let the two drift (AUDIT.md §8.9).
 *
 * Ported program by program as M1 proceeds; `sources` records provenance.
 */

import type { Drill, DrillCategory, DrillId } from './types';

export const DRILL_CATEGORIES: Record<DrillCategory, { label: string; description: string }> = {
  technique: { label: 'Technique', description: 'Movement quality, footwork, body position.' },
  power: { label: 'Power', description: 'Maximal force and explosive movement.' },
  'finger-strength': { label: 'Finger Strength', description: 'Hangboard, crimp, and contact strength.' },
  endurance: { label: 'Endurance', description: 'Aerobic capacity and time on the wall.' },
  'power-endurance': { label: 'Power Endurance', description: 'Repeated hard efforts under accumulating pump.' },
  performance: { label: 'Performance', description: 'Send-focused sessions and peak expression.' },
  strategy: { label: 'Strategy', description: 'Beta reading, tactics, and projecting process.' },
  mental: { label: 'Mental', description: 'Fear, focus, and pressure management.' },
  recovery: { label: 'Recovery', description: 'Deloads, active rest, and tissue care.' },
  assessment: { label: 'Assessment', description: 'Benchmark testing and retests.' },
};

export const DRILLS: Drill[] = [
  // ── Base Camp ───────────────────────────────────────────────────────────
  {
    id: 'sticky_feet',
    name: 'Sticky Feet',
    description:
      'Climb 6-8 V0-V2 boulders at RPE 4-5. Rule: once a foot is placed on a hold, it does NOT move until you step to the next hold. No readjusting, no pivoting, no "just a nudge." Forces you to commit to foot placement before weighting — the root habit of precise climbing. If you catch yourself adjusting, downclimb and restart.',
    duration: '45-60 min',
    focus: 'Footwork Precision',
    category: 'technique',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'flagging',
    name: 'Flagging',
    description:
      'Climb 6-8 moderate boulders. On every reach with your RIGHT hand, flag your LEFT leg behind you (outside flag or back flag) to counterbalance. Same for left-hand reaches with the right leg. Flagging prevents the barn-door swing that cuts feet. Climb slower than usual to think through each reach.',
    duration: '45-60 min',
    focus: 'Body Positioning',
    category: 'technique',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'hover_hands_3s_pause',
    name: 'Hover Hands (3s pause)',
    description:
      'Before placing each hand on a hold, hover it above the target for a 3-count. Stay still — no micro-adjustments, no eyeing the next move. Place precisely, commit, move on. Forces static body position under load and trains the nervous system to find the quiet position between moves.',
    duration: '45-60 min',
    focus: 'Static Control',
    category: 'technique',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['none'],
    sources: ['base_camp'],
  },
  {
    id: 'the_trifecta_all_three',
    name: 'The Trifecta (all three)',
    description:
      'Combine Sticky Feet + Flagging + Hover Hands on every climb. 6-8 boulders, V-easy. This is the hardest drill week because all three constraints compound — a session finishes slower than normal. Quality over quantity: one beautifully climbed boulder beats five messy ones.',
    duration: '45-60 min',
    focus: 'Integrated Technique',
    category: 'technique',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'endurance_intervals_4x4',
    name: '4x4 Endurance Intervals',
    description:
      'Pick 4 boulders you can flash (2 grades below your max). Climb all 4 back-to-back with no rest between boulders. Rest 3 min. Repeat for 4 rounds = 16 climbs total. Heart rate stays elevated, forearms learn to recover while climbing. If you can’t complete a round, downgrade one boulder and continue.',
    duration: '60 min',
    focus: 'Endurance Capacity',
    category: 'endurance',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'volume_build_mini_assessment',
    name: 'Volume Build + Mini-Assessment',
    description:
      'First half: retest Max Push-Ups, Max Pull-Ups, Dead Hang. Log to Assessment. Second half: climb 20-30 boulders at Flash grade minus 1. Keep Quiet Feet discipline throughout. This week is your first measurable check-in against Week 0 baselines.',
    duration: '60-75 min',
    focus: 'Capacity + Metrics',
    category: 'assessment',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'continuous_circuit_5_10_min',
    name: 'Continuous Circuit 5-10 min',
    description:
      'Build a route by traversing along the easy wall. Climb continuously for 5 minutes without stepping down. Rest 3 min. Repeat 3-4 times, adding 30s to each round. Trains aerobic endurance and pump management. Focus on resting on good holds mid-climb — the ability to rest on the wall is a learnable skill.',
    duration: '45-60 min',
    focus: 'Pump Management',
    category: 'endurance',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'deload_flow_rpe_5',
    name: 'Deload: Flow RPE 5',
    description:
      'Intentional easy week. Climb 30 min at RPE 5 on terrain 2+ grades below max. No drills, no constraints — just fluid, relaxed climbing. Recovery week before the mental-game phase. Sleep matters more than the session. Reduce all Engine Room sets to 2.',
    duration: '30-45 min',
    focus: 'Recovery',
    category: 'recovery',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'box_breathing_projecting',
    name: 'Box Breathing + Projecting',
    description:
      'Pick a project 1-2 grades above your flash level. Before every attempt, do 4 rounds of box breathing: inhale 4s, hold 4s, exhale 4s, hold 4s. Slows the heart rate, focuses attention, and builds the pre-attempt ritual. 3-5 attempts total, 5 min rest between. The breathing is the drill, not the send.',
    duration: '60 min',
    focus: 'Mental Training',
    category: 'mental',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['none'],
    sources: ['base_camp'],
  },
  {
    id: 'intro_to_dynos',
    name: 'Intro to Dynos',
    description:
      'Pick 3-4 juggy V0-V2 boulders. Instead of reaching for each hold, generate momentum and commit to a small dynamic move. Start with mini-pops (both feet stay on) and progress to full deadpoints. This is the FIRST exposure to dynamic movement — form over distance. If you feel any shoulder tweak, stop and switch to static.',
    duration: '45-60 min',
    focus: 'Dynamic Movement',
    category: 'technique',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['wall'],
    sources: ['base_camp'],
  },
  {
    id: 'send_week_foundations',
    name: 'Send Week',
    description:
      'Pick the hardest project you’ve been eyeing. Apply everything: Quiet Feet, Flagging, Hover Hands when possible, Box Breathing before each attempt. 3-5 quality burns, 5-10 min rest between. This is your first performance peak. If you send, try the next grade up. If you don’t, the beta is banked for next cycle.',
    duration: '60-90 min',
    focus: 'Performance',
    category: 'performance',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['none'],
    sources: ['base_camp'],
  },
  {
    id: 'graduation_retest_foundations',
    name: 'Graduation Retest',
    description:
      'Repeat every Week 0 baseline: Max Push-Ups, Max Pull-Ups, Dead Hang, Core Plank, Flash Grade, Capacity Test (4x4). Log everything — this is your graduation scorecard. Compare to Week 0 numbers; the data rules the story.',
    duration: '60 min',
    focus: 'Assessment',
    category: 'assessment',
    discipline: 'both',
    level: 'V0-V2',
    equipment: ['none'],
    sources: ['base_camp'],
  },

  // ── Iron Grip ───────────────────────────────────────────────────────────
  {
    id: 'limit_boulders_on_the_crimps',
    name: 'Limit Boulders on the Crimps',
    description:
      'Pick 3-5 crimpy boulders at your limit minus 1 grade. Climb each 2-3 times, resting 3-5 min between burns. Focus on precise crimp placement and purposeful body position. If you feel any finger tweak, STOP — Repeater phase should not push into pain.',
    duration: '45-60 min',
    focus: 'Crimp Strength Application',
    category: 'finger-strength',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'volume_on_moderate_crimps',
    name: 'Volume on Moderate Crimps',
    description:
      '20-25 moderate boulders (2 grades below max) with crimp holds. Move through them steadily, rest 1-2 min between. Builds tendon tolerance and crimp-position mileage. The Anvil phase is about time-on-the-edge — this accumulates it.',
    duration: '45-60 min',
    focus: 'Tendon Mileage',
    category: 'finger-strength',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'projecting_with_crimp_focus',
    name: 'Projecting With Crimp Focus',
    description:
      'Pick 2-3 limit projects featuring crimp moves. Bias your beta toward crimp holds even when pinch or jug alternatives exist — this is the applied version of the hangboard work. 4-6 burns per project, 5 min rest.',
    duration: '60-90 min',
    focus: 'Applied Crimp Strength',
    category: 'finger-strength',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard'],
    sources: ['iron_grip'],
  },
  {
    id: 'deload_flow_session',
    name: 'DELOAD: Flow Session',
    description:
      'End of Phase 1. Intentional easy week — no crimp focus, no limit attempts. Climb 30-45 min at RPE 5 on juggy terrain. Sleep and protein matter more than the session. The Hammer phase is about to demand everything; arrive fresh.',
    duration: '30-45 min',
    focus: 'Recovery',
    category: 'recovery',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'power_endurance_circuit',
    name: 'Power Endurance Circuit',
    description:
      'Pick 4-6 boulders at 2-3 grades below your max. Climb them back-to-back with no rest, then rest 4 minutes. Repeat 3-4 sets. Builds the ability to pull hard repeatedly — where your new max hangs will actually pay off in real climbing.',
    duration: '45-60 min',
    focus: 'Power Endurance',
    category: 'power-endurance',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'limit_bouldering_sessions',
    name: 'Limit Bouldering Sessions',
    description:
      'Peak intensity climbing. Pick 2-3 projects at or above your max grade. 5-8 burns per project with 5+ min rest. This is where Phase 2’s max hang gains show up. Take a full rest day after — Max Hang sessions and limit climbing together is heavy CNS load.',
    duration: '60-90 min',
    focus: 'Limit Strength',
    category: 'power',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'the_crimp_project',
    name: 'The Crimp Project',
    description:
      'Find a project that scared you 6 weeks ago because of its crimps. Attempt it now — burn after burn, 5-10 min rest. You may not send. You will be shocked at how different it feels. Collect beta, note the crux, set a plan for Phase 3.',
    duration: '60-90 min',
    focus: 'Projecting',
    category: 'strategy',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['none'],
    sources: ['iron_grip'],
  },
  {
    id: 'deload_max_hang_day_off_flow',
    name: 'DELOAD: Max-Hang-Day-Off Flow',
    description:
      'End of Phase 2. Very easy climbing only. No hangboard this week. Sleep + food > sessions. Campus board is about to enter the picture — your fingers need to be fully recovered.',
    duration: '30-45 min',
    focus: 'Recovery',
    category: 'recovery',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'campus', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'contact_strength_projecting',
    name: 'Contact Strength Projecting',
    description:
      'Pick 2-3 max-grade projects with dynamic moves — dyno, paddle, deadpoint. Focus on projecting the crux — the single hardest move — with long rests (5+ min). This is where campus-board power meets real rock. Quality over quantity.',
    duration: '60-90 min',
    focus: 'Contact Strength',
    category: 'power',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['campus'],
    sources: ['iron_grip'],
  },
  {
    id: 'crimp_pull_power_application',
    name: 'Crimp Pull-Power Application',
    description:
      'Campus board recruits fast-twitch; the wall is where you cash it in. Pick 3-4 boulders with BOTH small crimps AND dynamic moves. Burn them hard — 3-5 attempts each, full rest. Film yourself if possible; campus-phase form breaks quickly.',
    duration: '60-90 min',
    focus: 'Power + Crimp Integration',
    category: 'finger-strength',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['campus', 'wall'],
    sources: ['iron_grip'],
  },
  {
    id: 'send_week_crimp',
    name: 'Send Week',
    description:
      'Peak performance of the program. Pick your hardest crimp project and commit the week to sending it. 2 sessions of 4-6 quality burns each with long rest. Box Breathe before each attempt. This is what 12 weeks of finger work paid for.',
    duration: '60-90 min',
    focus: 'Performance',
    category: 'performance',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['none'],
    sources: ['iron_grip'],
  },
  {
    id: 'graduation_retest_fingers',
    name: 'Graduation Retest',
    description:
      'Retest every Week 0 baseline: Max Hang at 20mm, Weighted Pull-Ups 3RM, 90° Lock-Off, Core Lever progression, Max Pull-Ups, Dead Hang. Log everything. Then rest 3 full days before any climbing — transition to deload maintenance.',
    duration: '60 min',
    focus: 'Assessment',
    category: 'assessment',
    discipline: 'both',
    level: 'V5-V8',
    equipment: ['hangboard', 'gym', 'wall'],
    sources: ['iron_grip'],
  },
];

const BY_ID = new Map<DrillId, Drill>(DRILLS.map((d) => [d.id, d]));

export function getDrill(id: DrillId): Drill | undefined {
  return BY_ID.get(id);
}

export function drillsByCategory(category: DrillCategory): Drill[] {
  return DRILLS.filter((d) => d.category === category);
}

export interface DrillFilter {
  category?: DrillCategory;
  discipline?: Exclude<import('./types').Discipline, 'both'>;
  equipment?: import('./types').Equipment[];
  search?: string;
}

/** Filter the library. `discipline: 'boulder'` also matches 'both' drills;
 *  `equipment` matches drills whose needs are all available. */
export function filterDrills(filter: DrillFilter): Drill[] {
  const needle = filter.search?.trim().toLowerCase();
  return DRILLS.filter((d) => {
    if (filter.category && d.category !== filter.category) return false;
    if (filter.discipline && d.discipline !== filter.discipline && d.discipline !== 'both') return false;
    if (filter.equipment) {
      const have = new Set(filter.equipment);
      if (!d.equipment.every((e) => e === 'none' || have.has(e))) return false;
    }
    if (needle) {
      const haystack = `${d.name} ${d.focus} ${d.description}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
