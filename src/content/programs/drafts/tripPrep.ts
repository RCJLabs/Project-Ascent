/**
 * Trip Prep — 4 weeks before it matters (DRAFT).
 *
 * **This is a draft and is not in the shipped catalogue.** The structure is
 * complete and validates; the training decisions — the taper length, the
 * volume drop, how hard week 3 should be — are a starting point for the
 * coach who owns this app to correct. See PLAN.md M58.
 *
 * **Why it exists.** Every structured program in the catalogue is twelve
 * weeks. A climber with a month before a trip had two options: start a
 * twelve-week block and abandon it two thirds in, or log General Training,
 * which is a container rather than a plan. Since M56 a twelve-week block can
 * at least be compressed — but a compressed twelve-week block is not what
 * four weeks before a trip should look like, because those four weeks are a
 * *taper*, not a training phase, and no amount of remapping turns one into
 * the other.
 *
 * **The shape.** Three weeks of sharpening on the specific demands of the
 * trip, then one week of getting fresh. There is no deload week: the taper is
 * the deload, and putting another one in a four-week block leaves two weeks
 * of work.
 */

import type { Program } from '../../types';

const PHASE = { sharpen: 'sharpen', taper: 'taper' } as const;

export const TRIP_PREP: Program = {
  id: 'trip_prep',
  name: 'Trip Prep',
  subtitle: '4 Weeks Before It Matters',
  kind: 'program',
  stage: 'style',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'All Levels' },
  weeks: 4,
  equipment: ['wall'],
  helpfulEquipment: ['hangboard'],

  intro: {
    pitch:
      'Four weeks to arrive at a trip climbing well and not tired. Not a training block — you cannot get strong in four weeks, and trying is how people arrive injured. This sharpens what you already have and then gets out of the way.',
    rhythm: [
      'Three sessions a week, four if the fourth is easy. Weeks 1-3 sharpen; week 4 tapers.',
      'Everything is specific: if the trip is steep limestone, climb steep; if it is slabby granite, stand on your feet. Generic training is what the twelve-week blocks are for.',
      'Week 4 halves the volume and keeps the intensity. That is what a taper is — you stay sharp by climbing hard briefly, not by resting completely.',
      'Nothing new in week 4. No new edge size, no new exercise, no first attempt at a protocol.',
    ],
    graduation:
      'You arrive able to climb at your grade on day one instead of day four. Natural next: whatever twelve-week block the trip tells you that you need.',
  },

  phases: [
    {
      id: PHASE.sharpen,
      name: 'Sharpen',
      weekStart: 1,
      weekEnd: 3,
      description:
        'Three weeks of specific, hard, short sessions. The climbing looks like the trip: the angle, the hold type, the length of the climbs. Volume stays moderate because there is no time to recover from a big week and no benefit to trying.',
      goals: [
        'Climb at the angle and on the hold type the trip demands',
        'Two hard sessions a week, no more',
        'Rehearse the whole day, not just the moves — pacing, rests, shoes on and off',
        'Finish week 3 tired but not broken',
      ],
    },
    {
      id: PHASE.taper,
      name: 'Taper',
      weekStart: 4,
      weekEnd: 4,
      description:
        'Volume halves; intensity stays. One short hard session, one easy movement session, and then travel. The strength you have is the strength you are taking — this week exists to let you use it.',
      goals: [
        'Halve the volume, keep the intensity',
        'Nothing new: no new edge, no new exercise, no first attempts',
        'Sleep and eat like it is part of the plan, because it is',
        'Arrive fresh',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'proj',
      name: 'Specific Session',
      icon: '🎯',
      description: 'Climbing that looks like the trip. The session that matters.',
      priority: 1,
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'sessionVolume', 'location'],
      blocks: [
        {
          id: 'specific',
          name: 'Specific climbing',
          perPhase: {
            [PHASE.sharpen]: {
              rationale:
                'Pick the angle and hold type the trip demands and climb it hard. Six to eight quality burns with real rest — this is a session about the best attempts, not the number of them. Week 3 is the hardest of the block.',
              exercises: [
                { name: 'Warm-up circuit', sets: '2', reps: '4-6 easy problems or 2 easy routes' },
                { name: 'Specific burns', sets: '6-8', reps: '1 burn each', rest: '4-5 min', notes: 'At or just below your limit, on trip-like terrain.' },
              ],
            },
            [PHASE.taper]: {
              rationale:
                'Half the burns, same intensity. Two or three good attempts on something you know you can do, then stop while it still feels easy. If a burn feels bad, end the session — there is nothing left to gain this week and plenty to lose.',
              exercises: [
                { name: 'Warm-up circuit', sets: '2', reps: '4-6 easy problems or 2 easy routes' },
                { name: 'Specific burns', sets: '2-3', reps: '1 burn each', rest: '5 min', notes: 'On terrain you have already climbed. Stop early.' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'fp',
      name: 'Finger Primer',
      icon: '🤏',
      description: 'Short, sharp, and never the day before a hard climb.',
      priority: 2,
      fields: ['sessionDuration'],
      blocks: [
        {
          id: 'primer',
          name: 'Fingers',
          perPhase: {
            [PHASE.sharpen]: {
              rationale:
                'Maximum recruitment, minimum volume. Short hangs at a load you already know you can hold — this is not the block to find a new maximum. Skip it entirely if your fingers are sore from the specific session.',
              exercises: [
                { name: 'Max Hangs 10s', sets: '4', hold: '10s', load: 'A load you have held before', rest: '3 min' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
              ],
            },
            [PHASE.taper]: {
              rationale:
                'Two sets, same load, and only if week 3 left you feeling good. This exists to keep the fingers awake, not to train them. Nothing new — the taper is the worst possible week to meet a smaller edge.',
              exercises: [
                { name: 'Max Hangs 10s', sets: '2', hold: '10s', load: 'Same as phase 1. Nothing new.', rest: '3 min' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'move',
      name: 'Movement Day',
      icon: '🌤️',
      description: 'Easy climbing that keeps you moving without costing anything.',
      priority: 3,
      fields: ['sessionVolume'],
      blocks: [
        {
          id: 'movement',
          name: 'Easy movement',
          perPhase: {
            [PHASE.sharpen]: {
              rationale:
                'Well below your limit, on varied terrain. Footwork, rests, and the parts of climbing that get worse when you only ever try hard.',
              exercises: [{ name: 'Easy volume', sets: '1', reps: '30-40 minutes', notes: 'Three grades down. Should feel like play.' }],
            },
            [PHASE.taper]: {
              rationale:
                'Shorter and easier again. Twenty minutes of moving, and stop while you want more — that appetite is what you are trying to arrive with.',
              exercises: [{ name: 'Easy volume', sets: '1', reps: '20 minutes', notes: 'Three grades down. Stop early.' }],
            },
          },
        },
      ],
    },
  ],

  deloadWeeks: [],
  frequency: '3 sessions/week, 4 if the fourth is easy. Week 4 is a taper, not a training week.',
  ordering: 'Specific Session first in the week. Finger Primer never the day before it.',
  recommendedLayout: {
    name: 'Recommended',
    description: 'Hard Tuesday, fingers Thursday, easy Saturday.',
    slots: { 2: 'proj', 4: 'fp', 6: 'move' },
  },
  constraints: [
    { kind: 'sessions-per-week', min: 3, max: 4, note: 'Three sessions a week, four only if the fourth is easy.' },
    { kind: 'min-gap-hours', between: ['proj'], hours: 48, note: 'Two days between hard sessions, every week of this block.' },
    { kind: 'not-day-before', sessionTypeId: 'fp', before: 'proj', note: 'Never hang the day before the session that matters.' },
    { kind: 'max-per-week', sessionTypeId: 'proj', count: 2, note: 'Two hard sessions a week at most — four weeks is not long enough to recover from three.' },
  ],
  assessments: ['max_hang_20mm_7s'],
  nextPrograms: [
    { id: 'base_camp', reason: 'After the trip, if it showed you the basics need work.' },
    { id: 'iron_grip', reason: 'After the trip, if it was your fingers that ran out.' },
    { id: 'the_long_game', reason: 'After the trip, if it was your endurance.' },
  ],
};
