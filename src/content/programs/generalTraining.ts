/**
 * General Training — open-ended logging, no active program.
 *
 * A `kind: 'mode'` entry: no periodization, no finish line, no adherence to
 * measure. The prototype modelled this as a 52-week program with a single
 * phase, which meant completion and adherence math ran against it and
 * produced meaningless numbers.
 *
 * Its blocks are reference menus — a library of sane choices for someone
 * training without a plan — rather than a prescription.
 */

import type { Exercise, Program } from '../types';

const ONGOING = 'ongoing';

const CORE_POOL: Exercise[] = [
  { name: 'Plank' },
  { name: 'Hollow Body Hold' },
  { name: 'Toes-to-Bar' },
  { name: 'L-Sit' },
  { name: 'Dead Bugs' },
  { name: 'RKC Plank' },
  { name: 'Pallof Press' },
  { name: 'Bird-Dogs' },
  { name: 'Hanging Knee Raises' },
  { name: 'V-Ups' },
  { name: 'Ab Wheel Rollouts' },
  { name: 'Side Plank' },
  { name: 'Front Lever Progressions', protocolId: 'front_lever' },
  { name: 'Supermans' },
];

export const GENERAL_TRAINING: Program = {
  id: 'general_training',
  name: 'General Training',
  subtitle: 'No Active Program',
  kind: 'mode',
  stage: 'ongoing',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'All Levels' },
  weeks: 52,

  intro: {
    pitch:
      'No structure, just logging. Train what you want, when you want, and keep the history — every session still counts toward your stats, your projects, and your altimeter.',
    rhythm: [
      'Log your sessions as they happen. There is no weekly minimum or maximum here.',
      'The menus below are reference, not prescription — sane defaults for pulling, pushing, core, legs, and prehab if you are training without a plan.',
      'Focus on consistency and listening to your body.',
      'When you want structure, pick a program. Your history comes with you.',
    ],
    graduation:
      'There is nothing to graduate from. When you are ready for a plan, Ground Zero, Base Camp, or a focused block will pick up exactly where your logs leave off.',
  },

  phases: [
    {
      id: ONGOING,
      name: 'Ongoing',
      weekStart: 1,
      weekEnd: 52,
      description:
        'Open-ended training. No phases, no periodization — just consistent logging and the reference menus below when you need a starting point.',
      goals: ['Train consistently', 'Log honestly', 'Listen to your body'],
    },
  ],

  sessionTypes: [
    {
      id: 'climb',
      name: 'Climbing Session',
      icon: '🧗',
      description: 'Bouldering, sport, or trad. Focus on movement and fun.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'sessionVolume', 'pumpLevel', 'location'],
    },
    {
      id: 'str',
      name: 'Strength & Conditioning',
      icon: '💪',
      description: 'Off-wall training: pulling, pushing, core, legs, and prehab.',
      blocks: [
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Pick 1-2 exercises per session. Rule of thumb for strength: 3 sets of 5-8 reps at a hard weight. For hypertrophy or maintenance: 3 sets of 8-12. Rest 2-3 min between heavy sets. Skip entirely on climbing-heavy days — pulling is already the main stimulus on the wall.',
              selection: { pick: 2, note: '3x5-8 for strength, 3x8-12 for maintenance.' },
              exercises: [
                { name: 'Pull-Ups' },
                { name: 'Inverted Rows' },
                { name: 'Weighted Pull-Ups' },
                { name: 'Lat Pulldowns' },
                { name: 'Chin-Ups' },
                { name: 'Archer Rows' },
                { name: 'One-Arm Row (DB)' },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Pick 1-2 push variations. Climbers are chronically pull-dominant — push work is INJURY PREVENTION, not bodybuilding. 3 sets of 8-15 reps, controlled tempo. Non-negotiable if you’re climbing consistently; rounded shoulders and impingement come from skipping this.',
              selection: { pick: 2, note: '3 sets of 8-15 reps, controlled tempo.' },
              exercises: [
                { name: 'Push-Ups' },
                { name: 'Dips' },
                { name: 'Overhead Press' },
                { name: 'Bench Press' },
                { name: 'DB Press' },
                { name: 'Wide Push-Ups' },
                { name: 'Pike Push-Ups' },
              ],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Pick 3-4 exercises spanning different categories (anti-extension, anti-rotation, flexion, isometric). 30-60s holds or 8-15 reps, 2-3 rounds. Anti-extension (Hollow, Dead Bugs, RKC Plank) and anti-rotation (Pallof, Bird-Dogs) transfer most directly to wall tension.',
              selection: { pick: 4, note: 'Span anti-extension, anti-rotation, flexion, and isometric.' },
              circuit: { rounds: '2-3', work: '30-60s or 8-15 reps' },
              exercises: CORE_POOL,
            },
          },
        },
        {
          id: 'legs',
          name: 'Legs',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Legs are the most under-trained body part for climbers. Pick 1-2 variations. Strength: 3 sets of 5-8. Hypertrophy: 3 sets of 8-12. Explosive (Box Jumps): 3 sets of 5. Legs drive heel hooks, toe hooks, high-steps, and pushing off footholds — skip at your wall’s expense.',
              selection: { pick: 2, note: 'Strength 3x5-8, hypertrophy 3x8-12, explosive 3x5.' },
              exercises: [
                { name: 'Squats' },
                { name: 'Lunges' },
                { name: 'Deadlifts' },
                { name: 'RDLs' },
                { name: 'Box Jumps' },
                { name: 'Step-Ups' },
                { name: 'Bulgarian Split Squats' },
                { name: 'Goblet Squats' },
                { name: 'Calf Raises' },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor & Prehab',
          perPhase: {
            [ONGOING]: {
              rationale:
                'The boring work that prevents Golfer’s Elbow, Tennis Elbow, rotator cuff issues, and pulley strains. Non-negotiable for anyone climbing consistently. 10-15 minutes, 1-2x per week minimum. Light weight, high rep, perfect form. Every career-ending injury traces back to skipping this.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
                { name: 'Band Face Pulls', sets: '2', reps: '15' },
                { name: 'Hammer Curls', sets: '2', reps: '12' },
                { name: 'Pronation/Supination', sets: '2', reps: '15 per side' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'hb',
      name: 'Hangboard / Finger',
      icon: '✋',
      description: 'Specific finger strength training. Know what you are doing before you start.',
      blocks: [
        {
          id: 'finger_protocol',
          name: 'Finger Protocol',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Hangboarding is the most injury-prone self-directed work in climbing. RULES: half crimp or open hand grip only — never full crimp. Warm up thoroughly (10+ min climbing or a hang ladder) before any max work. 48 hours between hangboard sessions. Stop immediately at any sharp finger pain. If you don’t know your max weight, run Iron Grip first — don’t guess on a hangboard.',
              selection: { pick: 1, note: 'One protocol per session. Never stack two.' },
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '10s',
                  load: '85-90% max',
                  rest: '3 min',
                  notes: 'Builds strength.',
                },
                {
                  name: '7/3 Repeaters',
                  protocolId: 'repeaters_7_3',
                  sets: '3-5',
                  reps: '6 hangs per set',
                  load: '60-70% max',
                  notes: 'Builds endurance.',
                },
                {
                  name: 'Density Hangs',
                  protocolId: 'density_hangs',
                  hold: '30s+',
                  load: 'Bodyweight, 20mm',
                  notes: 'Builds tendon capacity.',
                },
                {
                  name: 'Minimum Edge',
                  protocolId: 'min_edge_hangs',
                  hold: '7s',
                  load: 'Bodyweight, progressively smaller edges',
                  notes: 'Builds specific finger strength.',
                },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor / Prehab',
          perPhase: {
            [ONGOING]: {
              rationale:
                'Paired with every Hangboard session — not optional. Heavy finger loading without antagonist balance is how Climber’s Elbow (medial epicondylitis) develops. Light weight, high rep, immediately after the finger protocol.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Reverse Wrist Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15-20' },
                { name: 'Pronation/Supination', sets: '2', reps: '15 per side' },
                { name: 'Hammer Curls', sets: '2', reps: '12' },
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
      description: 'Full rest or light activity.',
      isRest: true,
    },
  ],

  frequency: 'Flexible. Log whatever you train. No weekly minimum or maximum.',
  ordering:
    'Log your sessions as they happen. Focus on consistency and listening to your body. When you are ready for structure, pick a program — your history stays with you.',

  constraints: [],

  assessments: [
    'max_hang_20mm_7s',
    'max_pullups',
    'max_pushups',
    'core_plank',
    'dead_hang',
    'flash_grade',
    'redpoint_grade',
  ],

  nextPrograms: [
    {
      id: 'ground_zero',
      reason: 'If you’re new to climbing or coming back from a break — build the foundation first.',
    },
    {
      id: 'base_camp',
      reason: 'V0-V2 climber ready for structured fundamentals — technique, strength, and the mental game in that order.',
    },
    {
      id: 'iron_grip',
      reason: 'V5-V8 climber whose fingers are the limiter — a focused 12-week finger block.',
    },
    { id: 'the_cruiser', reason: 'Want light structure without a peak? The Cruiser keeps everything ticking.' },
  ],
};
