/**
 * Peak Performance — 12-week advanced bouldering (V8-V11).
 *
 * The largest program in the catalog: three drill-driven session types
 * (limit bouldering, technique, projecting) plus a fingerboard day. Its
 * deload placement is the reason `deloadWeeks` is an explicit list rather
 * than a repeating cycle: the two windows open the Intensify and Peak
 * phases rather than closing the ones before them, because a deload is the
 * first week of the harder thing rather than the last week of the easier
 * one.
 *
 * It used to read `[4, 8, 9]` — phase-end deloads apparently added on top of
 * an existing week 9, which put **two deload weeks back to back** and
 * disagreed with this program's own guide (PLAN.md M34).
 */

import type { Program } from '../types';

const PHASE = { build: 'build', intensify: 'intensify', peak: 'peak' } as const;

export const PEAK_PERFORMANCE: Program = {
  id: 'peak_performance',
  name: 'Peak Performance',
  subtitle: '12-Week Advanced Boulder',
  kind: 'program',
  stage: 'advanced',
  discipline: 'boulder',
  gradeRange: { scale: 'V', min: 'V8', max: 'V11', label: 'V8-V11' },
  weeks: 12,
  equipment: ['wall', 'hangboard', 'gym'],

  intro: {
    pitch:
      'A 12-week advanced-bouldering program for V8-V11 climbers. Peaks contact strength, power endurance, and send-specificity so you can redpoint near your ceiling. Requires Iron Grip graduate-level finger strength.',
    rhythm: [
      '4-5 structured sessions per week. Limit bouldering on Session A, power-endurance circuits on Session B, project days on Session C, and a skills/drill day on D.',
      'Phase 1 (Base) holds high volume to rebuild capacity. Phase 2 (Build) introduces limit-intensity work with long rests. Phase 3 (Peak) tapers volume, maximizes rest, targets your send window.',
      'Project selection matters. Pick a route 1-2 grades above your redpoint level at week 1; you should land within two moves of the top by week 8 and one-hang it by week 10.',
      'Rest like it’s training. Two full rest days per week. Skipping them is how plateaus happen.',
    ],
    graduation:
      'By week 12 you’ll redpoint near or at your ceiling grade, with a trained taper pattern you can reuse forever. Next: a Cruiser block to maintain, or another Peak Performance cycle aimed at a harder project.',
  },

  phases: [
    {
      id: PHASE.build,
      name: 'Build',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Build phase is controlled volume. You’ll accumulate hard mileage on boulders at your current limit minus a grade or two, building tissue tolerance and movement vocabulary. Strength work supports — it doesn’t dominate. This is the phase where most gains actually happen; the later phases are where you express them.',
      goals: [
        'Accumulate volume on hard-but-manageable boulders',
        'Build base strength via hangboard and weighted pulls',
        'Develop movement vocabulary on varied styles',
        'Establish sleep, nutrition, and recovery habits',
      ],
    },
    {
      id: PHASE.intensify,
      name: 'Intensify',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Intensify phase turns the screws. Sessions get shorter, harder, and more focused. Limit bouldering replaces volume work. You’ll feel tired, but the tiredness is productive. Track your efforts — overtraining is real in this phase.',
      goals: [
        'Push limit bouldering attempts to near-max effort',
        'Progress hangboard to peak weighted-hang capacity',
        'Develop power endurance via 4x4s and circuits',
        'Monitor recovery markers (sleep, HRV, RPE trends)',
      ],
    },
    {
      id: PHASE.peak,
      name: 'Peak & Send',
      weekStart: 9,
      weekEnd: 12,
      description:
        'Peak & Send phase is short, sharp, and focused. You reduce volume dramatically and put all your effort into expressing the strength you built. This is when the projects you’ve been circling become sends. Listen to your body and don’t over-train during send windows.',
      goals: [
        'Taper volume to peak freshness',
        'Focus every session on specific projects',
        'Climb less but harder',
        'Send long-standing projects',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'perf',
      name: 'Max Intensity Bouldering',
      icon: '⚡',
      description: 'The hardest climbing of the week. Warm up 20-30 minutes.',
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'attemptsToday'],
      drillsByWeek: {
        1: 'pp_limit_four_burns',
        2: 'pp_style_diverse_limit',
        3: 'pp_crux_isolation',
        4: 'pp_deload_flow',
        5: 'pp_intensify_five_burns',
        6: 'pp_boulder_link_ups',
        7: 'pp_hard_flash_day',
        8: 'pp_deload_flash_volume',
        9: 'pp_critical_taper',
        10: 'pp_peak_projecting',
        11: 'pp_send_window',
        12: 'pp_graduation_retest',
      },
    },
    {
      id: 'tech',
      name: 'Technique & Movement',
      icon: '🧱',
      description: 'Deliberate practice on sub-maximal terrain.',
      fields: ['sessionVolume'],
      drillsByWeek: {
        1: 'pp_movement_inventory',
        2: 'pp_video_review_day',
        3: 'pp_weakness_drilling_1',
        4: 'pp_weakness_drilling_2',
        5: 'pp_footwork_under_fatigue',
        6: 'pp_silent_feet_hover',
        7: 'pp_body_position_puzzles',
        8: 'pp_deload_style_library',
        9: 'pp_integration_day',
        10: 'pp_flow_projecting_prep',
        11: 'pp_light_maintenance',
        12: 'pp_graduation_assessment',
      },
    },
    {
      id: 'fp',
      name: 'Fingerboard & Armor',
      icon: '✋',
      description: 'No climbing today. Pure structural loading.',
      blocks: [
        {
          id: 'max_hang_protocol',
          name: 'Max Hang Protocol',
          perPhase: {
            [PHASE.build]: {
              rationale:
                'Build Phase (Weeks 1-4): Standard protocol. Half Crimp AND Open Hand for balanced finger strength. 18-20mm edge, 3 min rest between sets. Warm up fully — 5-10 min of progressive hangs — before the working sets. Find the working weight that makes set 4 feel HARD but not a fail.',
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4 per grip',
                  hold: '7-10s',
                  load: 'Bodyweight or light added',
                  rest: '3 min',
                  notes: '18-20mm edge, half crimp and open hand.',
                },
              ],
            },
            [PHASE.intensify]: {
              rationale:
                'Intensify + Deload 1 (Weeks 5-8): Week 5 is DELOAD 1 — cut volume 30-40%, keep intensity (3x7s/grip). Weeks 6-8 are the true Intensify: 5-6 sets per grip, add 2.5-5 lbs when the last set felt solid (not when it felt hard). Strength adaptations happen in the margins.',
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '5-6 per grip (week 5 deload: 3)',
                  hold: '7-10s',
                  load: '+2.5-5 lbs when the last set felt solid',
                  rest: '3 min',
                  notes: '18-20mm edge. Week 5 cuts volume 30-40% but keeps intensity.',
                },
              ],
            },
            [PHASE.peak]: {
              rationale:
                'Peak + Deload 2 + Send (Weeks 9-12): Week 9 is DELOAD 2 — reduce to Build weight, 3x7s/grip. Critical tendon recovery — DO NOT SKIP. Weeks 10-11 are Peak intensity: 4-5 sets at the highest load of the program. Week 12 is the Send taper: 3x7s at Build weight, letting the fingers rest for projecting.',
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4-5 per grip (weeks 9 and 12: 3)',
                  hold: '7-10s',
                  load: 'Peak load, weeks 10-11. Build weight on weeks 9 and 12.',
                  rest: '3 min',
                  notes: 'Week 9 is a mandatory tendon deload — do not skip it.',
                },
              ],
            },
          },
        },
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [PHASE.build]: {
              rationale:
                'Antagonist maintenance. Wide push-ups or DB Press — pick whichever matches your available equipment. Full ROM, controlled tempo. Non-negotiable for shoulder health as pulling demands climb.',
              exercises: [{ name: 'Push-Ups or DB Press', sets: '3', reps: '12' }],
            },
            [PHASE.intensify]: {
              rationale:
                'Same dosage. Intensify phase peaks pulling demands via limit bouldering; your antagonist work must hold steady to keep the shoulder joint balanced. If shoulders feel pinched, add a set rather than changing the exercise.',
              exercises: [{ name: 'Push-Ups or DB Press', sets: '3', reps: '12' }],
            },
            [PHASE.peak]: {
              rationale:
                'Maintenance dose. Peak phase and send taper — this is not the week to progress push work. If fatigue accumulates, drop to 2x12 rather than skipping entirely.',
              exercises: [
                { name: 'Push-Ups or DB Press', sets: '3', reps: '12', notes: 'Drop to 2x12 if fatigue accumulates.' },
              ],
            },
          },
        },
        {
          id: 'shoulder',
          name: 'Shoulder',
          perPhase: {
            [PHASE.build]: {
              rationale:
                'Non-negotiable shoulder health at V8+ level. Band work keeps the rotator cuff and lower trap active; Passive Dead Hangs decompress the shoulder capsule and spine. Light resistance, perfect form — this is insurance, not a workout.',
              exercises: [
                { name: 'Band External Rotations', sets: '3', reps: '15 per arm' },
                { name: 'Band Face Pulls', sets: '3', reps: '15' },
                { name: 'Passive Dead Hangs', sets: '3', hold: '20s' },
              ],
            },
            [PHASE.intensify]: {
              rationale:
                'Same routine. If anything feels tight or pinched during Intensify’s heavy sessions, add a fourth set to the band work. At this grade level, the wear-and-tear is cumulative; one missed week can compound.',
              exercises: [
                { name: 'Band External Rotations', sets: '3-4', reps: '15 per arm' },
                { name: 'Band Face Pulls', sets: '3-4', reps: '15' },
                { name: 'Passive Dead Hangs', sets: '3', hold: '20s' },
              ],
            },
            [PHASE.peak]: {
              rationale:
                'Peak phase. Keep these going every Fingerboard session even when fatigued — they take 10 minutes. The cost of skipping is a shoulder tweak that ends your Send week before it starts.',
              exercises: [
                { name: 'Band External Rotations', sets: '3', reps: '15 per arm' },
                { name: 'Band Face Pulls', sets: '3', reps: '15' },
                { name: 'Passive Dead Hangs', sets: '3', hold: '20s' },
              ],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [PHASE.build]: {
              rationale:
                'Advanced isometric core matches the tension demands of V8-V11 bouldering. Hollow Body is the foundation — lower back pressed into floor. L-Sits build scapular depression and anterior core. Front Lever progressions (tuck → advanced tuck → one-leg → full) build the apex static strength.',
              exercises: [
                { name: 'Hollow Body', sets: '3', hold: '20-30s' },
                { name: 'L-Sits', sets: '3', hold: '10-15s' },
                { name: 'Front Lever Progressions', protocolId: 'front_lever', sets: '3', hold: '5-8s' },
                { name: 'Hanging Leg Raises', sets: '3', reps: '10' },
              ],
            },
            [PHASE.intensify]: {
              rationale:
                'Same stack. If the Front Lever progression advances by Intensify (e.g. tuck → advanced tuck), hold the new position for 3-5s before progressing. Don’t rush — a rock-solid advanced tuck beats a shaky full lever.',
              exercises: [
                { name: 'Hollow Body', sets: '3', hold: '20-30s' },
                { name: 'L-Sits', sets: '3', hold: '10-15s' },
                { name: 'Front Lever Progressions', protocolId: 'front_lever', sets: '3', hold: '5-8s' },
                { name: 'Hanging Leg Raises', sets: '3', reps: '10' },
              ],
            },
            [PHASE.peak]: {
              rationale:
                'Maintenance. Peak phase projecting demands core, but providing it while also grinding new gains is too much load. Hit 2 sets minimum to keep the pattern active, then move on.',
              exercises: [
                { name: 'Hollow Body', sets: '2-3', hold: '20-30s' },
                { name: 'L-Sits', sets: '2-3', hold: '10-15s' },
                { name: 'Front Lever Progressions', protocolId: 'front_lever', sets: '2-3', hold: '5-8s' },
                { name: 'Hanging Leg Raises', sets: '2-3', reps: '10' },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor',
          perPhase: {
            [PHASE.build]: {
              rationale:
                'Forearm and elbow prehab. At V8+ loading, the finger flexors are training like crazy — their antagonists must match. Finger Extensions at 3x20 is guide volume, not optional. Skip and you queue up medial epicondylitis (Golfer’s Elbow).',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '20' },
                { name: 'Hammer Curls', sets: '3', reps: '10' },
              ],
            },
            [PHASE.intensify]: {
              rationale:
                'Same routine every Fingerboard session. The load on wrists and elbows spikes in Intensify; the armor block is what prevents injury during the Peak phase. If elbow tightness sneaks in, bump Hammer Curls to 3x12.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '20' },
                { name: 'Hammer Curls', sets: '3', reps: '10-12' },
              ],
            },
            [PHASE.peak]: {
              rationale:
                'Peak phase armor is non-optional — you’re doing the hardest hangboard of the program. Post-graduation: keep this block in whatever maintenance program comes next. This is the forearm-health base of your entire climbing life.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '20' },
                { name: 'Hammer Curls', sets: '3', reps: '10' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'proj',
      name: 'Projecting & Mental',
      icon: '🎯',
      description: 'Structured projecting. Warm up 30-40 minutes.',
      fields: ['projectName', 'attemptsToday', 'highPoint'],
      drillsByWeek: {
        1: 'pp_project_selection',
        2: 'pp_link_building',
        3: 'pp_top_down_redpointing',
        4: 'pp_deload_session_review',
        5: 'pp_full_redpoint_attempts',
        6: 'pp_mental_game_commitment',
        7: 'pp_conditions_day',
        8: 'pp_deload_strategy_review',
        9: 'pp_deload2_light_session',
        10: 'pp_peak_session_1',
        11: 'pp_send_attempts_quality',
        12: 'pp_final_attempts',
      },
    },
    {
      id: 'rest',
      name: 'Rest / Mobility',
      icon: '🔋',
      description: 'Off day. Prescribed mobility flow.',
      isRest: true,
    },
  ],

  deloadWeeks: [5, 9],

  frequency: '4 days/week. Hard/Easy alternation is mandatory at this level.',
  ordering:
    'Max Intensity and Fingerboard need 48+ hrs between them. Technique day is low-intensity. Projecting day should follow rest.',

  constraints: [
    {
      kind: 'sessions-per-week',
      min: 4,
      max: 5,
      note: '4 training days per week. Hard/easy alternation is mandatory at this level.',
    },
    {
      kind: 'min-gap-hours',
      between: ['perf', 'fp'],
      hours: 48,
      note: 'Max Intensity and Fingerboard need 48+ hours between them.',
    },
    {
      kind: 'min-gap-hours',
      between: ['proj'],
      hours: 48,
      note: 'Projecting days should follow a rest day.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description:
      'As prescribed — Max Intensity, Technique, Fingerboard, Projecting (48h between max and fingerboard).',
    slots: { 1: 'perf', 3: 'tech', 5: 'fp', 6: 'proj' },
  },

  assessments: [
    'max_hang_20mm_7s',
    'weighted_pullup_3rm',
    'max_boulder_grade',
    'flash_grade',
    'max_pushups',
    'front_lever_hold',
    'hollow_body',
  ],

  prerequisites: {
    note: 'Requires Iron Grip graduate-level finger strength — the hangboard loads here assume it.',
    metrics: [{ metricId: 'max_boulder_grade', atLeast: 8 }],
  },

  nextPrograms: [
    {
      id: 'the_cruiser',
      reason: 'Deload and maintain. After a send cycle, Cruiser protects what you built.',
    },
    { id: 'iron_grip', reason: 'If fingers feel like the limiter, cycle back through a focused finger block.' },
    {
      id: 'the_siege',
      reason: 'For sport-curious advanced boulderers — transfer your new power to a 5.13+ project.',
    },
  ],
};
