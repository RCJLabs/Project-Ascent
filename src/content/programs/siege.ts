/**
 * The Siege — 12-week advanced sport (5.12d-5.13d).
 *
 * A single project, decoded, linked, and sent across twelve weeks. This is
 * the program whose entry requirements the prototype could only state in
 * prose ("Recommended prereq: Iron Grip completion or Max Hang 20mm 7s at
 * BW+30% and a confirmed 5.12c onsight or 5.12d redpoint"), so nothing
 * could check them. Here they are data the finder can test against the
 * climber's own assessment history.
 */

import type { Program } from '../types';

const PHASE = { decode: 'decode', link: 'link', send: 'send' } as const;

export const THE_SIEGE: Program = {
  id: 'the_siege',
  name: 'The Siege',
  subtitle: '12-Week Advanced Sport',
  kind: 'program',
  stage: 'advanced',
  discipline: 'sport',
  gradeRange: { scale: 'YDS', min: '5.12d', max: '5.13d', label: '5.12d-5.13d' },
  weeks: 12,
  equipment: ['wall', 'hangboard', 'gym'],

  intro: {
    pitch:
      'A 12-week siege of one hard sport project. Three phases — decode the moves, link the sections, send the route — with power-endurance and fingerboard work built around the project rather than competing with it.',
    rhythm: [
      '4 sessions per week, with hard/easy alternation treated as mandatory. Never two hard climbing days back to back.',
      'Project Session goes first, when you are fresh. Power-Endurance lands 48 hours after it. Fingerboard and structural work goes on a non-climbing day.',
      'Phase 1 (Decode) is about knowing exactly what every move demands. Phase 2 (Link) chains sections until the crux goes with pump in the forearms. Phase 3 (Send) tapers everything and points it at a send window.',
      'Skin is a training variable at this grade. Tape splits early, and end sessions while your fingers still feel crisp.',
    ],
    graduation:
      'By week 12 you will have sent — or you will have a one-hang and a bank of beta for the next cycle, which is also a result. Next: a Cruiser block to recover and maintain, or build a custom program aimed at your next project.',
  },

  phases: [
    {
      id: PHASE.decode,
      name: 'Decode',
      weekStart: 1,
      weekEnd: 4,
      description:
        'The Decode phase is about information, not fitness. You choose the project, work it move by move, and hunt the micro-beta — the thumb catch, the heel that turns a campus move into a reach, the knee bar that becomes a rest. By the end of this phase the sequence should feel close to final, even if you cannot link any of it yet.',
      goals: [
        'Choose a project that is hard but decodable',
        'Establish repeatable beta for every individual move',
        'Find and rehearse every rest and shake-out on the route',
        'Rebuild max finger strength on the 20mm edge',
      ],
    },
    {
      id: PHASE.link,
      name: 'Link',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The Link phase turns known moves into chains. Sections grow from five moves to half the route, and the crux has to go with pump already in the forearms rather than fresh. The power-endurance work running in parallel is what makes that possible.',
      goals: [
        'Chain the route into three or four reliable sections',
        'Execute the crux linked into, not just fresh',
        'Build power endurance through doubles and triples',
        'Shift finger work from heavy loads to small edges',
      ],
    },
    {
      id: PHASE.send,
      name: 'Send',
      weekStart: 9,
      weekEnd: 12,
      description:
        'The Send phase is subtraction. Volume drops, rest between burns grows, and every session is a real attempt in the best conditions you can find. You are no longer learning the route — you are removing the reasons you might fall off it.',
      goals: [
        'Run full redpoint burns from the ground',
        'Reach a one-hang, the strongest predictor of the send',
        'Optimise conditions, warm-up, and clipping stances',
        'Send the project',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'proj',
      name: 'Project Session',
      icon: '🎯',
      description: 'Siege work on your chosen project. Structure shifts with the phase.',
      fields: ['projectName', 'attemptsToday', 'highPoint'],
      drillsByWeek: {
        1: 'sg_project_selection_recon',
        2: 'sg_move_by_move_decoding',
        3: 'sg_beta_refinement_rests',
        4: 'sg_first_links_checkpoint',
        5: 'sg_section_links_doubles',
        6: 'sg_extend_links_crux',
        7: 'sg_bottom_to_crux',
        8: 'sg_longest_links_reassess',
        9: 'sg_full_redpoint_burns',
        10: 'sg_first_one_hang',
        11: 'sg_refine_dont_rehearse',
        12: 'sg_send_window',
      },
    },
    {
      id: 'pe',
      name: 'Power-Endurance',
      icon: '🔥',
      description: 'Rope-specific capacity: linked laps and burst power-endurance.',
      fields: ['routesCompleted', 'pumpLevel'],
      drillsByWeek: {
        1: 'sg_capacity_laps_arc',
        2: 'sg_arc_volume_build',
        3: 'sg_arc_light_intervals',
        4: 'sg_capacity_consolidation',
        5: 'sg_rope_links_doubles',
        6: 'sg_doubles_added_volume',
        7: 'sg_rope_links_triples',
        8: 'sg_triples_peak_volume',
        9: 'sg_redpoint_bursts',
        10: 'sg_burst_intensity',
        11: 'sg_taper_begins',
        12: 'sg_send_support',
      },
    },
    {
      id: 'fp',
      name: 'Fingerboard + Structural',
      icon: '✋',
      description: 'No climbing. The finger protocol shifts by phase; supporting strength is maintained.',
      blocks: [
        {
          id: 'finger_protocol',
          name: 'Finger Protocol',
          perPhase: {
            [PHASE.decode]: {
              rationale:
                'Phase 1 (Decode): Max Hangs at bodyweight-plus on the 20mm edge. Rebuild any strength lost from a deload. Warm up thoroughly with a hang ladder from 30mm down to 20mm at low intensity before your top set. Progression: add 2-5lbs per week when the last set felt solid — not when it felt hard.',
              exercises: [
                {
                  name: 'Max Hangs',
                  protocolId: 'max_hangs_10s',
                  sets: '4',
                  hold: '7-10s',
                  load: '85-90% on a 20mm edge',
                  rest: '3 min',
                  notes: 'Warm up with a hang ladder from 30mm down to 20mm first.',
                },
              ],
            },
            [PHASE.link]: {
              rationale:
                'Phase 2 (Link): Min-Edge Hangs. Keep load at bodyweight; make the EDGE smaller instead. Start at 15mm. If you can hang 7s with good form, drop to 14mm next session. This phase trains the specific finger strength hard sport routes demand — small crimps, not heavy loads on big edges. Target: down to 10-12mm with clean form by Week 8.',
              exercises: [
                {
                  name: 'Min-Edge Hangs',
                  protocolId: 'min_edge_hangs',
                  sets: '4',
                  hold: '7s',
                  load: 'Bodyweight',
                  rest: '3 min',
                  notes: 'Start at 15mm and shrink the edge, never add load. Target 10-12mm by week 8.',
                },
              ],
            },
            [PHASE.send]: {
              rationale:
                'Phase 3 (Send): Maintenance only. 3 sets on the 20mm edge at 80% of training max. You’re not building finger strength in this phase — you’re preserving what you built and sparing the fingers for the project. Skip this session entirely in Week 12 if you’re deep in send attempts.',
              exercises: [
                {
                  name: 'Max Hangs (maintenance)',
                  protocolId: 'max_hangs_10s',
                  sets: '3',
                  hold: '7s',
                  load: '80% of training max, 20mm',
                  rest: '3 min',
                  notes: 'Skippable in week 12 if you are deep in send attempts.',
                },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.decode]: {
              rationale:
                'Progressive pulling. Phase 1 builds max strength with heavy weighted pull-ups — the base the later phases maintain rather than extend.',
              exercises: [{ name: 'Weighted Pull-Ups', sets: '4', reps: '5', load: '3-5RM' }],
            },
            [PHASE.link]: {
              rationale:
                'Phase 2 shifts to lock-off isometrics — sport climbers need to hold tension at rest positions and clipping stances more than they need raw pulling speed.',
              exercises: [
                { name: '1-Arm Lock-Off Holds', protocolId: 'offset_lock_offs', sets: '3', hold: '5s per arm at 90°' },
              ],
            },
            [PHASE.send]: {
              rationale: 'Phase 3 is maintenance so the project gets your energy.',
              exercises: [{ name: 'Strict Pull-Ups', sets: '3', reps: '6-8' }],
            },
          },
        },
        {
          id: 'push',
          name: 'Push',
          perPhase: {
            [PHASE.decode]: {
              rationale:
                'Antagonist work. Keeps the shoulders healthy under heavy pulling and hangboard loading.',
              exercises: [{ name: 'Dips or Weighted Push-Ups', sets: '3', reps: '6-10 dips, or 8-10 push-ups' }],
            },
            [PHASE.link]: {
              rationale:
                'Phase 2’s overhead press specifically strengthens the overhead lock-off position you’ll need on vertical and slightly overhanging terrain.',
              exercises: [{ name: 'DB Overhead Press', sets: '3', reps: '8-10' }],
            },
            [PHASE.send]: {
              rationale: 'Maintenance dose through the send phase — present, but never a source of fatigue.',
              exercises: [{ name: 'Push-Ups', sets: '3', reps: '12' }],
            },
          },
        },
        {
          id: 'core',
          name: 'Core',
          perPhase: {
            [PHASE.decode]: {
              rationale:
                'Advanced isometric core for the tension demands of overhanging sport terrain. Phase 1 builds baseline hanging core capacity.',
              exercises: [
                { name: 'Front Lever Progressions', protocolId: 'front_lever', sets: '5', hold: '5-10s' },
                { name: 'Hanging Leg Raises', sets: '3', reps: '8-10' },
              ],
            },
            [PHASE.link]: {
              rationale:
                'Phase 2 peaks with tucked front lever holds and dynamic windshield wipers — the hardest core work of the program.',
              exercises: [
                { name: 'Front Lever Tuck Holds', protocolId: 'front_lever', sets: '5', hold: '10s' },
                { name: 'Hanging Windshield Wipers', sets: '3', reps: '6 per side' },
              ],
            },
            [PHASE.send]: {
              rationale: 'Phase 3 drops to maintenance — save the intensity for the project.',
              exercises: [
                { name: 'L-Sit', sets: '3', hold: '15-20s' },
                { name: 'Hanging Knee Raises', sets: '3', reps: '10' },
              ],
            },
          },
        },
        {
          id: 'armor',
          name: 'Armor',
          perPhase: {
            [PHASE.decode]: {
              rationale:
                'Non-negotiable prehab. Heavy finger loading plus heavy pulling plus long projecting sessions demand balanced tissue everywhere. Skip these sets at your own injury risk — A2 pulleys, elbow tendons, and rotator cuffs are the most common 5.13 casualties.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
                { name: 'Hammer Curls', sets: '3', reps: '12' },
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
                { name: 'Face Pulls', sets: '2', reps: '15' },
              ],
            },
            [PHASE.link]: {
              rationale:
                'Same routine, every structural session. The linking block stacks pump on top of heavy hangs — this is the tissue that keeps up with it.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
                { name: 'Hammer Curls', sets: '3', reps: '12' },
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
                { name: 'Face Pulls', sets: '2', reps: '15' },
              ],
            },
            [PHASE.send]: {
              rationale:
                'The one block that never scales back. An A2 tweak in week 11 ends the cycle; ten minutes of armor work prevents it.',
              exercises: [
                { name: 'Wrist Extensor Curls', sets: '3', reps: '15' },
                { name: 'Finger Extensions', sets: '3', reps: '15' },
                { name: 'Hammer Curls', sets: '3', reps: '12' },
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm' },
                { name: 'Face Pulls', sets: '2', reps: '15' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'rest',
      name: 'Rest / Mobility',
      icon: '🔋',
      description: 'Off day. Mobility flow, foam rolling, and sleep.',
      isRest: true,
    },
  ],

  // Both close a phase. Week 11 used to stand here in place of week 8,
  // against a guide whose week 8 is explicitly a half-volume week and whose
  // week 11 is a refining week with no backing off in it (PLAN.md M34).
  deloadWeeks: [4, 8],

  frequency: '4 sessions/week. Hard/Easy alternation is mandatory.',
  ordering:
    'Project Session when fresh. Power-Endurance 48hrs after Project. Fingerboard + Structural on a non-climbing day. Never two hard climbing days back-to-back.',

  constraints: [
    {
      kind: 'sessions-per-week',
      min: 4,
      max: 4,
      note: 'Four sessions per week. Hard/easy alternation is mandatory.',
    },
    {
      kind: 'min-gap-hours',
      between: ['proj', 'pe'],
      hours: 48,
      note: 'Power-Endurance lands 48 hours after the Project session — never two hard climbing days back to back.',
    },
    {
      kind: 'order-in-week',
      first: 'proj',
      then: 'pe',
      note: 'Project Session goes first in the week, when you are fresh.',
    },
  ],

  recommendedLayout: {
    name: 'Recommended',
    description: 'As prescribed — Project, Fingerboard, Power-Endurance, Project.',
    slots: { 1: 'proj', 2: 'fp', 4: 'pe', 6: 'proj' },
  },

  assessments: [
    'max_hang_20mm_7s',
    'min_edge',
    'redpoint_grade',
    'project_high_point',
    'linked_laps_continuous',
    'max_pullups',
  ],

  prerequisites: {
    note: 'Iron Grip completion, or a 20mm max hang at bodyweight +30% plus a confirmed 5.12c on-sight or 5.12d redpoint.',
    metrics: [{ metricId: 'redpoint_grade', atLeast: 17 }],
  },

  nextPrograms: [
    {
      id: 'the_cruiser',
      reason: 'Deload and maintain between send cycles. The Cruiser keeps fingers sharp without grinding.',
    },
    {
      id: 'the_long_game',
      reason: 'Rebuild the aerobic base before the next siege — a fresh engine makes the next project cheaper.',
    },
  ],
};
