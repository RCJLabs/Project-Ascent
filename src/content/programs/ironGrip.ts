/**
 * Iron Grip — 12-week finger strength (V5-V8).
 *
 * Reference conversion from the prototype's `tracker.ts` entry. Coaching
 * prose is preserved verbatim; what changed is the container — dosage split
 * out of the exercise strings, scheduling prose backed by machine-readable
 * constraints, drills referenced by id, assessments by stable metric id.
 *
 * Content note: the program's `frequency` rule states 48 hours between
 * finger sessions, while the intro copy calls for 72. The constraint encodes
 * 48 as the hard floor (the scheduler's warning threshold); the recommended
 * layout spaces them 72 hours apart as the ideal.
 */

import type { Program } from '../types';

const PHASE = { anvil: 'anvil', hammer: 'hammer', spark: 'spark' } as const;

export const IRON_GRIP: Program = {
  id: 'iron_grip',
  name: 'Iron Grip',
  subtitle: '12-Week Finger Strength',
  kind: 'program',
  stage: 'style',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V5', max: 'V8', label: 'V5-V8' },
  weeks: 12,
  equipment: ['wall', 'hangboard', 'campus'],

  intro: {
    pitch:
      'A 12-week finger-strength program for V5-V8 climbers ready to train their fingers like athletes, not hope-for-the-best. Repeaters, max hangs, and structured campus work, periodized across three distinct protocols.',
    rhythm: [
      '2 fingerboard sessions per week, with 72 hours between. Supplementary climbing fills in the other days.',
      'Phase 1 (The Anvil) uses Repeaters to build finger endurance and connective-tissue capacity. Phase 2 (The Hammer) shifts to Max Hangs for peak strength. Phase 3 (The Spark) introduces limited campus work for contact strength.',
      'Form is non-negotiable on hangs. Half-crimp, open-hand — follow the prescribed grip. Full crimping under load is how climbers ruin their A2 pulleys.',
      'If your fingers hurt in a sharp or local way, stop. Dull soreness is fine; stabbing pain is a pulley warning. This program is designed to build strength without injury — respect the warnings it’s built around.',
    ],
    graduation:
      'By week 12 you’ll have measurable finger-strength gains (usually BW+15-30lbs on a 20mm max hang) and be sending harder boulders because of it. Next: Peak Performance for advanced bouldering, The Siege for 5.13 sport projecting, or The Cruiser for maintenance.',
  },

  phases: [
    {
      id: PHASE.anvil,
      name: 'The Anvil (Repeaters)',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Anvil phase introduces repeater protocols — short hangs with short rests that build finger tendon capacity safely. This is the least sexy phase and the most important one. Skip this work and the rest of the program risks injury.',
      goals: [
        'Build finger flexor endurance with repeaters',
        'Groove proper hangboard form and body position',
        'Establish grip strength baseline for the program',
        'Develop tendon tolerance for higher loads',
      ],
    },
    {
      id: PHASE.hammer,
      name: 'The Hammer (Max Hangs)',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Hammer phase transitions to max hangs — short, heavy efforts with long rest. You’ll load the fingers near their limit in a controlled, progressive way. Expect real strength gains and a noticeable improvement in how hard you can crimp on real rock.',
      goals: [
        'Build maximal finger strength on standardized hold sizes',
        'Progress added load weekly',
        'Maintain repeater capacity from phase 1',
        'Integrate strict rest between efforts (3-5 min)',
      ],
    },
    {
      id: PHASE.spark,
      name: 'The Spark (Campus)',
      weekStart: 9,
      weekEnd: 12,
      description:
        'The Spark phase adds contact strength via the campus board. You’ll do progressions from matches to skips, training the nervous system to generate force fast. This is the most injury-prone protocol in the program — respect the volume caps.',
      goals: [
        'Develop contact strength and recruitment speed',
        'Translate max hangs into dynamic grabbing power',
        'Maintain gains from previous phases',
        'Complete graduation grip strength benchmarks',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'fp',
      name: 'Finger Protocol + Engine',
      icon: '✋',
      description: 'Hangboard protocol plus pulling, pushing, core, and armor work.',
      blocks: [
        {
          id: 'finger_protocol',
          name: 'Finger Protocol',
          perPhase: {
            [PHASE.anvil]: {
              rationale:
                'Phase 1 (Anvil): Repeaters build endurance and tendon thickness in the finger flexors. Half Crimp, 20mm edge. RPE 7 — deep burn by rep 4-5, fight to hold the last. Fail early? Drop 5 lbs next session. Easy? Add 2.5 lbs. 3 minutes full rest between sets. The least glorious phase, and the foundation the rest of the program depends on.',
              exercises: [
                {
                  name: '7/3 Repeaters',
                  protocolId: 'repeaters_7_3',
                  sets: '3-5',
                  reps: '6 hangs per set',
                  load: '60-70% max added weight',
                  rest: '3 min',
                  notes: 'Half crimp on a 20mm edge. RPE 7.',
                },
              ],
            },
            [PHASE.hammer]: {
              rationale:
                'Phase 2 (Hammer): Max hangs train peak finger strength and CNS recruitment. Half Crimp, 20mm edge. RPE 9 — no burn, just max tension. If Half Crimp breaks into Open Hand drag, set is a fail. 3-5 minute rest between sets is mandatory — shorter rest means you’re training endurance you already have, not strength you don’t.',
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '5',
                  hold: '10s',
                  load: '85-90% max added weight',
                  rest: '3-5 min',
                  notes: 'Half crimp on a 20mm edge. RPE 9 — no burn, just max tension.',
                },
              ],
            },
            [PHASE.spark]: {
              rationale:
                'Phase 3 (Spark): Campus work is the highest injury risk of the program. OPEN HAND ONLY — no crimping on rungs. Start on largest rungs with feet on ground. Cap at 15 minutes total board time. If you miss a rung twice in a row, session is over. CNS warm-up with 3 sets Clap Push-Ups or Box Jumps before touching the board.',
              exercises: [
                {
                  name: 'Campus Laddering',
                  protocolId: 'campus_ladder',
                  sets: '3-5',
                  reps: '1-2-3-4-5 matched',
                  notes: 'Open hand only. Start on the largest rungs with feet on the ground.',
                },
                {
                  name: 'Campus Skips',
                  protocolId: 'campus_ladder',
                  sets: '3-5',
                  reps: '1-3-5 single-hand',
                },
                {
                  name: 'Campus Double Dynos',
                  protocolId: 'campus_ladder',
                  sets: '3-5',
                  reps: '3 reps (1→3, both hands simultaneous)',
                },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.anvil]: {
              rationale:
                'Weighted Pull-Ups build the pulling hypertrophy that supports the higher-load work ahead. Add weight via belt or vest so 8-10 reps is challenging but clean. Full range — arms fully extended at the bottom, chest to the bar at the top. 2-3 min rest.',
              exercises: [
                {
                  name: 'Weighted Pull-Ups',
                  sets: '3',
                  reps: '8-10',
                  rest: '2-3 min',
                  notes: 'Full range of motion — arms fully extended at the bottom, chest to the bar at the top.',
                },
              ],
            },
            [PHASE.hammer]: {
              rationale:
                '1-Arm Lock-Offs are the bridge from pulling strength to true one-arm capacity. Use a towel, band, or chair-foot for assistance. Key cue: shoulder DOWN and back — no shrugging. 5-7 seconds per side is plenty; quality over duration.',
              exercises: [
                {
                  name: '1-Arm Lock-Off (Assisted)',
                  sets: '3',
                  hold: '5-7s per arm',
                  notes: 'Shoulder down and back — no shrugging. Assist with a towel, band, or chair-foot.',
                },
              ],
            },
            [PHASE.spark]: {
              rationale:
                'Explosive Pull-Ups train fast twitch carryover from the campus board. Pull FAST — chest to bar with max speed, control the descent. Low reps (3x5) preserve recovery for hangboard work. Skip this entirely if your shoulders feel beat up from campus.',
              exercises: [
                {
                  name: 'Explosive Pull-Ups',
                  sets: '3',
                  reps: '5',
                  notes: 'Chest to bar at max speed, controlled descent. Skip if shoulders are beat up from campus.',
                },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [PHASE.anvil]: {
              rationale:
                'Wide Push-Ups are NON-NEGOTIABLE antagonist work. They protect elbows from the heavy pulling/pressing forces the fingers are absorbing. Elbows tracking at 45°, full chest-to-floor ROM. If 15 reps is too easy, elevate feet or slow the eccentric.',
              exercises: [
                {
                  name: 'Wide Push-Ups',
                  sets: '3',
                  reps: '12-15',
                  notes: 'Elbows tracking at 45°, full chest-to-floor range. Too easy? Elevate feet or slow the eccentric.',
                },
              ],
            },
            [PHASE.hammer]: {
              rationale:
                'Maintenance push work. The guide actually drops push work in Phase 2 to preserve recovery, but we keep a minimal dose for shoulder balance — heavy lock-offs without antagonist work is a shoulder impingement waiting to happen. If you feel shoulder grumpiness, skip this set; don’t add it.',
              exercises: [
                { name: 'Dips or DB Press', sets: '3', reps: '10', notes: 'Maintenance dose. Skip if shoulders feel grumpy.' },
              ],
            },
            [PHASE.spark]: {
              rationale:
                'Minimum effective dose. Campus phase peaks shoulder forces while pulling is near max — small amount of pushing keeps the joint balanced. Not a strength-building set. If you’re sore from campus, skip entirely.',
              exercises: [
                { name: 'Push-Ups', sets: '3', reps: '12', notes: 'Maintenance only. Skip entirely if sore from campus.' },
              ],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [PHASE.anvil]: {
              rationale:
                'Dynamic core work to start. Knee Raises train the hip flexor + lower abs pattern you use for steep climbing. Plank is the foundational anti-extension hold. Both build the tension base for Phase 2’s front lever progressions.',
              exercises: [
                { name: 'Hanging Knee Raises', sets: '3', reps: '12' },
                { name: 'Plank', sets: '3', hold: '45s' },
              ],
            },
            [PHASE.hammer]: {
              rationale:
                'Front Lever progressions. Tuck → Advanced Tuck → One-Leg → Full. Straight line shoulder to hip in every variation. 5 sets of 5-10 second holds — even a 5-second tuck front lever is a real stimulus. Scapular depression (shoulders AWAY from ears) is what makes the hold work.',
              exercises: [
                {
                  name: 'Front Lever',
                  protocolId: 'front_lever',
                  sets: '5',
                  hold: '5-10s',
                  notes: 'Tuck progression is fine. Straight line from shoulder to hip.',
                },
              ],
            },
            [PHASE.spark]: {
              rationale:
                'Maintenance only. The campus-board phase peaks finger tension demands; save CNS for that. L-Sit plus Leg Raises keeps the core engaged without burning out the prime movers. If a session feels grindy, drop this cat entirely.',
              exercises: [
                { name: 'Hanging Leg Raises', sets: '3', reps: '8', notes: 'Maintenance.' },
                { name: 'L-Sit', sets: '3', hold: '15s', notes: 'Maintenance.' },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor',
          perPhase: {
            [PHASE.anvil]: {
              rationale:
                'Phase 1 armor is the full prehab menu: wrist extensors (anti-Golfer’s Elbow), finger extensors (anti-pulley injury), band external rotations + face pulls (anti-shoulder impingement). Every set you skip is an injury queuing up for Phase 2 or 3. Light load, high volume, perfect form.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '20', load: 'Light' },
                { name: 'Finger Extensions', sets: '3', reps: '15', load: 'Band or rubber ring' },
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
                { name: 'Band Face Pulls', sets: '2', reps: '15' },
              ],
            },
            [PHASE.hammer]: {
              rationale:
                'Hammer Curls are added in Phase 2 — they specifically target the brachioradialis, a muscle that gets smashed by heavy pull-ups and lock-offs. Drop the band work temporarily since Phase 2 drops the heavy pushing too. If elbows feel tight, bump Wrist Ext Curls to 3x20.',
              exercises: [
                { name: 'Hammer Curls', sets: '3', reps: '10' },
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15', notes: 'Bump to 3x20 if elbows feel tight.' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
              ],
            },
            [PHASE.spark]: {
              rationale:
                'Campus-phase armor prioritizes Finger Extensions (3x20 — the volume is increased) because finger flexor load peaks this phase and the extensors must match. Hammer Curls drop to 2x10. If ANY elbow or finger tightness develops, pause campus work and add two more extensor sets.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '20', notes: 'Volume deliberately increased this phase.' },
                { name: 'Hammer Curls', sets: '2', reps: '10' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'perf',
      name: 'Climbing Session',
      icon: '⚡',
      description: 'Volume or performance climbing, themed to the current phase.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'sessionVolume'],
      drillsByWeek: {
        1: 'limit_boulders_on_the_crimps',
        2: 'volume_on_moderate_crimps',
        3: 'projecting_with_crimp_focus',
        4: 'deload_flow_session',
        5: 'power_endurance_circuit',
        6: 'limit_bouldering_sessions',
        7: 'the_crimp_project',
        8: 'deload_max_hang_day_off_flow',
        9: 'contact_strength_projecting',
        10: 'crimp_pull_power_application',
        11: 'send_week_crimp',
        12: 'graduation_retest_fingers',
      },
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Active recovery. Fingers need 48 hours.',
      isRest: true,
    },
  ],

  deloadWeeks: [4, 8],

  frequency: '4-5 sessions/week. 48 hours between finger sessions.',
  ordering:
    'Finger Protocol days need full recovery before climbing. Never do finger work the day before a hard climbing day.',

  constraints: [
    {
      kind: 'sessions-per-week',
      min: 4,
      max: 5,
      note: '4-5 sessions per week.',
    },
    {
      kind: 'min-gap-hours',
      between: ['fp'],
      hours: 48,
      note: 'Leave at least 48 hours between finger sessions.',
    },
    {
      kind: 'not-day-before',
      sessionTypeId: 'fp',
      before: 'perf',
      note: 'Never schedule finger work the day before a hard climbing day.',
    },
    {
      kind: 'max-per-week',
      sessionTypeId: 'fp',
      count: 2,
      note: 'Two fingerboard sessions per week — no more.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'As prescribed — finger days bracketing climbing, plus a hard-climb day.',
    slots: { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' },
  },

  assessments: [
    'max_hang_20mm_7s',
    'repeater_weight',
    'weighted_pullup_3rm',
    'lock_off_90',
    'core_lever',
    'max_pullups',
    'dead_hang',
    'max_pushups',
    'max_boulder_grade',
  ],

  prerequisites: {
    note: 'V5 and a pain-free 60-second dead hang are the floor here — hangboarding below that loads tendons that have not had a year of climbing to adapt.',
    metrics: [
      { metricId: 'max_boulder_grade', atLeast: 5 },
      { metricId: 'dead_hang', atLeast: 60 },
      { metricId: 'max_pushups', atLeast: 15 },
    ],
  },

  nextPrograms: [
    { id: 'peak_performance', reason: 'You have the finger strength. Now express it on V8+ boulders.' },
    { id: 'the_long_game', reason: 'Apply your new crimp strength to sport climbing endurance.' },
    {
      id: 'the_siege',
      reason: 'For 5.12+ sport climbers — your new fingers can now siege a 5.13 project.',
    },
    { id: 'the_cruiser', reason: 'Maintain what you built. The Cruiser keeps fingers sharp without grinding.' },
  ],
};
