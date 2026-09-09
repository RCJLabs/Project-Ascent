/**
 * Gravity Defied — 12-week dynamic climbing (V2-V5).
 *
 * The first program where *two* session types are drill-driven: Technical
 * Flight teaches one dyno pattern per week, and Performance & Limit applies
 * it at the limit. Its Armor block also prescribes the same exercises in
 * every phase with different coaching each time, so the exercises are
 * declared once and shared.
 */

import type { Exercise, Program } from '../types';

const PHASE = { mechanics: 'mechanics', advanced: 'advanced', flight: 'flight' } as const;

/** Armor is deliberately identical in all three phases — only the reason
 *  for doing it changes. */
const ARMOR: Exercise[] = [
  { name: 'Band External Rotations', sets: '2', reps: '12 per arm', load: 'Light' },
  { name: 'Face Pulls', sets: '2', reps: '15' },
  { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
  { name: 'Wrist Extensor Curls', sets: '2', reps: '15' },
];

export const GRAVITY_DEFIED: Program = {
  id: 'gravity_defied',
  name: 'Gravity Defied',
  subtitle: '12-Week Dynamic Climbing',
  kind: 'program',
  stage: 'style',
  discipline: 'boulder',
  gradeRange: { scale: 'V', min: 'V2', max: 'V5', label: 'V2-V5' },
  weeks: 12,
  equipment: ['wall', 'gym', 'hangboard'],

  intro: {
    pitch:
      'A 12-week dynamic-climbing program for V2-V5 boulderers who want to move like parkour practitioners. Teaches deadpoints, dynos, run-and-jumps, and coordinate moves — the stuff that makes modern competition-style bouldering possible.',
    rhythm: [
      '3+1 per week: three committed days plus one optional volume day. Dynamic climbing needs more recovery than static work — don’t skip rest days.',
      'Technical Flight sessions focus on the dyno drill of the week. Engine Room builds lower/upper body power and core armor. Performance sessions apply the week’s drill to real problems.',
      'Phase 1 (Mechanics) covers the fundamental dyno physics. Phase 2 (Advanced Techniques) layers in coordinated and paddle moves. Phase 3 (Flight School) puts it all together.',
      'Land softly. Always. A dyno program that destroys your knees is a bad dyno program.',
    ],
    graduation:
      'By week 12 you’ll project comfortable V5s on dynamic style and have the reflex bank to try V6+ moves that require commitment. Natural next: Lockdown to add static power to the dynamic toolkit, or Iron Grip if finger strength becomes the bottleneck.',
  },

  phases: [
    {
      id: PHASE.mechanics,
      name: 'Mechanics',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Mechanics phase teaches the foundational dyno vocabulary: deadpoints, lateral momentum, and double clutches. You’ll drill one dyno type per week with an emphasis on control and consistency, not just hitting the hold. Engine Room adds explosive lower-body and core work to power the movements.',
      goals: [
        'Learn foundational dyno movement patterns',
        'Build explosive lower-body strength (box jumps)',
        'Develop core tension under dynamic load',
        'Groove clean deadpoint timing',
      ],
    },
    {
      id: PHASE.advanced,
      name: 'Advanced Techniques',
      weekStart: 5,
      weekEnd: 8,
      description:
        'Advanced Techniques phase layers complexity — pogos, step-up dynos, and paddle bumps force you to sequence dynamic moves. Engine Room intensifies with clapping pull-ups and depth jumps. Your body is learning to generate and redirect force.',
      goals: [
        'Chain multiple dynamic moves in a single sequence',
        'Increase explosive upper-body power',
        'Build tension through moving-hand transitions',
        'Refine dyno timing under fatigue',
      ],
    },
    {
      id: PHASE.flight,
      name: 'Flight School',
      weekStart: 9,
      weekEnd: 12,
      description:
        'Flight School is the integration phase. Run-and-jumps, coordinate dynos, and full-send projecting tie everything together. This is where dynos move from "drill" to "tool" — you’ll use them in real climbing contexts and finish with a graduation flight test to measure your ceiling.',
      goals: [
        'Apply dynamic skills to real boulder problems',
        'Max out explosive and contact strength metrics',
        'Pass a graduation dyno benchmark',
        'Integrate dynamic climbing into your regular toolkit',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'tech',
      name: 'Technical Flight',
      icon: '🧱',
      description: 'Dyno drill of the week, trained for control and consistency.',
      fields: ['sessionVolume'],
      drillsByWeek: {
        1: 'vertical_deadpoint',
        2: 'lateral_momentum',
        3: 'double_clutch',
        4: 'the_pogo',
        5: 'step_up_dyno',
        6: 'the_paddle_bumping',
        7: 'run_and_jumps',
        8: 'deload_target_practice',
        9: 'the_coordinate',
        10: 'the_full_send',
        11: 'integration_project_week',
        12: 'graduation_flight_test',
      },
    },
    {
      id: 'eng',
      name: 'Engine Room',
      icon: '⚙️',
      description: 'Lower and upper body power, core, and armor.',
      blocks: [
        {
          id: 'lower_power',
          name: 'Lower Body Power',
          perPhase: {
            [PHASE.mechanics]: {
              rationale:
                'Box Jumps train the legs to generate force FAST. Silent landing matters as much as the jump — silent = deceleration control, which is what keeps you from exploding through dynos into bad landings. Bulgarians build single-leg power for one-leg dynos and high-step launches.',
              exercises: [
                {
                  name: 'Box Jumps',
                  sets: '4',
                  reps: '4',
                  load: 'Moderate height',
                  notes: 'Land silently — deceleration control matters as much as the jump.',
                },
                { name: 'Bulgarian Split Squats', sets: '3', reps: '8 per side' },
              ],
            },
            [PHASE.advanced]: {
              rationale:
                'Increase box jump height by 2-4 inches. Same Bulgarians — single-leg strength is a slow-build quality. Rest 2-3 min between sets. Don’t chase height at the cost of form; a clean 24-inch box jump beats a sloppy 30-inch one.',
              exercises: [
                { name: 'Box Jumps', sets: '4', reps: '4', load: '+2-4 inches on phase 1', rest: '2-3 min' },
                { name: 'Bulgarian Split Squats', sets: '3', reps: '8 per side' },
              ],
            },
            [PHASE.flight]: {
              rationale:
                'Transition to Depth Jumps (reactive strength) OR Broad Jumps (horizontal power) depending on whether your projects demand vertical or horizontal dynos. Depth Jumps: step off a 12-18 inch box, absorb, explode up immediately. 3 minutes rest between sets — these are CNS-heavy.',
              exercises: [
                {
                  name: 'Depth Jumps (or Broad Jumps)',
                  sets: '3',
                  reps: '3 depth jumps, or 5 broad jumps',
                  rest: '3 min',
                  notes: 'Step off a 12-18 inch box, absorb, explode up immediately.',
                },
                { name: 'Bulgarian Split Squats', sets: '3', reps: '8 per side' },
              ],
            },
          },
        },
        {
          id: 'upper_power',
          name: 'Upper Body Power & Recruitment',
          perPhase: {
            [PHASE.mechanics]: {
              rationale:
                'Explosive Pull-Ups: pull fast, chest to bar, pull yourself UP and OFF the bar for a moment. Band assistance is fine while you’re learning the pattern. Recruitment Hangs teach the fingers to fire at full recruitment — 10-15 seconds is short enough to stay at max contraction without taxing endurance.',
              exercises: [
                { name: 'Explosive Pull-Ups', sets: '4', reps: '3', notes: 'Band assistance is fine while learning.' },
                { name: 'Recruitment Hangs', sets: '3', hold: '10-15s', load: 'Jug or 20mm edge' },
              ],
            },
            [PHASE.advanced]: {
              rationale:
                'Drop the band if you can. Same 4x3 explosive reps — rep count stays low because this is power, not hypertrophy. Recruitment Hangs progress to a smaller edge (20mm → 18mm or half-crimp if pain-free). Week 8 is a deload — reduce sets to 3x3 and use a jug for hangs.',
              exercises: [
                { name: 'Explosive Pull-Ups', sets: '4', reps: '3', notes: 'Less or no band. Week 8 deload: 3x3.' },
                { name: 'Recruitment Hangs', sets: '3', hold: '10-15s', load: 'Smaller edge, if pain-free' },
              ],
            },
            [PHASE.flight]: {
              rationale:
                'Either maintain Explosive Pull-Ups or upgrade to Clapping Pull-Ups if you’re chest-to-bar comfortable. Clapping Pull-Ups are the gold standard for reactive upper-body power. Recruitment Hangs stay at 3x10-15s — maintenance phase; the dyno projects this phase ARE your upper-body stimulus.',
              exercises: [
                { name: 'Explosive or Clapping Pull-Ups', sets: '3-4', reps: '3' },
                { name: 'Recruitment Hangs', sets: '3', hold: '10-15s', notes: 'Maintenance.' },
              ],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [PHASE.mechanics]: {
              rationale:
                'Core tension is what keeps feet attached to the wall during dynamic moves. No tension = cutting feet the moment you leave the ground. Hollow Body trains the anti-extension pattern that lets you pull your hips into the wall mid-dyno.',
              exercises: [
                { name: 'Toes-to-Bar', sets: '3', reps: '8', notes: 'Modification: Hanging Knee Raises.' },
                { name: 'Hollow Body', sets: '3', hold: '20s' },
              ],
            },
            [PHASE.advanced]: {
              rationale:
                'Progress to L-Sit — the static hold trains isometric strength in a dyno-relevant position. If the L-Sit is too hard, start with tucked knees and extend over time.',
              exercises: [
                { name: 'Toes-to-Bar', sets: '3', reps: '10' },
                { name: 'L-Sit', sets: '3', hold: '15s', notes: 'Start tucked and extend over time.' },
              ],
            },
            [PHASE.flight]: {
              rationale:
                'Front Lever progressions. Tuck → advanced tuck → single-leg → full. Even a 5-second tuck front lever builds the scapular depression and anterior-core strength you need to maintain tension through an overhang dyno. No rush — the progression itself IS the stimulus.',
              exercises: [
                { name: 'Toes-to-Bar', sets: '3', reps: '12' },
                { name: 'Front Lever', protocolId: 'front_lever', sets: '3', hold: '8s', notes: 'Tuck progression is fine.' },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor (Shoulder & Forearm Maintenance)',
          perPhase: {
            [PHASE.mechanics]: {
              rationale:
                'Non-negotiable prehab. Dynamic climbing peaks shoulder and tendon forces at levels casual sessions never reach — the armor block is what keeps you from tweaking a cuff or a pulley on your third clap attempt. Light weight, high rep, perfect form.',
              exercises: ARMOR,
            },
            [PHASE.advanced]: {
              rationale:
                'Exact same routine. Do not increase load — this is maintenance, not strength-building. If you feel any shoulder pinch or elbow flare, increase the volume (add 1 set) rather than the resistance.',
              exercises: ARMOR,
            },
            [PHASE.flight]: {
              rationale:
                'Still the same. Phase 3 pushes the hardest dynos of the program — you need the shoulder capsule and tendon chain working better than ever. Consider this the insurance policy on your graduation attempts.',
              exercises: ARMOR,
            },
          },
        },
      ],
    },
    {
      id: 'perf',
      name: 'Performance & Limit',
      icon: '⚡',
      description: 'The hardest dynos and dynamic boulders you can attempt.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent'],
      drillsByWeek: {
        1: 'limit_dynos_four_burns',
        2: 'style_diverse_dynamic_day',
        3: 'crux_isolation_hard_move',
        4: 'deload_flow_dynos',
        5: 'intensify_five_burns',
        6: 'dynamic_link_ups',
        7: 'the_hard_flash_day',
        8: 'deload_soft_catches',
        9: 'peak_projecting_six_burns',
        10: 'send_window',
        11: 'consolidate_and_convert',
        12: 'graduation_send_test',
      },
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Mobility flow, walking, easy stretching.',
      isRest: true,
    },
  ],

  deloadWeeks: [4, 8],

  frequency: '3+1 per week. Three committed days + one optional volume day.',
  ordering:
    'Technical Flight first. Engine Room next day. Performance after a rest day. The 3+1 is intentional — dynamic climbing needs more recovery.',

  constraints: [
    {
      kind: 'sessions-per-week',
      min: 3,
      max: 4,
      note: 'Three committed days plus one optional volume day.',
    },
    {
      kind: 'order-in-week',
      first: 'tech',
      then: 'perf',
      note: 'Technical Flight comes before Performance in the week.',
    },
    {
      kind: 'min-gap-hours',
      between: ['perf'],
      hours: 48,
      note: 'Take a rest day before Performance — dynamic climbing needs the recovery.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description:
      'As prescribed — Technical Flight, Engine Room, then Performance (Tech before Performance, a rest day before).',
    slots: { 1: 'tech', 2: 'eng', 4: 'perf' },
  },

  assessments: [
    'box_jump_height',
    'explosive_pullups',
    'dead_hang',
    'max_dynamic_grade',
    'landing_control',
    'core_plank',
  ],

  nextPrograms: [
    { id: 'lockdown', reason: 'Your complement — add static power to the dynamic toolkit you just built.' },
    { id: 'iron_grip', reason: 'If finger strength is the next bottleneck on your V5-V7 projects.' },
    {
      id: 'peak_performance',
      reason: 'If you’re flashing V6-V8 and ready for the boulderer’s peak program.',
    },
  ],
};
