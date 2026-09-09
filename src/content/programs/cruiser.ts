/**
 * The Cruiser — perpetual maintenance (all levels).
 *
 * The between-blocks program: keep climbing well without grinding toward a
 * peak. Almost every block here is a *menu* — pick one technique focus, one
 * performance approach, one endurance protocol — which is why `selection`
 * exists as its own concept rather than being folded into circuits.
 *
 * Week 4 of every block is a deload, and Armor is the one block that never
 * deloads with it.
 */

import type { Exercise, Program } from '../types';

const PHASE = { block1: 'block1', block2: 'block2', block3: 'block3' } as const;

const CORE_POOL: Exercise[] = [
  { name: 'Hollow Body Hold' },
  { name: 'Dead Bugs' },
  { name: 'RKC Plank' },
  { name: 'Pallof Press' },
  { name: 'Bird-Dogs' },
  { name: 'Hanging Knee Raises' },
  { name: 'L-Sit' },
  { name: 'Side Plank' },
  { name: 'Ab Wheel Rollouts' },
  { name: 'Plank Hip Dips' },
  { name: 'Toes-to-Bar' },
  { name: 'V-Ups' },
  { name: 'Front Lever Progressions', protocolId: 'front_lever' },
  { name: 'Supermans' },
  { name: 'Reverse Hypers' },
];

const ARMOR: Exercise[] = [
  { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
  { name: 'Finger Extensions', sets: '3', reps: '15' },
  { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
  { name: 'Band Face Pulls', sets: '2', reps: '15' },
  { name: 'Hammer Curls', track: 'B', sets: '2', reps: '12' },
  { name: 'Pronation/Supination', track: 'B', sets: '2', reps: '15 per side' },
];

const TECHNIQUE_MENU: Exercise[] = [
  { name: 'Quiet Feet', notes: 'Place every foot silently and deliberately.' },
  { name: 'Straight Arms', notes: 'Hang off the skeleton, not the muscle — save energy.' },
  { name: 'Hip Positioning', notes: 'Hips to the wall on vertical, open on slab.' },
  { name: 'Reading Sequences', notes: 'Visualise the beta before pulling on.' },
  { name: 'Breathing', notes: 'Exhale on effort, box-breathe on rests.' },
  { name: 'Flagging', notes: 'Counterbalance with the free leg to reduce pull.' },
];

const PERFORMANCE_MENU: Exercise[] = [
  { name: 'Limit Bouldering', notes: '3-4 projects at max grade, 4-5 burns each.' },
  { name: 'Hard Routes', notes: 'Redpoint or hard on-sight attempts at your limit.' },
  { name: 'Project Day', notes: 'One boulder or route just past your level — work the crux.' },
  { name: 'Send Window', notes: 'Best conditions, real burns on a chosen project.' },
];

const ENDURANCE_MENU: Exercise[] = [
  { name: 'ARC', protocolId: 'arcing', hold: '15-30 min continuous', notes: 'RPE 3-4. Builds aerobic base.' },
  { name: '4x4', sets: '3-4', reps: '4 boulders back to back', rest: '4 min', notes: 'Builds power endurance.' },
  { name: 'Linked Laps', sets: '3-4', reps: 'Route, lower, repeat', rest: '4 min', notes: 'Builds route stamina.' },
  { name: 'Circuit', reps: '6-10 problems, minimal rest', notes: 'Builds strength endurance. Repeat as able.' },
];

export const THE_CRUISER: Program = {
  id: 'the_cruiser',
  name: 'The Cruiser',
  subtitle: 'Perpetual Maintenance',
  kind: 'program',
  stage: 'ongoing',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'All Levels' },
  weeks: 12,

  intro: {
    pitch:
      'The between-blocks program. Keeps your fingers, engine, and movement sharp without grinding toward a peak — run it for a block, or run it indefinitely between hard cycles.',
    rhythm: [
      'Up to 5 days a week: 3-4 climbing plus 1-2 strength, with a minimum of two rest days.',
      'Every session is a menu. Pick ONE technique focus, ONE performance approach, ONE endurance protocol — drilling one cue thoroughly beats half-trying six.',
      'Week 4 of every block is a deload: no Performance day, volume down 40%, RPE 4-6 maximum.',
      'Armor never deloads. Even in deload weeks it stays at full volume — it is the block that protects everything else.',
    ],
    graduation:
      'The Cruiser has no finish line. Run it until you want a peak again, then pick a focused block: Iron Grip for fingers, Peak Performance for a hard project, or The Long Game for route endurance.',
  },

  tracks: [
    {
      id: 'A',
      name: 'Track A — Maintenance',
      description: 'Hold what you have. Bodyweight-based strength work at moderate volume.',
    },
    {
      id: 'B',
      name: 'Track B — Progressive',
      description:
        'Small continued gains. Loaded strength work and extra armor. Pick one track per block and do not mix within it.',
    },
  ],

  phases: [
    {
      id: PHASE.block1,
      name: 'Block 1',
      weekStart: 1,
      weekEnd: 4,
      description:
        'Block 1 is about showing up and drilling fundamentals. Pick one focus per session and give it the whole session. Performance days stay honest but submaximal — you are maintaining, not peaking. Week 4 is a deload.',
      goals: [
        'Re-establish a consistent weekly rhythm',
        'Drill one technique cue per session',
        'Build the aerobic base with ARC-biased endurance work',
        'Keep strength ticking over on a single chosen track',
      ],
    },
    {
      id: PHASE.block2,
      name: 'Block 2',
      weekStart: 5,
      weekEnd: 8,
      description:
        'Block 2 is a gentle push. Volume sessions bias slightly harder, performance days let the grade creep toward your true limit, and the harder endurance protocols rotate in. Movement quality should feel noticeably tighter than Block 1. Week 8 is a deload.',
      goals: [
        'Bias climbing one grade closer to your limit',
        'Rotate in harder endurance protocols',
        'Reassess your strength track and switch at the block boundary if needed',
        'Maintain technique discipline as intensity rises',
      ],
    },
    {
      id: PHASE.block3,
      name: 'Block 3',
      weekStart: 9,
      weekEnd: 12,
      description:
        'Block 3 is a brief performance window. Pick a project and give it real burns in good conditions, while Volume and Endurance days run short and easy to protect recovery. Week 12 is the final deload and assessment window.',
      goals: [
        'Open a short performance window on one or two projects',
        'Use volume days as genuine active recovery',
        'Support the project with endurance work that matches it',
        'Retest the benchmarks and decide what comes next',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'vol',
      name: 'Climbing: Volume & Flow',
      icon: '🎵',
      description: 'Easy climbing with a technique focus. RPE 4-6, two to four grades below max.',
      fields: ['sessionVolume'],
      blocks: [
        {
          id: 'technique_focus',
          name: 'Technique Focus',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Block 1 mindset: show up, pick ONE focus, drill it for 60 minutes. Better to drill one cue thoroughly than half-try six. Rotate focuses across sessions. Week 4 of the block is a DELOAD — keep volume but drop intensity to RPE 4-5, no limit attempts, no chasing anything.',
              selection: { pick: 1, note: 'Rotate the focus across sessions.' },
              exercises: TECHNIQUE_MENU,
            },
            [PHASE.block2]: {
              rationale:
                'Block 2 is a gentle push. Keep the same one-focus-per-session discipline, but bias your Volume sessions slightly harder — climb 1-2 grades below max (not 2-4). Your movement quality should be noticeably tighter than Block 1. Week 8 deload: same rules — volume at RPE 4-5 only.',
              selection: { pick: 1, note: 'Rotate the focus across sessions.' },
              exercises: TECHNIQUE_MENU,
            },
            [PHASE.block3]: {
              rationale:
                'Block 3 is a brief performance window. Use Volume sessions between Performance days as active recovery — same focus menu, but keep them short (45-60 min) and genuinely easy. Volume here protects your recovery for the harder projecting. Week 12 is the final deload and assessment window.',
              selection: { pick: 1, note: 'Keep the session short and genuinely easy.' },
              exercises: TECHNIQUE_MENU,
            },
          },
        },
      ],
    },
    {
      id: 'perf',
      name: 'Climbing: Performance',
      icon: '⚡',
      description: 'Limit bouldering or hard routes. RPE 8-9.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'attemptsToday'],
      blocks: [
        {
          id: 'performance_focus',
          name: 'Performance Focus',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Block 1: keep performance days honest but submaximal — pick ONE approach, warm up fully (20-30 min), and climb at RPE 7-8, not 9. You are maintaining, not peaking. One or two performance days a week is plenty. Week 4 of the block is a DELOAD — skip the performance day or keep it at RPE 5 with no limit attempts.',
              selection: { pick: 1 },
              exercises: PERFORMANCE_MENU,
            },
            [PHASE.block2]: {
              rationale:
                'Block 2 lets you push. Bias toward your weaker discipline (boulder vs route) and let the grade creep toward your true limit at RPE 8. Still cap it at 1-2 performance days a week — Volume and Endurance days protect your recovery. Week 8 deload: easy climbing only, no chasing.',
              selection: { pick: 1, note: 'Bias toward your weaker discipline.' },
              exercises: PERFORMANCE_MENU,
            },
            [PHASE.block3]: {
              rationale:
                'Block 3 is your performance window — this is when you actually send. Pick one or two projects and give them real burns in good conditions, RPE 8-9. Let Volume and Endurance days run short and easy to keep you fresh for these. Week 12 is the final deload and a chance to see where your maintenance has left you.',
              selection: { pick: 1 },
              exercises: PERFORMANCE_MENU,
            },
          },
        },
      ],
    },
    {
      id: 'end',
      name: 'Climbing: Endurance',
      icon: '🔥',
      description: 'ARC, 4x4s, linked laps, or circuits. RPE 6-8.',
      fields: ['routesCompleted', 'pumpLevel'],
      blocks: [
        {
          id: 'endurance_protocol',
          name: 'Endurance Protocol',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Block 1: bias toward ARC for the first 3 weeks — it’s the foundation for everything else. Pick one protocol for the session. ARC builds aerobic base, 4x4 builds power-endurance, Linked Laps builds route stamina, Circuits build strength endurance. Week 4 deload: ARC only, reduce to 2x10 min.',
              selection: { pick: 1, note: 'Bias toward ARC for the first three weeks.' },
              exercises: ENDURANCE_MENU,
            },
            [PHASE.block2]: {
              rationale:
                'Block 2: rotate the harder protocols in (4x4s, Linked Laps) 1-2x per block. Week 8 deload week: ARC only, easy intensity. Don’t chase 4x4 progress — that belongs in Peak Performance, not in Cruiser.',
              selection: { pick: 1, note: 'Rotate the harder protocols in once or twice this block.' },
              exercises: ENDURANCE_MENU,
            },
            [PHASE.block3]: {
              rationale:
                'Block 3: if you picked a short-term project for this block, Endurance sessions support it — Linked Laps on routes similar to your project are the highest-ROI protocol. Week 12 deload: reduce Endurance to one easy ARC session for the week.',
              selection: { pick: 1, note: 'Choose the protocol that best matches your project.' },
              exercises: ENDURANCE_MENU,
            },
          },
        },
      ],
    },
    {
      id: 'str',
      name: 'Strength & Armor',
      icon: '⚙️',
      description: 'Off-wall work on your chosen track.',
      blocks: [
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Pick ONE track for the block. Track A if you’re maintaining. Track B if you want small continued gains. Don’t mix within a block — progression confusion is the main reason maintenance programs stall.',
              exercises: [
                { name: 'Pull-Ups or Rows', track: 'A', sets: '3', reps: '8-10 pull-ups, or 10 rows' },
                { name: 'Weighted Pull-Ups or Heavy Rows', track: 'B', sets: '3', reps: '5 weighted, or 8 heavy rows' },
              ],
            },
            [PHASE.block2]: {
              rationale:
                'Mid-program: if Track A feels too easy (reps finishing with 3+ in reserve), switch to Track B. If Track B feels grindy, switch to Track A. Blocks are the natural switch point, not mid-block.',
              exercises: [
                { name: 'Pull-Ups or Rows', track: 'A', sets: '3', reps: '8-10 pull-ups, or 10 rows' },
                { name: 'Weighted Pull-Ups or Heavy Rows', track: 'B', sets: '3', reps: '5 weighted, or 8 heavy rows' },
              ],
            },
            [PHASE.block3]: {
              rationale:
                'Final block: maintain whatever track you’ve been running. If you’re in a performance window (Block 3 project), consider dropping pull volume to 2 sets to preserve recovery for the wall.',
              exercises: [
                { name: 'Pull-Ups or Rows', track: 'A', sets: '2-3', reps: '8-10 pull-ups, or 10 rows' },
                { name: 'Weighted Pull-Ups or Heavy Rows', track: 'B', sets: '2-3', reps: '5 weighted, or 8 heavy rows' },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'Push (Antagonist)',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Pushing balance. Keeps shoulders from rounding forward from chronic pulling. Non-negotiable regardless of track — the climber who skips push work is the climber who develops impingement at year 3.',
              exercises: [
                { name: 'Push-Ups or DB Press', track: 'A', sets: '3', reps: '10-15 push-ups, or 10-12 press' },
                { name: 'Dips or Overhead Press', track: 'B', sets: '3', reps: '8-10 dips, or 8 press' },
              ],
            },
            [PHASE.block2]: {
              rationale:
                'Same exercise, same track. If shoulders feel tight or pinched, bump to 3x12 rather than changing the exercise. Volume at moderate load is what antagonist muscles respond to.',
              exercises: [
                { name: 'Push-Ups or DB Press', track: 'A', sets: '3', reps: '10-15 push-ups, or 10-12 press' },
                { name: 'Dips or Overhead Press', track: 'B', sets: '3', reps: '8-10 dips, or 8 press' },
              ],
            },
            [PHASE.block3]: {
              rationale:
                'Maintain. This is not the week to progress push work. If project fatigue is high, drop to 2 sets but don’t skip.',
              exercises: [
                { name: 'Push-Ups or DB Press', track: 'A', sets: '2-3', reps: '10-15 push-ups, or 10-12 press' },
                { name: 'Dips or Overhead Press', track: 'B', sets: '2-3', reps: '8-10 dips, or 8 press' },
              ],
            },
          },
        },
        {
          id: 'legs',
          name: 'Legs',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Leg strength transfers directly to climbing — heel hooks, toe hooks, pushing off footholds, high-stepping. Under-trained in most climbers. Track A is bodyweight-focused; Track B adds load via RDLs, Bulgarians, or Goblet Squats.',
              exercises: [
                { name: 'Lunges, Step-Ups or Squats', track: 'A', sets: '2', reps: '10-12' },
                { name: 'RDLs, Bulgarians or Goblet Squats', track: 'B', sets: '3', reps: '8' },
              ],
            },
            [PHASE.block2]: {
              rationale:
                'Same. If you have access to gym equipment and want the Track B load, it’s worth the time — leg work offers the most strength-to-time-investment for climbers.',
              exercises: [
                { name: 'Lunges, Step-Ups or Squats', track: 'A', sets: '2', reps: '10-12' },
                { name: 'RDLs, Bulgarians or Goblet Squats', track: 'B', sets: '3', reps: '8' },
              ],
            },
            [PHASE.block3]: {
              rationale:
                'Maintain. Skip the 3rd set on heavier variations if tired — legs are the least likely to limit your wall performance in Block 3.',
              exercises: [
                { name: 'Lunges, Step-Ups or Squats', track: 'A', sets: '2', reps: '10-12' },
                { name: 'RDLs, Bulgarians or Goblet Squats', track: 'B', sets: '2-3', reps: '8' },
              ],
            },
          },
        },
        {
          id: 'core_circuit',
          name: 'Core Circuit',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Pick 4-5. 45-60s each, 2-3 rounds. Rotate the picks across sessions to keep the stimulus fresh. Prioritize anti-extension (Hollow, Dead Bugs, RKC Plank, Ab Wheel) and anti-rotation (Pallof Press, Bird-Dogs, Plank Hip Dips) — these transfer directly to wall tension.',
              selection: { pick: 4, note: 'Rotate your picks across sessions.' },
              circuit: { rounds: '2-3', work: '45-60s' },
              exercises: CORE_POOL,
            },
            [PHASE.block2]: {
              rationale:
                'Same structure. Consider picking 2 anti-extension, 1 anti-rotation, 1 flexion (Knee Raises / Toes-to-Bar / V-Ups), and 1 isometric (L-Sit / Front Lever / Side Plank) — covers all planes.',
              selection: { pick: 5, note: 'Two anti-extension, one anti-rotation, one flexion, one isometric.' },
              circuit: { rounds: '2-3', work: '45-60s' },
              exercises: CORE_POOL,
            },
            [PHASE.block3]: {
              rationale:
                'If you’re running a project in Block 3, a short 3-exercise core circuit (2 anti-extension + 1 anti-rotation) is enough. Recovery matters more than volume this block.',
              selection: { pick: 3, note: 'Two anti-extension plus one anti-rotation.' },
              circuit: { rounds: '2', work: '45-60s' },
              exercises: CORE_POOL,
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor (non-negotiable)',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'The most boring work in the program and the most important for longevity. Every career-ending injury traces back to skipping this. 1-2 sessions/week minimum. Light load, perfect form.',
              exercises: ARMOR,
            },
            [PHASE.block2]: {
              rationale:
                'Same routine. If anything feels tight (grumpy elbow, sensitive shoulder), add a SET at the same light load — do NOT increase resistance to push through symptoms.',
              exercises: ARMOR,
            },
            [PHASE.block3]: {
              rationale:
                'Armor NEVER deloads. Even in the intra-block deload weeks, Armor stays at full volume. A tweaked pulley or elbow in Block 3 ends your project window — 10 minutes of Armor prevents it.',
              exercises: ARMOR,
            },
          },
        },
      ],
    },
    {
      id: 'hb',
      name: 'Hangboard Module (optional)',
      icon: '✋',
      description: 'Maintenance hangs at 80% of training max, once or twice a week.',
      blocks: [
        {
          id: 'hangboard_protocol',
          name: 'Hangboard Protocol',
          perPhase: {
            [PHASE.block1]: {
              rationale:
                'Maintenance dose. 80% of training max — enough to preserve, not enough to build. Alternate Half Crimp and Open Hand across sessions (not in the same session). Skip if fingers feel any tweak.',
              selection: { pick: 1, note: 'Alternate grips across sessions, never both in one.' },
              exercises: [
                {
                  name: 'Half Crimp Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
                {
                  name: 'Open Hand Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
              ],
            },
            [PHASE.block2]: {
              rationale:
                'Continue at 80% TM. If you want to push, run the Iron Grip program instead — Cruiser’s Hangboard Module is for preservation, not progression. Deload weeks: drop to 3x7s at 70% TM or skip entirely.',
              selection: { pick: 1, note: 'Alternate grips across sessions.' },
              exercises: [
                {
                  name: 'Half Crimp Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
                {
                  name: 'Open Hand Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
              ],
            },
            [PHASE.block3]: {
              rationale:
                'Maintain. If you’re in a performance window, consider dropping Hangboard to 1x/week to spare the fingers for the project.',
              selection: { pick: 1, note: 'Drop to once a week during a performance window.' },
              exercises: [
                {
                  name: 'Half Crimp Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
                {
                  name: 'Open Hand Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5',
                  hold: '7-10s',
                  load: '80% of training max',
                  rest: '3 min',
                },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'rest',
      name: 'Recovery & Mobility',
      icon: '🔋',
      description: 'Mobility flow, foam rolling, light cardio. No climbing.',
      isRest: true,
    },
  ],

  deloadWeeks: [4, 8, 12],

  frequency: 'Up to 5 days/week. 3-4 climbing + 1-2 strength. Minimum 2 rest days.',
  ordering:
    'Performance and Endurance not on consecutive days. Strength & Armor on non-climbing days. Hangboard: 48hrs before hard climbing. Week 4 of every block is a deload — no Performance, volume -40%, RPE 4-6 max.',

  constraints: [
    {
      kind: 'sessions-per-week',
      min: 3,
      max: 5,
      note: 'Up to five days a week, with a minimum of two rest days.',
    },
    {
      kind: 'min-gap-hours',
      between: ['perf', 'end'],
      hours: 48,
      note: 'Performance and Endurance should not fall on consecutive days.',
    },
    {
      kind: 'min-gap-hours',
      between: ['hb'],
      hours: 48,
      note: 'Leave 48 hours between hangboard sessions and hard climbing.',
    },
    { kind: 'max-per-week', sessionTypeId: 'perf', count: 2, note: 'One or two performance days a week.' },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'Volume, Strength, Performance, Endurance — with recovery between the hard days.',
    slots: { 1: 'vol', 2: 'str', 4: 'perf', 6: 'end' },
  },

  assessments: [
    'dead_hang',
    'max_pullups',
    'max_pushups',
    'core_plank',
    'flash_grade',
    'redpoint_grade',
    'capacity_4x4_quality',
  ],

  nextPrograms: [
    { id: 'iron_grip', reason: 'Cycle back through a focused finger-strength block.' },
    { id: 'peak_performance', reason: 'Chase a hard project — time for a peak phase.' },
    { id: 'the_long_game', reason: 'Rebuild the aerobic engine before a season of routes.' },
  ],
};
