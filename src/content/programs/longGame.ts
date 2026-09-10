/**
 * The Long Game — 12-week route and endurance (5.9-5.12).
 *
 * The first rope program in the catalog, so the first graded on the YDS
 * ladder and the first whose assessments track on-sight and redpoint grades
 * separately. Brings in ARCing, the last of the protocols whose definition
 * the prototype had to pin inside an AI prompt.
 */

import type { Exercise, Program } from '../types';

const PHASE = { base: 'base', engine: 'engine', send: 'send' } as const;

const CORE_POOL: Exercise[] = [
  { name: 'Plank', hold: '45-60s' },
  { name: 'Dead Bugs', reps: '12' },
  { name: 'Hollow Body', hold: '20-30s' },
  { name: 'Knee Raises', reps: '8-10' },
  { name: 'Windshield Wipers', reps: '8 per side' },
];

const ARMOR: Exercise[] = [
  { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
  { name: 'Finger Extensions', sets: '3', reps: '15' },
  { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
  { name: 'Face Pulls', sets: '2', reps: '15' },
];

export const THE_LONG_GAME: Program = {
  id: 'the_long_game',
  name: 'The Long Game',
  subtitle: '12-Week Route & Endurance',
  kind: 'program',
  stage: 'style',
  discipline: 'sport',
  gradeRange: { scale: 'YDS', min: '5.9', max: '5.12a', label: '5.9-5.12' },
  weeks: 12,
  // One prescription of thirty-three touches a dumbbell, and it is written
  // "Max Push-Ups or DB Press" — the program already supplies its own
  // alternative.
  equipment: ['wall'],
  helpfulEquipment: ['gym'],

  intro: {
    pitch:
      'A 12-week route-endurance program for sport climbers. Builds the aerobic base, the pump tolerance, and the redpoint tactics that let you climb long pitches without falling off pumped.',
    rhythm: [
      '4 sessions per week. Endurance and Performance should not land on consecutive days.',
      'Phase 1 (The Base) is all ARC — long, easy, continuous climbing that builds capillary density. Phase 2 (The Engine) converts that base into pump tolerance with linked laps and intervals. Phase 3 (The Send) tapers hard and points everything at your project.',
      'Endurance sessions go first, when you are fresh. Strength and Armor goes on a non-climbing day. Performance climbing follows at least one easy day.',
      'ARC is supposed to feel too easy. If you are pumping out during Phase 1, you are climbing too hard for the adaptation you want.',
    ],
    graduation:
      'By week 12 you will have a real aerobic engine, a trained taper, and a redpoint process you can reuse on any project. Next: The Siege for a 5.13 project, The Cruiser to maintain, or Iron Grip if fingers are the limiter.',
  },

  phases: [
    {
      id: PHASE.base,
      name: 'The Base (ARC)',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Base phase builds the aerobic foundation through ARC training — long, continuous, easy climbing that develops capillary density in the forearms. It is the least exciting phase and the one that makes every later phase possible. The adaptation is vascular, so intensity is the enemy here.',
      goals: [
        'Build capillary density with continuous easy climbing',
        'Groove shakeout and clipping habits while fresh',
        'Establish route-reading routine before every attempt',
        'Maintain baseline pulling strength without chasing PRs',
      ],
    },
    {
      id: PHASE.engine,
      name: 'The Engine',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Engine phase converts the aerobic base into usable pump tolerance. Linked laps, 4x4 intervals, and pump-clock work teach you to keep climbing well after the forearms fill. Phase 1 taught you not to pump; this phase teaches you to climb through it.',
      goals: [
        'Build power endurance with linked laps and intervals',
        'Extend time-to-pump through active shakeouts',
        'Decode a redpoint project section by section',
        'Hold strength work at maintenance while volume climbs',
      ],
    },
    {
      id: PHASE.send,
      name: 'The Send',
      weekStart: 9,
      weekEnd: 12,
      description:
        'The Send phase tapers volume sharply and points every session at the project. Endurance work drops to maintenance, visualization becomes part of every burn, and the goal shifts from building capacity to expressing it in a send window.',
      goals: [
        'Taper endurance volume to arrive fresh',
        'Run full redpoint burns with visualization before each',
        'Refine tactics from video and honest post-burn notes',
        'Send the project and retest the graduation baselines',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'end',
      name: 'Endurance Session',
      icon: '🔥',
      description: 'ARC, power endurance, or redpoint burns depending on the phase.',
      fields: ['routesCompleted', 'pumpLevel'],
      drillsByWeek: {
        1: 'tlg_arc_2x10',
        2: 'tlg_arc_2x15',
        3: 'tlg_arc_2x20',
        4: 'tlg_deload_arc_movement',
        5: 'tlg_linked_laps_doubles',
        6: 'tlg_4x4_route_intervals',
        7: 'tlg_the_pump_clock',
        8: 'tlg_deload_arc_2x10',
        9: 'tlg_linked_laps_shakeout',
        10: 'tlg_maintenance_linked_laps',
        11: 'tlg_arc_taper',
        12: 'tlg_no_endurance_send_week',
      },
    },
    {
      id: 'eng',
      name: 'Strength & Armor',
      icon: '⚙️',
      description: 'Pull and push maintenance, core, and armor. Runs on a non-climbing day.',
      blocks: [
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.base]: {
              rationale:
                'Base phase: maintenance pulling. You’re not building — you’re keeping what you had so endurance training doesn’t erode it. Pick whichever pulling variation lets you do 3 sets of 6-8 clean reps. Don’t chase PRs in this program.',
              exercises: [{ name: 'Inverted Rows or Pull-Ups', sets: '3', reps: '6-8' }],
            },
            [PHASE.engine]: {
              rationale:
                'Engine phase: still maintenance. Power-endurance intervals tax the forearms heavily; adding more pull volume on top can tip into overtraining. Keep the same 3x6-8, same tempo, same exercise. If shoulders feel beat up, drop to 3x5.',
              exercises: [
                { name: 'Inverted Rows or Pull-Ups', sets: '3', reps: '6-8', notes: 'Drop to 3x5 if shoulders feel beat up.' },
              ],
            },
            [PHASE.send]: {
              rationale:
                'Send phase: minimum effective dose. If your projecting sessions are intense, consider cutting this to 2x6-8 or skipping entirely in Week 12. Your strength isn’t the limiter — your fresh fingers and forearms are.',
              exercises: [
                { name: 'Inverted Rows or Pull-Ups', sets: '2-3', reps: '6-8', notes: 'Skippable in week 12.' },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [PHASE.base]: {
              rationale:
                'Antagonist balance for rope-climbing posture. Keeps the shoulders honest under the pulling-dominant loads of endurance climbing. Full ROM, controlled tempo.',
              exercises: [{ name: 'Max Push-Ups or DB Press', sets: '3', reps: '10-12' }],
            },
            [PHASE.engine]: {
              rationale:
                'Same. If your linked-laps sessions leave the shoulders feeling pinched, bump to 3x12 — volume is your friend here, not load. Skip if push feels flat and you’re conserving for climbing.',
              exercises: [{ name: 'Max Push-Ups or DB Press', sets: '3', reps: '10-12' }],
            },
            [PHASE.send]: {
              rationale:
                'Maintenance only. Don’t add load in send phase. The insurance policy stays in place even when you’re deloading other work.',
              exercises: [{ name: 'Max Push-Ups or DB Press', sets: '3', reps: '10-12' }],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [PHASE.base]: {
              rationale:
                'Pick 4 exercises. 45-60s (or 8-12 reps) each, 2 rounds, minimal rest. Core endurance matters more than core max on long pitches — you need the core to fire on the 20th move as well as the 1st. Choose variety across rounds; don’t pick only anti-extension or only rotation work.',
              selection: { pick: 4 },
              circuit: { rounds: '2', restBetween: 'Minimal' },
              exercises: CORE_POOL,
            },
            [PHASE.engine]: {
              rationale:
                'Same 4-exercise pick, 2 rounds. Engine phase’s power-endurance intervals already tax the core via sustained tension on the wall — this is reinforcing that adaptation, not replacing it.',
              selection: { pick: 4 },
              circuit: { rounds: '2', restBetween: 'Minimal' },
              exercises: CORE_POOL,
            },
            [PHASE.send]: {
              rationale:
                'Maintenance: 2 or 3 exercises, 1-2 rounds is enough. No need to hit failure. Your project’s crux already trains your core at max demand.',
              selection: { pick: 3 },
              circuit: { rounds: '1-2', restBetween: 'Minimal' },
              exercises: CORE_POOL,
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor',
          perPhase: {
            [PHASE.base]: {
              rationale:
                'Tendon insurance. Even at low climbing intensity, endurance volume adds up — the repetitive loading can sneak up on forearms and shoulders. Light load, high volume, every single Strength day.',
              exercises: ARMOR,
            },
            [PHASE.engine]: {
              rationale:
                'Same routine. If anything feels tight (grumpy elbow, sensitive shoulder), add a fourth set on the affected tissue — volume at light load is what tendons respond to.',
              exercises: ARMOR,
            },
            [PHASE.send]: {
              rationale:
                'Non-negotiable through send phase. This is the one block you do not scale back. A tweaked pulley or elbow injury in Week 11 is a catastrophe; 10 minutes of armor work prevents it.',
              exercises: ARMOR,
            },
          },
        },
      ],
    },
    {
      id: 'perf',
      name: 'Performance Climbing',
      icon: '⚡',
      description: 'On-sight attempts, redpoint burns, and lead fall practice.',
      fields: ['highPoint', 'pumpLevel'],
      drillsByWeek: {
        1: 'tlg_onsight_route_reading',
        2: 'tlg_clipping_drills',
        3: 'tlg_fall_ladder',
        4: 'tlg_deload_easy_onsights',
        5: 'tlg_project_selection_burns',
        6: 'tlg_crux_to_chains',
        7: 'tlg_full_redpoint_attempts',
        8: 'tlg_deload_volume_day',
        9: 'tlg_visualization_burns',
        10: 'tlg_film_review_projecting',
        11: 'tlg_peak_conditions_send',
        12: 'tlg_send_week',
      },
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Mobility flow. No climbing.',
      isRest: true,
    },
  ],

  deloadWeeks: [4, 8, 11],

  frequency: '4 sessions/week. Endurance and Performance should not be on consecutive days.',
  ordering:
    'Endurance session when fresh. Strength/Armor on a non-climbing day. Performance climbing after at least one easy day.',

  constraints: [
    { kind: 'sessions-per-week', min: 4, max: 4, note: 'Four sessions per week.' },
    {
      kind: 'min-gap-hours',
      between: ['end', 'perf'],
      hours: 48,
      note: 'Endurance and Performance should not be on consecutive days.',
    },
    {
      kind: 'order-in-week',
      first: 'end',
      then: 'perf',
      note: 'Endurance goes first in the week, while you are fresh.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'As prescribed — Endurance, Strength & Armor, Performance, plus a volume day.',
    slots: { 1: 'end', 2: 'eng', 4: 'perf', 6: 'end' },
  },

  assessments: ['arc_duration', 'dead_hang', 'onsight_grade', 'redpoint_grade', 'max_pushups', 'core_plank'],

  prerequisites: {
    soft: true,
    note: 'Built on a 5.9 on-sight, a 45-second dead hang, a 90-second plank and ten strict push-ups. The volume here assumes that base is already there.',
    metrics: [
      { metricId: 'onsight_grade', atLeast: 5 },
      { metricId: 'dead_hang', atLeast: 45 },
      { metricId: 'core_plank', atLeast: 90 },
      { metricId: 'max_pushups', atLeast: 10 },
    ],
  },

  nextPrograms: [
    {
      id: 'the_siege',
      reason: 'Ready to push 5.13? Siege a single project across 12 weeks — Decode, Link, Send.',
    },
    { id: 'the_cruiser', reason: 'Maintain your endurance base between send seasons.' },
    {
      id: 'iron_grip',
      reason: 'If finger strength is limiting your sport grade, cycle through a focused finger block.',
    },
    { id: 'peak_performance', reason: 'If you also boulder and want to push V8+ in the off-season.' },
  ],
};
