/**
 * Base Camp — 12-week climbing foundations (V0-V2).
 *
 * The first climbing-first program. Two structures the conversion had to
 * model that Iron Grip and Ground Zero did not need:
 *
 *  - **Tracks.** The Engine Room runs a bodyweight path (A) and a loaded
 *    path (B) side by side. The prototype encoded this as a 'Trk A:' prefix
 *    inside the exercise name; here they are tagged lines under declared
 *    program tracks, so a climber picks once and only sees their path.
 *  - **Circuit pools.** The core circuit lists nine exercises and asks you
 *    to pick five. The prototype rendered all nine as if all nine were
 *    prescribed; `circuit.pick` makes the selection rule explicit.
 */

import type { Exercise, Program } from '../types';

const PHASE = { foundation: 'foundation', engine: 'engine', headspace: 'headspace' } as const;

/** The shared nine-exercise core pool, drawn from in both the Engine Room
 *  and post-climb circuits. */
const CORE_POOL: Exercise[] = [
  { name: 'Plank' },
  { name: 'Knee Raise' },
  { name: 'Dead Bugs' },
  { name: 'Twists' },
  { name: 'V-Ups' },
  { name: 'Bird Dogs' },
  { name: 'Penguins' },
  { name: 'Flutters' },
  { name: 'Mountain Climbers' },
];

export const BASE_CAMP: Program = {
  id: 'base_camp',
  name: 'Base Camp',
  subtitle: '12-Week Climbing Foundations',
  stage: 'foundations',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V2', label: 'V0-V2' },
  weeks: 12,

  intro: {
    pitch:
      'A 12-week climbing foundations program for beginners working V0-V2 problems. Teaches the core movement vocabulary — body position, footwork, flagging, pacing — that separates climbers from people who just get up the wall.',
    rhythm: [
      '4-5 sessions per week. Consistency beats intensity at this stage.',
      'Technique sessions come before Performance sessions. The Engine Room strength work goes on a non-climbing day, with at least one rest day between hard sessions.',
      'Phase 1 (Foundation) drills fundamental movements — sticky feet, flagging, controlled hang. Phase 2 (Engine) builds general-purpose climbing strength and endurance. Phase 3 (Headspace) layers on mental game and projection skills.',
      'Log your sends, but don’t chase grades yet. Build movement repertoire first; the grades follow.',
    ],
    graduation:
      'By week 12 you’ll have a stable V2 send-level, solid technique on easy terrain, and a real engine for multi-session days. From here you can fork: Gravity Defied for dynamic boulder styles, Lockdown for static power, Iron Grip for finger strength, or The Long Game for sport-route endurance.',
  },

  tracks: [
    {
      id: 'A',
      name: 'Track A — Bodyweight',
      description:
        'For new climbers. Everything scales from bodyweight: inverted rows, assisted pull-ups, glute bridges. Pick this if you have not trained strength before, or came straight here without Ground Zero.',
    },
    {
      id: 'B',
      name: 'Track B — Loaded',
      description:
        'For climbers who finished Ground Zero or already have a strength base. Adds external load: weighted push-ups, weighted pull-ups, goblet squats and deadlifts.',
    },
  ],

  phases: [
    {
      id: PHASE.foundation,
      name: 'The Foundation',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Foundation phase builds the climbing fundamentals that outlast every strength gain: deliberate footwork, body tension, and intentional movement. You’ll drill one technique per week while logging high-volume, low-intensity climbing. Engine Room sessions keep your supporting strength ticking up without stealing recovery from climbing.',
      goals: [
        'Groove precise footwork and weight transfer',
        'Build baseline muscular endurance for climbing',
        'Establish consistent session rhythm (4-5x/week)',
        'Learn to climb with focus rather than force',
      ],
    },
    {
      id: PHASE.engine,
      name: 'The Engine',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Engine phase is where you start pushing capacity. Intervals, longer circuits, and more demanding boulder problems teach your body to recover between efforts. Engine Room sessions get heavier and your climbing gets noticeably less exhausting — that’s adaptation.',
      goals: [
        'Build aerobic and anaerobic capacity via circuit climbing',
        'Progress strength markers in Engine Room sessions',
        'Introduce mini-assessments to track progress',
        'Maintain technique drills under fatigue',
      ],
    },
    {
      id: PHASE.headspace,
      name: 'The Headspace',
      weekStart: 9,
      weekEnd: 12,
      description:
        'The Headspace phase is about mental fortitude and send-ready performance. You’ll tackle projects, learn breath control under pressure, and hit a graduation retest to see how far you’ve come. This phase asks you to trust the work and climb with intent.',
      goals: [
        'Develop projecting and falling practice',
        'Introduce dynamic movement (dynos)',
        'Apply box-breathing under effort',
        'Retest assessment markers and celebrate gains',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'tech',
      name: 'Climb: Technique',
      icon: '🧱',
      description: 'Drill of the week. Low intensity, high focus.',
      fields: ['sessionVolume'],
      drillsByWeek: {
        1: 'sticky_feet',
        2: 'flagging',
        3: 'hover_hands_3s_pause',
        4: 'the_trifecta_all_three',
        5: 'endurance_intervals_4x4',
        6: 'volume_build_mini_assessment',
        7: 'continuous_circuit_5_10_min',
        8: 'deload_flow_rpe_5',
        9: 'box_breathing_projecting',
        10: 'intro_to_dynos',
        11: 'send_week_foundations',
        12: 'graduation_retest_foundations',
      },
    },
    {
      id: 'eng',
      name: 'The Engine Room',
      icon: '⚙️',
      description: 'Push, pull, legs, and a core circuit. Runs on a non-climbing day.',
      blocks: [
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [PHASE.foundation]: {
              rationale:
                'Foundation push strength. Track A = bodyweight-based (new climbers). Track B = loaded (completed Ground Zero or already strong). Pick ONE track and stick with it the whole program. 60-90s rest between sets. Climbers are pull-dominant by default — this balances the shoulder complex.',
              exercises: [
                { name: 'Push-Ups', track: 'A', sets: '3', reps: '6-12', rest: '60-90s' },
                {
                  name: 'Weighted Push-Ups or DB Bench',
                  track: 'B',
                  sets: '3',
                  reps: '8-10',
                  rest: '60-90s',
                },
              ],
            },
            [PHASE.engine]: {
              rationale:
                'Progressive overload. Same track as Phase 1, higher intensity. Track A goes to failure; Track B adds weight. Keep form strict — sloppy reps at failure teach bad patterns. If form breaks, end the set.',
              exercises: [
                { name: 'Push-Ups', track: 'A', sets: '3', reps: 'To failure', notes: 'End the set when form breaks.' },
                { name: 'DB Bench', track: 'B', sets: '3', reps: '8-10' },
              ],
            },
            [PHASE.headspace]: {
              rationale:
                'Superset with Pull for time efficiency and power-endurance carryover. Alternate Pull and Push back-to-back with 45s rest between, 2 min between rounds. Engine Room sessions get shorter in Phase 3 as climbing demands increase.',
              exercises: [
                {
                  name: 'Pull + Push Superset',
                  track: 'A',
                  sets: '3',
                  reps: '5 pull + 10 push',
                  rest: '45s between exercises, 2 min between rounds',
                },
                {
                  name: 'Heavy Pull + Dips Superset',
                  track: 'B',
                  sets: '3',
                  reps: '3 heavy pull + 5 dips',
                  rest: '45s between exercises, 2 min between rounds',
                },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.foundation]: {
              rationale:
                'The foundational climbing strength pattern. Track A scales pull-ups via inverted rows or band assistance until you can do 3-5 strict. Track B loads existing pull-up strength with weight. Full range of motion: elbows fully extend at the bottom, chest to bar at the top.',
              exercises: [
                {
                  name: 'Inverted Rows or Assisted Pull-Ups',
                  track: 'A',
                  sets: '3',
                  reps: '5-10',
                  notes: 'Full range — elbows fully extended at the bottom, chest to bar at the top.',
                },
                { name: 'Strict Pull-Ups or Weighted Rows', track: 'B', sets: '3', reps: 'To failure' },
              ],
            },
            [PHASE.engine]: {
              rationale:
                'Hypertrophy block. Lat Pulldowns build total lat mass (Track A); Weighted Pull-Ups build max pulling strength (Track B). 3 minutes rest between heavy sets — these are strength sets, not conditioning.',
              exercises: [
                { name: 'Lat Pulldowns', track: 'A', sets: '3', reps: '8-10', rest: '3 min' },
                { name: 'Weighted Pull-Ups', track: 'B', sets: '3', reps: '5', rest: '3 min' },
              ],
            },
            [PHASE.headspace]: {
              rationale:
                'Merged into Push as a superset in Phase 3 to save time and train power-endurance. Log your Pull numbers as part of the Push block this phase.',
              mergedInto: 'push',
              exercises: [],
            },
          },
        },
        {
          id: 'legs',
          name: 'Legs',
          perPhase: {
            [PHASE.foundation]: {
              rationale:
                'Climbers neglect legs at their peril. Track A builds a hip-hinge and single-leg base with bodyweight. Track B adds load with Goblet Squats or Deadlifts. Legs do huge work in climbing — high-stepping, heel hooking, flagging all demand real leg strength.',
              exercises: [
                { name: 'Glute Bridges or Lunges', track: 'A', sets: '3', reps: '10-15' },
                { name: 'Goblet Squats or Deadlifts', track: 'B', sets: '3', reps: '8-10' },
              ],
            },
            [PHASE.engine]: {
              rationale:
                'Unilateral emphasis. Step-Ups (Track A) mimic high-step movement directly; RDLs (Track B) build hamstring and posterior-chain strength for deadlift-like climbing moves. 3-second descent on all reps.',
              exercises: [
                { name: 'Step-Ups', track: 'A', sets: '3', reps: '12 per leg', notes: 'Three-second descent.' },
                { name: 'RDLs', track: 'B', sets: '3', reps: '8-10', notes: 'Three-second descent.' },
              ],
            },
            [PHASE.headspace]: {
              rationale:
                'Explosive power. Box Jumps teach fast force production and landing mechanics — directly translates to dynamic moves and dynos. 3 minutes rest between sets, quality over quantity. Stop immediately if form degrades — depth jumps with sloppy landings are an injury pipeline.',
              exercises: [
                { name: 'Box Jumps', track: 'A', sets: '3', reps: '5', rest: '3 min' },
                { name: 'Weighted Box Jumps', track: 'B', sets: '3', reps: '5', rest: '3 min' },
              ],
            },
          },
        },
        {
          id: 'core_circuit',
          name: 'Core Circuit',
          perPhase: {
            [PHASE.foundation]: {
              rationale:
                'Pick 5 exercises. 40-60s each, 20s rest between, 2 rounds. Core tension is what keeps your feet stuck to the wall — no tension = cutting feet on overhangs. Variety across the pool means you’re training anti-extension (plank, dead bugs), anti-rotation (bird dogs, penguins), and flexion (knee raise, v-ups).',
              circuit: { pick: 5, work: '40-60s', restBetween: '20s', rounds: '2' },
              exercises: CORE_POOL,
            },
            [PHASE.engine]: {
              rationale:
                'Pick 5. 40-60s each, 2-3 rounds (up from 2). Longer session means higher work capacity. If you finished Phase 1 with form still crisp, add the third round.',
              circuit: { pick: 5, work: '40-60s', restBetween: '20s', rounds: '2-3' },
              exercises: CORE_POOL,
            },
            [PHASE.headspace]: {
              rationale:
                'Pick 3. 1 min each, 2 rounds. Shorter and sharper — compensates for the Pull+Push superset volume in the Push and Pull blocks. Pick your 3 weakest patterns from the pool.',
              circuit: { pick: 3, work: '1 min', restBetween: '20s', rounds: '2' },
              exercises: CORE_POOL,
            },
          },
        },
      ],
    },
    {
      id: 'perf',
      name: 'Climb: Performance',
      icon: '⚡',
      description: 'Hard effort — limit bouldering or routes, then a short core circuit.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent'],
      blocks: [
        {
          id: 'core_post_climb',
          name: 'Core Circuit (post-climb)',
          perPhase: {
            [PHASE.foundation]: {
              rationale:
                'Performance + Engine Room = 2x/week Core Circuit. Pick 3 exercises, 40-60s each, 20s rest, 1 round. Short and sharp — don’t blow your recovery after hard climbing. Skip entirely if you’re already cooked.',
              circuit: { pick: 3, work: '40-60s', restBetween: '20s', rounds: '1' },
              exercises: CORE_POOL,
            },
            [PHASE.engine]: {
              rationale:
                'Same setup. Pick 3, 40-60s, 1 round. Mid-program fatigue is real — if you’re behind on sleep, skip this and prioritize the next session.',
              circuit: { pick: 3, work: '40-60s', restBetween: '20s', rounds: '1' },
              exercises: CORE_POOL,
            },
            [PHASE.headspace]: {
              rationale:
                'Pick 3, 1 min each, 1 round. Keep the circuit SHORTER than Engine Room’s version — this is maintenance, not capacity building.',
              circuit: { pick: 3, work: '1 min', restBetween: '20s', rounds: '1' },
              exercises: CORE_POOL,
            },
          },
        },
      ],
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Active recovery, mobility, or full rest.',
      isRest: true,
    },
  ],

  frequency: '4-5 sessions/week. Consistency beats intensity.',
  ordering:
    'Technique before Performance. Engine Room on a non-climbing day. At least 1 rest day between hard sessions.',

  constraints: [
    { kind: 'sessions-per-week', min: 4, max: 5, note: '4-5 sessions per week. Consistency beats intensity.' },
    {
      kind: 'not-before',
      sessionTypeId: 'perf',
      before: 'tech',
      note: 'Technique sessions come before Performance sessions in the week.',
    },
    {
      kind: 'min-gap-hours',
      between: ['perf'],
      hours: 48,
      note: 'At least one rest day between hard sessions.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'As prescribed — Technique, Engine Room, and a Performance day.',
    slots: { 1: 'tech', 2: 'eng', 4: 'perf' },
  },

  assessments: [
    'max_pushups',
    'max_pullups',
    'dead_hang',
    'core_plank',
    'flash_grade',
    'capacity_test_4x4',
  ],

  nextPrograms: [
    { id: 'gravity_defied', reason: 'For boulderers who love dynamic, parkour-style climbing.' },
    { id: 'the_long_game', reason: 'For sport climbers who want to build rope-climbing endurance.' },
    { id: 'lockdown', reason: 'For powerful, static climbing — big locks and slow control.' },
    { id: 'iron_grip', reason: 'If you’re already flashing V3-V5 and ready to build finger strength.' },
  ],
};
