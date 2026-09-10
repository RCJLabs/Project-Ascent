/**
 * Ground Zero — 12-week body preparation (pre-climbing).
 *
 * The on-ramp: total beginners, returning climbers post-injury, or anyone
 * who skipped structural prep. No climbing sessions and no drills — two
 * block-based session types alternating, which is why it is the cleanest
 * test of the blocks-only shape.
 */

import type { Program } from '../types';

const PHASE = { alignment: 'alignment', armor: 'armor', ignition: 'ignition' } as const;

export const GROUND_ZERO: Program = {
  id: 'ground_zero',
  name: 'Ground Zero',
  subtitle: '12-Week Body Preparation',
  kind: 'program',
  stage: 'start',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V0', label: 'Pre-Climbing' },
  weeks: 12,
  equipment: ['gym'],

  intro: {
    pitch:
      'A 12-week body-preparation program for people who want to climb but aren’t ready to load their fingers, shoulders, or posterior chain against gravity yet. Built for total beginners, returning climbers post-injury, or anyone who skipped the structural prep phase of their climbing life.',
    rhythm: [
      'Four sessions per week. Alternate Structural Integrity days with Mobility & Core days — never two Structural days back to back.',
      'Phase 1 (Alignment) builds baseline range of motion and awareness of common weak points. Phase 2 (Armor) introduces progressive loading. Phase 3 (Ignition) starts bridging toward real climbing movement.',
      'Feel soreness? Good. Feel joint pain? Back off and re-read the exercise description. This program is specifically designed to prevent injury, not produce it.',
      'Rest days are programmed. Take them. Light walking is fine on rest days; full rest is also fine.',
    ],
    graduation:
      'By week 12 you’ll have the scapular stability, hip mobility, and core endurance to safely begin climbing-specific training. Next step: Base Camp, where you apply this foundation to V0-V2 climbing fundamentals.',
  },

  phases: [
    {
      id: PHASE.alignment,
      name: 'The Alignment',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Alignment is about waking up dormant stabilizers and building postural integrity before loading the climbing-specific musculature. Expect low-intensity structural work focused on shoulder mechanics, thoracic mobility, and core activation patterns. Every session is a deposit into the bank you’ll withdraw from later.',
      goals: [
        'Establish shoulder and scapular control',
        'Build baseline core endurance',
        'Open hips and thoracic spine for climbing positions',
        'Introduce tendon-conditioning wrist work',
      ],
    },
    {
      id: PHASE.armor,
      name: 'The Armor',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Armor phase layers progressive loading onto the foundation you built. Volume creeps up, push/pull movements get challenging, and forearm work transitions from activation to hypertrophy. This is where you start to feel stronger in ways that carry into climbing.',
      goals: [
        'Build hypertrophy in pushing and pulling patterns',
        'Progress forearm and finger tendon tolerance',
        'Maintain mobility gains under heavier load',
        'Increase core endurance with dynamic patterns',
      ],
    },
    {
      id: PHASE.ignition,
      name: 'The Ignition',
      weekStart: 9,
      weekEnd: 12,
      description:
        'The Ignition is the bridge from general fitness to climbing readiness. Intensity ramps, eccentrics are introduced, and the work starts to rehearse climbing-specific demands. By the end of this phase, your body is primed to start structured climbing without injury risk.',
      goals: [
        'Introduce eccentric loading for tendon stiffness',
        'Rehearse climbing-specific movement patterns',
        'Achieve baseline strength markers (push-ups, dead hang, plank)',
        'Transition smoothly into Base Camp or a climbing-first program',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'str',
      name: 'Structural Integrity',
      icon: '💪',
      description: 'Shoulders, push and pull, forearms, legs.',
      blocks: [
        {
          id: 'shoulder_health',
          name: 'Shoulder Health',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Wake up the rotator cuff and lower trap. These exercises should feel too easy — that’s correct. You’re building the neural connection before loading.',
              exercises: [
                { name: 'Internal/External Rotation (Band)', sets: '2', reps: '15' },
                { name: 'Wall Angels', sets: '2', reps: '10' },
                { name: 'Scapular Punches', sets: '2', reps: '15' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Add load to the newly-activated stabilizers. Face Pulls become a permanent fixture — they never leave the program. Pull to forehead, rotate to "double bicep."',
              exercises: [
                {
                  name: 'Face Pulls (Band)',
                  sets: '3',
                  reps: '15',
                  notes: 'Pull to the forehead and rotate into a double-bicep position.',
                },
                { name: 'I-Y-T Raises', sets: '3', reps: '8 each position' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Peak load for the shoulder complex. Hanging Scapular Shrugs are the foundation for pull-ups — engage and depress the shoulder blades before any arm bend.',
              exercises: [
                { name: 'Face Pulls (Band)', sets: '3', reps: '15' },
                {
                  name: 'Scapular Shrugs (Hanging)',
                  sets: '3',
                  reps: '8-10',
                  notes: 'Engage and depress the shoulder blades before any arm bend.',
                },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'The Pull',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Groove the pulling pattern with bands before bodyweight loading. Dead Hang builds passive hanging tolerance — your first exposure to finger-tendon load. Start short.',
              exercises: [
                { name: 'Band Lat Pulldowns', sets: '3', reps: '12' },
                { name: 'Dead Hang', sets: '3', hold: '10-15s', notes: 'Progressive — start short.' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Transition to bodyweight rows and active dead hangs. Rest 45-90s between sets. Form breaks down before the timer? End the set.',
              exercises: [
                { name: 'Inverted Rows', sets: '3', reps: '8-10', rest: '45-90s' },
                { name: 'Dead Hang', sets: '3', hold: '18-23s', notes: 'Weekly target. End the set when form breaks.' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Build lat stretch and strength-endurance. Pullovers teach shoulder flexion under load; Bear Crawl trains full-body tension — a direct climbing carryover.',
              exercises: [
                { name: 'DB Pullovers', sets: '3', reps: '10' },
                { name: 'Bear Crawl', sets: '3', hold: '30s' },
                { name: 'Dead Hang', sets: '3', hold: '25-30s' },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'The Push',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Climbers who only pull develop shoulder imbalances that lead to injury. Knee push-ups introduce pushing with elbows at 45° — protect your shoulders from day one.',
              exercises: [
                { name: 'Knee Push-Ups', sets: '3', reps: '8-10', notes: 'Elbows tracking at 45°.' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Full push-up graduation. Standard push-ups + Fly opens the chest to counter the pulling-dominant nature of climbing. Full stretch at the bottom of the Fly.',
              exercises: [
                { name: 'Standard Push-Ups', sets: '3', reps: '6-10' },
                { name: 'DB Chest Fly', sets: '2', reps: '12', notes: 'Full stretch at the bottom.' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Complex pushing. Push-Up to Plank trains core under pushing load; Delt Raises round out the shoulder complex. Thumbs up on front raises (safer path).',
              exercises: [
                { name: 'Push-Up to Plank', sets: '3', reps: '10' },
                { name: 'Side/Front Delt Raises', sets: '3', reps: '12', notes: 'Thumbs up on front raises.' },
              ],
            },
          },
        },
        {
          id: 'forearm_elbow',
          name: 'Forearm & Elbow Health',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Tendons adapt 5-10x slower than muscle. This work is prehab, not strength — light weight, high volume, perfect form. Finger Extensions are your primary pulley-injury prevention tool.',
              exercises: [
                { name: 'Wrist Flexor Curls', sets: '2', reps: '20', load: 'Light' },
                { name: 'Wrist Extensor Curls', sets: '2', reps: '20', load: 'Light' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Build durability. Pronation/Supination is the key addition — it prevents Climber’s Elbow (medial epicondylitis) by balancing the forearm rotators. 3 seconds down on extensors.',
              exercises: [
                { name: 'Wrist Flexor Curls', sets: '3', reps: '15' },
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15', notes: 'Three seconds down on each rep.' },
                { name: 'Pronation/Supination', sets: '2', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Eccentric loading. 4 seconds down on flexor curls — this is the single most tendon-protective exercise in the program. Add a 2s isometric hold at the bottom of Finger Extensions.',
              exercises: [
                {
                  name: 'Eccentric Wrist Flexor Curls',
                  sets: '3',
                  reps: '10',
                  notes: 'Four seconds down on every rep.',
                },
                { name: 'Wrist Extensor Curls', sets: '3', reps: '12' },
                { name: 'Finger Extensions', sets: '3', reps: '20', notes: 'Add a 2s isometric hold at the bottom.' },
              ],
            },
          },
        },
        {
          id: 'legs',
          name: 'Legs',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Hip hinge and knee tracking. Control the descent — 3 seconds down. Legs do the work in climbing too; don’t skip.',
              exercises: [
                { name: 'Box Sit-to-Stand', sets: '3', reps: '10', notes: 'Three seconds down on the descent.' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Single-leg strength and balance. Chest tall, front knee tracks over second toe. Directly translates to high-stepping on the wall.',
              exercises: [
                {
                  name: 'Reverse Lunges',
                  sets: '2',
                  reps: '10 per side',
                  notes: 'Chest tall, front knee tracking over the second toe.',
                },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Unilateral step-ups with a 3-second descent build the eccentric leg strength needed for controlled down-climbing and mantels.',
              exercises: [
                { name: 'Step-Ups', sets: '3', reps: '10 per side', notes: 'Three-second descent.' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'mob',
      name: 'Mobility & Core',
      icon: '🧘',
      description: 'Core circuit plus a mobility flow.',
      blocks: [
        {
          id: 'core_pillar',
          name: 'Core Circuit — The Pillar',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                '3 rounds, 60s rest between rounds. Establish the pillar — anti-extension and anti-rotation patterns. Lower back glued to floor on Dead Bugs. Core Plank form breaking = end the set.',
              circuit: { rounds: '3', restBetweenRounds: '60s' },
              exercises: [
                { name: 'Dead Bugs', reps: '12', notes: 'Lower back glued to the floor.' },
                { name: 'Glute Bridges', reps: '15' },
                { name: 'Core Plank', hold: '30-45s', notes: 'End the set when form breaks.' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                '3 rounds, 60s rest. Introduce dynamic patterns. Bird-Dog trains contralateral stability — imagine balancing a glass of water on your lower back. Supermans held 3s.',
              circuit: { rounds: '3', restBetweenRounds: '60s' },
              exercises: [
                {
                  name: 'Bird-Dog',
                  reps: '10 per side',
                  notes: 'Imagine balancing a glass of water on your lower back.',
                },
                { name: 'Side Plank', hold: '30s per side' },
                { name: 'Slow Mountain Climbers', reps: '20' },
                { name: 'Supermans', reps: '10', notes: 'Hold each for 3 seconds.' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                '3 rounds, 45s rest (shorter — build work capacity). Peak core demands. Hollow Body aims for 20-30s with lower back pressed into the floor. Keep form under fatigue — this is what climbing asks of you.',
              circuit: { rounds: '3', restBetweenRounds: '45s' },
              exercises: [
                {
                  name: 'Hollow Body Hold',
                  hold: 'Max (aim 20-30s)',
                  notes: 'Lower back pressed into the floor.',
                },
                { name: 'Lying Leg Raises', reps: '10-12' },
                { name: 'Plank Hip Dips', reps: '20' },
                { name: 'Supermans', reps: '10' },
              ],
            },
          },
        },
        {
          id: 'mobility_flow',
          name: 'Mobility Flow',
          perPhase: {
            [PHASE.alignment]: {
              rationale:
                'Warm up the spine and hips. Slow, controlled cycles — this is mobility, not cardio. Every rep earns you range you’ll need on the wall.',
              exercises: [
                { name: 'Cat-Cow', reps: '10 cycles' },
                { name: 'Thoracic Rotations', reps: '5 per side' },
                { name: 'World’s Greatest Stretch', reps: '3 per side' },
              ],
            },
            [PHASE.armor]: {
              rationale:
                'Deep hip opener (Pigeon) and spinal flossing (Down Dog to Cobra). Hip mobility = high-stepping without compensation. Nerve flossing teaches the nervous system the range is safe.',
              exercises: [
                { name: 'World’s Greatest Stretch', reps: '5 per side' },
                { name: 'Pigeon', hold: '60s per side' },
                { name: 'Down Dog to Cobra', reps: '10' },
              ],
            },
            [PHASE.ignition]: {
              rationale:
                'Integration. Deep Squat Hold opens hips and ankles together — the foundational rest position on vertical rock. Thoracic Rotations at volume prep the spine for climbing reaches.',
              exercises: [
                { name: 'World’s Greatest Stretch', reps: '5 per side' },
                { name: 'Deep Squat Hold', hold: '30-60s' },
                { name: 'Thoracic Rotations', reps: '10 per side' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Full rest or light walking.',
      isRest: true,
    },
  ],

  // The guide has always described "The Week 8 Deload — reduce all sets to
  // 2", and the prescription table already halves the sets there. The
  // program simply never declared it, so the app never marked the week.
  deloadWeeks: [8],
  frequency: '3-4 sessions/week + rest days as needed',
  ordering:
    'Alternate Structural Integrity and Mobility/Core days. Never do two Structural days back-to-back.',

  constraints: [
    { kind: 'sessions-per-week', min: 3, max: 4, note: '3-4 sessions per week, plus rest days as needed.' },
    {
      kind: 'min-gap-hours',
      between: ['str'],
      hours: 48,
      note: 'Never do two Structural Integrity days back to back.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description:
      'As prescribed — alternating Structural and Mobility, never two Structural days back to back.',
    slots: { 1: 'str', 2: 'mob', 4: 'str', 5: 'mob' },
  },

  assessments: [
    'wall_angel',
    'toe_touch',
    'core_plank',
    'scapular_pushup',
    'dead_bug_20',
    'max_pushups',
    'dead_hang',
    'wrist_extensor_curls',
  ],

  nextPrograms: [
    {
      id: 'base_camp',
      reason: 'The natural next step — apply your new structural base to climbing fundamentals.',
    },
  ],
};
