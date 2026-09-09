/**
 * Lockdown — 12-week static power (V3-V5).
 *
 * Two strength sessions (A: heavy pulling and hangs, B: body tension) plus
 * a technique day. Several blocks prescribe the same exercises in every
 * phase while the coaching changes, so those are declared once and shared.
 *
 * This is also the program that pulls in the static-strength protocols —
 * density hangs, Frenchies, offset lock-offs, one-arm negatives — whose
 * definitions the prototype had to correct inside an AI prompt.
 */

import type { Exercise, Program } from '../types';

const PHASE = { stability: 'stability', intensification: 'intensification', integration: 'integration' } as const;

/** Session A armor: identical every phase, only the reasoning changes. */
const ARMOR_A: Exercise[] = [
  { name: 'Wrist Extensor Curls', sets: '2', reps: '15', load: 'Light' },
  { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
  { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
  { name: 'Face Pulls', sets: '2', reps: '15' },
];

/** Session B armor: a different emphasis, same intent. */
const ARMOR_B: Exercise[] = [
  { name: 'Wrist Extensor Curls', sets: '2', reps: '15' },
  { name: 'Finger Extensions', sets: '2', reps: '15' },
  { name: 'Hammer Curls', sets: '2', reps: '12' },
];

const HIP_MOBILITY: Exercise[] = [
  {
    name: 'Deep Box Step-Ups',
    sets: '2',
    reps: '10',
    notes: 'Box high enough that the knee starts above hip level.',
  },
  { name: 'Frog Stretch', sets: '2', hold: '30s', notes: 'Knees wide, hips sinking back. Breathe into it.' },
];

export const LOCKDOWN: Program = {
  id: 'lockdown',
  name: 'Lockdown',
  subtitle: '12-Week Static Power',
  kind: 'program',
  stage: 'style',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V3', max: 'V5', label: 'V3-V5' },
  weeks: 12,
  equipment: ['wall', 'hangboard', 'gym'],

  intro: {
    pitch:
      'A 12-week static-power program for V3-V5 climbers who want to out-hold the move rather than throw for it. Builds density-hang endurance, lock-off strength, and the pulling base that powerful slow climbing demands.',
    rhythm: [
      '4-5 sessions per week. Session A (heavy pulling and hangs) needs 48 hours before the next Session A. Session B (core and tension) is lighter and can follow A after one day.',
      'Phase 1 (Stability) builds connective-tissue tolerance through long density hangs. Phase 2 (Intensification) introduces weighted hangs and hard lock-offs. Phase 3 (Integration) applies the new strength to harder projects.',
      'Listen to your elbows. Static pulling loads them hard. If anything sharp shows up, dial back the load, not the frequency.',
      'This is NOT a program for climbers under V3. Static strength requires a base that earlier programs build. If you haven’t sent V3, run Base Camp first.',
    ],
    graduation:
      'By week 12 you’ll hold lockoffs you used to jump through, feel stable on small feet, and own V5 static style. Next: Iron Grip to add finger strength, Peak Performance for V8+ work, or The Cruiser for maintenance.',
  },

  phases: [
    {
      id: PHASE.stability,
      name: 'Stability',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Stability phase builds the isometric base that static power demands. You’ll work lock-offs, slow tempos, and controlled negatives. The goal isn’t to lift more — it’s to hold more, for longer, without shaking. Static climbing rewards patience, and this phase is where you build it.',
      goals: [
        'Develop lock-off strength at varied angles',
        'Build isometric endurance in climbing positions',
        'Introduce tempo and eccentric pulling work',
        'Establish baseline hangboard protocols',
      ],
    },
    {
      id: PHASE.intensification,
      name: 'Intensification',
      weekStart: 5,
      weekEnd: 8,
      description:
        'Intensification phase loads the patterns you grooved. Heavier hangs, weighted lock-offs, and harder static boulders test the stiffness you’ve built. Expect to feel slow on the first sessions — that’s static strength coming online. Recovery between sessions matters more than ever.',
      goals: [
        'Progress hangboard loading in controlled increments',
        'Build weighted lock-off capacity',
        'Strengthen scapular stability under heavy load',
        'Respect full recovery between Session A efforts',
      ],
    },
    {
      id: PHASE.integration,
      name: 'Integration',
      weekStart: 9,
      weekEnd: 12,
      description:
        'Integration phase brings static strength to the wall. You’ll project limit statics, practice perfect footwork under max effort, and test how well your isometric capacity translates to real climbing. Graduation benchmarks reveal the strength you built.',
      goals: [
        'Apply lock-off strength to limit bouldering',
        'Complete max hangboard protocol tests',
        'Redpoint static-intensive boulder projects',
        'Measure and celebrate capacity gains',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'sa',
      name: 'Session A: Static Power',
      icon: '🤜',
      description: 'Density hangs, lock-offs, pulling, armor.',
      blocks: [
        {
          id: 'density',
          name: 'Density Phase',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Long-duration sub-max hangs build connective tissue density and endurance in the half-crimp. The goal is dull fatigue, NOT pump. Rest 3 min between sets. RPE 6-7. Form over time: if shaking starts, drop off — shaking recruits the wrong patterns.',
              exercises: [
                {
                  name: 'Density Hangs',
                  protocolId: 'density_hangs',
                  sets: '5',
                  hold: '30s',
                  load: 'Bodyweight',
                  rest: '3 min',
                  notes: '20mm half-crimp, or a jug while you build tolerance.',
                },
              ],
            },
            [PHASE.intensification]: {
              rationale:
                'Progress by time OR load, not both. If BW 30s was easy, go to BW 40s first. If BW 40s is your ceiling, add 5-10 lbs and drop back to 30s. Never both in the same week. Same edge (20mm), same grip (half-crimp or open).',
              exercises: [
                {
                  name: 'Density Hangs',
                  protocolId: 'density_hangs',
                  sets: '5',
                  hold: '40s at bodyweight, or 30s weighted',
                  load: 'Bodyweight, or +5-10 lbs',
                  rest: '3 min',
                  notes: 'Progress time or load — never both in the same week.',
                },
              ],
            },
            [PHASE.integration]: {
              rationale:
                'Maintenance phase. The density stimulus is now running in the background while your on-wall work takes over. Hold the Phase 2 load (+5-10 lbs) at 30s, 5 sets. Don’t chase new density PRs here — your next program (Iron Grip) does that.',
              exercises: [
                {
                  name: 'Density Hangs',
                  protocolId: 'density_hangs',
                  sets: '5',
                  hold: '30s',
                  load: '+5-10 lbs',
                  rest: '3 min',
                  notes: 'Maintain — do not chase new density PRs this phase.',
                },
              ],
            },
          },
        },
        {
          id: 'lock_off',
          name: 'Lock-Off',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Frenchies train the three critical lock-off angles in one set. Pull all the way up, hold at the top 5s, lower to 90°, hold 5s, lower to 120°, hold 5s, dead hang. That’s one cycle. 1-2 cycles per set, 3 sets, 3 min rest. RPE 7-8.',
              exercises: [
                {
                  name: 'Frenchies',
                  protocolId: 'frenchies',
                  sets: '3',
                  reps: '1-2 cycles',
                  hold: '5s at top, 90°, and 120°',
                  rest: '3 min',
                },
              ],
            },
            [PHASE.intensification]: {
              rationale:
                'Offset Lock-Offs: one hand on the bar, the other on a towel hanging 6-12 inches below. Pull to the bar, hold 5 seconds at 90°. The uneven loading forces the working arm to hold far more than half bodyweight — this is the stepping stone to one-arm strength.',
              exercises: [
                {
                  name: 'Offset Lock-Offs (towel)',
                  protocolId: 'offset_lock_offs',
                  sets: '3',
                  hold: '5s at 90°',
                },
              ],
            },
            [PHASE.integration]: {
              rationale:
                'One-Arm Negatives: jump or step to a one-arm lock-off at the bar, then lower yourself on that arm for 5 seconds. Use a foot on a chair for assistance as needed. Most powerful isometric progression in the program — direct carryover to powerful pulls off single hands.',
              exercises: [
                {
                  name: 'One-Arm Negatives',
                  protocolId: 'one_arm_negatives',
                  sets: '3',
                  hold: '5s lower',
                  notes: 'Assist with a foot on a chair as needed.',
                },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'The Pull',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Wide grip puts the lats in a more challenging mechanical position than standard grip — trains pulling strength you can’t build on a narrower bar. 3 seconds down is the work; the up-phase is just getting you back to the top.',
              exercises: [
                { name: 'Wide Pull-Ups', sets: '3', reps: '6-8', notes: 'Three seconds down on every rep.' },
              ],
            },
            [PHASE.intensification]: {
              rationale:
                'Same exercise, same tempo. If 6-8 reps is comfortable, add 5-10 lbs with a weight belt rather than adding reps — this is a strength block, not hypertrophy. Rest 2-3 min between sets.',
              exercises: [
                {
                  name: 'Wide Pull-Ups',
                  sets: '3',
                  reps: '6-8',
                  load: '+5-10 lbs if 6-8 reps is comfortable',
                  rest: '2-3 min',
                  notes: 'Three seconds down. Add load, not reps.',
                },
              ],
            },
            [PHASE.integration]: {
              rationale:
                'Maintain. Pull-up volume is already high between lock-offs and any on-wall projecting — don’t add stress here. Keep form strict; if reps 7-8 are ugly, cap the set at 6.',
              exercises: [
                { name: 'Wide Pull-Ups', sets: '3', reps: '6-8', notes: 'Cap the set at 6 if the last reps get ugly.' },
              ],
            },
          },
        },
        {
          id: 'armor_a',
          name: 'Armor',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Non-negotiable prehab. Heavy static loading (density hangs + lock-offs) damages small stabilizers if their antagonists are weak. Light weight, high rep, controlled tempo. This is the insurance policy on every other exercise in the program.',
              exercises: ARMOR_A,
            },
            [PHASE.intensification]: {
              rationale:
                'Same routine, every session. If anything feels tight (elbows, wrists, shoulders), add a SET — not weight. Volume at light load is what actually builds tendon health; heavy armor work is counterproductive.',
              exercises: ARMOR_A,
            },
            [PHASE.integration]: {
              rationale:
                'Still the same. Phase 3 brings the hardest projecting of the program plus the graduation retests — your shoulders and forearms need to be at their most resilient, not their most fatigued. Treat armor as the warm-down, not the grind.',
              exercises: ARMOR_A,
            },
          },
        },
      ],
    },
    {
      id: 'sb',
      name: 'Session B: Body Tension',
      icon: '🧘',
      description: 'Core circuit, antagonist work, hip mobility.',
      blocks: [
        {
          id: 'core_circuit',
          name: 'Core Circuit',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Static core drills mirror steep, static climbing demands. Compression Planks: squeeze something between your hands the whole set. RKC Plank: maximum full-body clench for 20 seconds — 15s of max tension beats 60s of lazy holding. Wipers: hanging bar, bent knees, rotate slowly side-to-side.',
              exercises: [
                { name: 'Compression Planks', sets: '3', hold: '20s', notes: 'Squeeze something between your hands throughout.' },
                { name: 'Wipers (bent-knee)', sets: '3', reps: '8 per side' },
                { name: 'RKC Plank', sets: '3', hold: '20s', notes: 'Maximum full-body clench.' },
              ],
            },
            [PHASE.intensification]: {
              rationale:
                'Progressions. Compression Planks become long-lever (hands reach further from shoulders). Wipers progress to straight-legged for maximum compression demand. RKC drops to 15s but intensity goes up — clench so hard you shake. Every rep should feel like the hardest contraction you can produce.',
              exercises: [
                { name: 'Compression Planks (long-lever)', sets: '3', hold: '25s' },
                { name: 'Wipers (straight-leg)', sets: '3', reps: '8 per side' },
                { name: 'RKC Plank', sets: '3', hold: '15s', notes: 'Max effort — clench hard enough to shake.' },
              ],
            },
            [PHASE.integration]: {
              rationale:
                'Top-end. Weighted vest on Compression Planks (5-10 lbs). Ankle weights on Wipers (3-5 lbs). Graduation-level core tension — what limit-level static climbing actually demands. Skip vest/weights if form breaks; loaded core work with poor form is an injury pipeline.',
              exercises: [
                { name: 'Compression Planks', sets: '3', hold: '20s', load: 'Weighted vest, 5-10 lbs' },
                { name: 'Wipers', sets: '3', reps: '8 per side', load: 'Ankle weights, 3-5 lbs' },
                { name: 'RKC Plank', sets: '3', hold: '15s', notes: 'Max effort.' },
              ],
            },
          },
        },
        {
          id: 'antagonist',
          name: 'Antagonist',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Balances the heavy pulling from Session A. Pushing work keeps the shoulders healthy. Dips if you have rings or parallel bars; Overhead Press with dumbbells as the alternative. Full ROM, controlled descent. Non-negotiable — weak antagonists = shoulder impingement waiting to happen.',
              exercises: [
                { name: 'Dips or Overhead Press', sets: '3', reps: '10-12', notes: 'Full range, controlled descent.' },
              ],
            },
            [PHASE.intensification]: {
              rationale:
                'Same exercise. Add load via weight belt (dips) or heavier dumbbells (press) if 12 reps is easy. Rest 90s-2 min between sets. Form stays strict — elbows don’t flare, shoulders don’t shrug up to your ears.',
              exercises: [
                {
                  name: 'Dips or Overhead Press',
                  sets: '3',
                  reps: '10-12',
                  load: 'Add load if 12 reps is easy',
                  rest: '90s-2 min',
                },
              ],
            },
            [PHASE.integration]: {
              rationale:
                'Maintain. Session A lock-off work is peaking in Phase 3; your pushing balance needs to hold, not grow. If shoulders feel grumpy, drop to 3x8 and call it done.',
              exercises: [
                { name: 'Dips or Overhead Press', sets: '3', reps: '10-12', notes: 'Drop to 3x8 if shoulders feel grumpy.' },
              ],
            },
          },
        },
        {
          id: 'hip_mobility',
          name: 'Hip Mobility',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Open hips keep the pelvis close to the wall, which reduces load on the fingers. Deep Box Step-Ups: step onto a box high enough that your knee is above hip level at the start. Frog Stretch: knees wide, hips sink back. Hold 30 seconds, breathe into the discomfort.',
              exercises: HIP_MOBILITY,
            },
            [PHASE.intensification]: {
              rationale:
                'Same work. If the 30s frog stretch is comfortable, extend to 45s. Step-Ups can progress to single-arm offset loading (hold a dumbbell on the non-working side) for added core challenge.',
              exercises: HIP_MOBILITY,
            },
            [PHASE.integration]: {
              rationale:
                'Keep it in maintenance. Don’t introduce new mobility exercises this close to graduation — body-tension programs are most vulnerable to new mobility work creating dysfunction. Stick with what works.',
              exercises: HIP_MOBILITY,
            },
          },
        },
        {
          id: 'armor_b',
          name: 'Armor',
          perPhase: {
            [PHASE.stability]: {
              rationale:
                'Wrist and forearm prehab — Session B’s armor complements Session A’s (different emphasis, same intent). Hammer Curls specifically build the brachioradialis, a climbing-specific elbow flexor most people neglect. Light to moderate load, perfect form.',
              exercises: ARMOR_B,
            },
            [PHASE.intensification]: {
              rationale:
                'Same routine. Do it in a circuit (all three back-to-back, minimal rest) to save time — armor quality matters more than intensity.',
              circuit: { rounds: '2', restBetween: 'Minimal' },
              exercises: ARMOR_B,
            },
            [PHASE.integration]: {
              rationale:
                'Still the same. If any elbow tightness sneaks in (common in Phase 3 from Session A’s heavy lock-offs), bump Hammer Curls to 3 sets.',
              exercises: ARMOR_B,
            },
          },
        },
      ],
    },
    {
      id: 'tech',
      name: 'Climbing: Technique',
      icon: '🧱',
      description: 'Static-specific drills. Low intensity, high focus.',
      fields: ['sessionVolume'],
      drillsByWeek: {
        1: 'quiet_feet_hover_hands',
        2: 'drop_knee_isolation',
        3: 'heel_hook_commitment',
        4: 'static_trifecta',
        5: 'lock_off_holds_on_wall',
        6: 'twist_lock_practice',
        7: 'static_projecting',
        8: 'deload_the_flow_session',
        9: 'no_match_climbing',
        10: 'offset_pull_practice',
        11: 'project_week_static',
        12: 'graduation_retest_static',
      },
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Prescribed mobility flow, light activity.',
      isRest: true,
    },
  ],

  deloadWeeks: [8],

  frequency: '4-5 sessions/week. Session A and B should not be on consecutive days.',
  ordering:
    'Session A (heavy pulling/hangs) needs 48hrs before next A. Session B (core/tension) is lighter and can follow A after one day.',

  constraints: [
    { kind: 'sessions-per-week', min: 4, max: 5, note: '4-5 sessions per week.' },
    {
      kind: 'min-gap-hours',
      between: ['sa'],
      hours: 48,
      note: 'Session A needs 48 hours before the next Session A.',
    },
    { kind: 'max-per-week', sessionTypeId: 'sa', count: 2, note: 'Two Session A days per week at most.' },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'As prescribed — Session A, Technique, Session B, with recovery between.',
    slots: { 1: 'sa', 2: 'tech', 4: 'sb' },
  },

  assessments: [
    'density_hang_bw_20mm',
    'lock_off_90',
    'max_pullups',
    'hollow_body',
    'wrist_extensor_curls',
    'max_static_grade',
    'max_pushups',
  ],

  prerequisites: {
    note: 'Not a program for climbers under V3 — static strength needs a base that earlier programs build. If you haven’t sent V3, run Base Camp first.',
    metrics: [{ metricId: 'max_boulder_grade', atLeast: 3 }],
  },

  nextPrograms: [
    { id: 'iron_grip', reason: 'Add finger strength to the static power base you just built.' },
    {
      id: 'peak_performance',
      reason: 'For advanced boulderers — your new static strength will let you express it at V8+.',
    },
    {
      id: 'the_cruiser',
      reason: 'Maintain what you built and enjoy your climbing — rotate back into a block when ready.',
    },
  ],
};
