/**
 * Two Days a Week — 12-week training for a climber with two sessions (DRAFT).
 *
 * **This is a draft and is not in the shipped catalogue.** The structure is
 * complete and validates; the training decisions in it — the doses, the
 * progression steps, which session survives a one-day week — are a starting
 * point for the coach who owns this app to correct, not a prescription. See
 * PLAN.md M58 for the list of calls that are still open.
 *
 * **Why it exists.** Onboarding asks how many days a week a climber can
 * train and offers two as an answer; the lowest any shipped program asks for
 * is three, so every recommendation a two-day climber got carried "Asks for
 * 3-4 days a week; you have 2". That is the largest group of real climbers —
 * adults with jobs — being told the catalogue is not for them.
 *
 * **The shape it is built on.** Two days cannot carry four session types, so
 * this has two that matter and one that does not: climbing, which is the
 * point, and strength, which is what stops a two-day climber getting weaker
 * between sessions. The third is an optional easy day for a good week, and
 * `priority` says so — drop to one day and the climbing session is what
 * survives.
 */

import type { Program } from '../../types';

const PHASE = { groove: 'groove', build: 'build', sharpen: 'sharpen' } as const;

export const TWO_DAY_WEEK: Program = {
  id: 'two_day_week',
  name: 'Two Days a Week',
  subtitle: '12 Weeks on Two Sessions',
  kind: 'program',
  stage: 'foundations',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'All Levels' },
  weeks: 12,
  equipment: ['wall'],
  helpfulEquipment: ['hangboard', 'gym'],

  intro: {
    pitch:
      'Twelve weeks built for two sessions a week. Not a four-day program with half the days removed — the work is chosen so that two sessions still add up to progress, and the third day is optional rather than assumed.',
    rhythm: [
      'Two committed sessions a week, at least 48 hours apart. A third easy day is optional and never required.',
      'Climb & Apply is the session that matters: it is where the grade moves. Pull & Protect is what keeps the fingers and shoulders able to take it.',
      'If you only get one session in a week, make it Climb & Apply. The app will tell you the same thing.',
      'Phase 1 (Groove) rebuilds consistency. Phase 2 (Build) loads it. Phase 3 (Sharpen) spends it on hard climbing.',
    ],
    graduation:
      'Twelve weeks of two honest sessions beats four weeks of five and eight weeks of none. By the end you should be climbing a grade harder on your consistent day and have a hangboard base worth building on. Natural next: Base Camp if you find four days, or run this again from a higher grade.',
  },

  phases: [
    {
      id: PHASE.groove,
      name: 'Groove',
      weekStart: 1,
      weekEnd: 4,
      description:
        'Four weeks of getting the two sessions to actually happen, at a load your body will not resent. Volume over intensity: the goal of this phase is that week four looks like week one, on the calendar and in your fingers.',
      goals: [
        'Two sessions a week, every week',
        'Rebuild movement volume without soreness that costs the next session',
        'Establish a hangboard baseline, if you have one',
        'Find the grade you can climb repeatably',
      ],
    },
    {
      id: PHASE.build,
      name: 'Build',
      weekStart: 5,
      weekEnd: 8,
      description:
        'The load phase. Climbing gets harder and shorter; the strength session adds a set rather than a session, because there is no room for another day. Week 8 is a deload — the only one, because two-day weeks accumulate fatigue slowly and a second deload would cost a quarter of the program.',
      goals: [
        'Add load to the hangboard, or to the pull if you have no board',
        'Climb closer to your limit on the climbing day',
        'Hold the two-day rhythm through the hardest month',
        'Deload week 8 without stopping',
      ],
    },
    {
      id: PHASE.sharpen,
      name: 'Sharpen',
      weekStart: 9,
      weekEnd: 12,
      description:
        'Spend it. Strength work drops to maintenance and the climbing day gets the whole tank. Four weeks of projecting at the top of your grade, with enough finger work to keep what you built.',
      goals: [
        'Send at the top of your grade on the climbing day',
        'Maintain finger strength on less work',
        'Finish the block fresher than you started it',
        'Know what your two-day ceiling actually is',
      ],
    },
  ],

  sessionTypes: [
    {
      id: 'climb',
      name: 'Climb & Apply',
      icon: '🧗',
      description: 'The session the grade moves on. Warm up properly, then climb hard.',
      // Kept first when a week is short: a two-day program that loses its
      // climbing day is a gym program (PLAN.md M55).
      priority: 1,
      fields: ['hardestGradeAttempted', 'hardestGradeSent', 'sessionVolume'],
      blocks: [
        {
          id: 'climbing',
          name: 'Climbing',
          perPhase: {
            [PHASE.groove]: {
              rationale:
                'Volume at a grade you can repeat. The aim is movement quality and enough climbing that the session is worth the trip — not a redpoint. Stop while you still have one good burn left.',
              exercises: [
                { name: 'Warm-up circuit', sets: '2', reps: '4-6 easy problems or 2 easy routes' },
                { name: 'Working climbs', sets: '8-10', reps: '1 burn each', notes: 'Two grades below your limit. Rest until you want to climb again.' },
              ],
            },
            [PHASE.build]: {
              rationale:
                'Fewer, harder. The volume comes down so the intensity can go up — this is the phase where the grade is supposed to feel uncomfortable. Week 8: halve the working climbs and stay two grades down.',
              exercises: [
                { name: 'Warm-up circuit', sets: '2', reps: '4-6 easy problems or 2 easy routes' },
                { name: 'Limit burns', sets: '5-6', reps: '1 burn each', rest: '4-5 min', notes: 'One grade below your limit, or at it. Week 8 deload: 3 burns, two grades down.' },
              ],
            },
            [PHASE.sharpen]: {
              rationale:
                'Projecting. Pick one or two climbs for the block and spend the session on them, with enough easy climbing either side that you are warm and not wrecked.',
              exercises: [
                { name: 'Warm-up circuit', sets: '2', reps: '4-6 easy problems or 2 easy routes' },
                { name: 'Project burns', sets: '4-6', reps: '1 burn each', rest: '5+ min', notes: 'At your limit. Quality over count — stop when the burns stop improving.' },
                { name: 'Down-climbing volume', sets: '1', reps: '3-4 easy problems', notes: 'Optional, only if the session felt short.' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'str',
      name: 'Pull & Protect',
      icon: '💪',
      description: 'Fingers, pull, and the prehab that keeps both available.',
      priority: 2,
      fields: ['sessionDuration'],
      blocks: [
        {
          id: 'fingers',
          name: 'Fingers',
          perPhase: {
            [PHASE.groove]: {
              rationale:
                'A baseline, not a session. Two grip positions, submaximal, with more rest than feels necessary. If you have no hangboard, replace this with four minutes of easy traversing on the largest holds you can find.',
              exercises: [
                { name: 'Repeaters 7:3', sets: '3', reps: '6 reps per set', hold: '20mm edge', load: 'Bodyweight or assisted', rest: '3 min' },
              ],
            },
            [PHASE.build]: {
              rationale:
                'Add load, not sets — there is no second finger session this week to absorb the extra volume. Progress by weight if you can measure it, by edge depth if you cannot. Week 8: bodyweight only.',
              exercises: [
                { name: 'Repeaters 7:3', sets: '4', reps: '6 reps per set', hold: '20mm edge', load: '+2-5kg, or a smaller edge', rest: '3 min' },
              ],
            },
            [PHASE.sharpen]: {
              rationale:
                'Maintenance. Two sets at the load you reached, kept well short of failure — the climbing day is the stimulus now, and fingers you cannot use on it are wasted.',
              exercises: [
                { name: 'Repeaters 7:3', sets: '2', reps: '6 reps per set', hold: '20mm edge', load: 'Phase 2 load', rest: '3 min' },
              ],
            },
          },
        },
        {
          id: 'pull',
          name: 'Pull',
          perPhase: {
            [PHASE.groove]: {
              rationale:
                'Rebuild the pull with volume you can recover from by the climbing day. Rows matter as much as pull-ups here — a two-day climber is usually short on horizontal pulling, not vertical.',
              exercises: [
                { name: 'Pull-Ups', sets: '3', reps: '5-8', notes: 'Assisted is fine. Stop two short of failure.' },
                { name: 'Inverted Rows', sets: '3', reps: '10' },
              ],
            },
            [PHASE.build]: {
              rationale:
                'Load the pull. Fewer reps, more weight, longer rest. If you have no way to add weight, slow the lowering to five seconds instead. Week 8: two sets, bodyweight.',
              exercises: [
                { name: 'Weighted Pull-Ups', sets: '4', reps: '4-5', load: 'Add weight, or 5s lowering', rest: '3 min' },
                { name: 'Inverted Rows', sets: '3', reps: '10', notes: 'Feet raised.' },
              ],
            },
            [PHASE.sharpen]: {
              rationale:
                'Maintenance again: enough to keep it, not enough to cost you the climbing day. This is the block where the strength session should feel easy.',
              exercises: [
                { name: 'Weighted Pull-Ups', sets: '2', reps: '4-5', load: 'Phase 2 load' },
                { name: 'Inverted Rows', sets: '2', reps: '10' },
              ],
            },
          },
        },
        {
          id: 'protect',
          name: 'Protect',
          constantDose:
            'Prehab is a dose you keep, not one you build — the point is that shoulders and finger extensors stay available every week of the block, and progressing it competes with the work that is meant to progress.',
          perPhase: {
            [PHASE.groove]: {
              rationale:
                'Antagonist and shoulder work, every strength session, for the whole block. Twelve weeks of two sessions is not much climbing volume, which makes it the cheapest possible time to keep this habit.',
              exercises: [
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm', load: 'Light' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
                { name: 'Scapular Pull-Ups', sets: '2', reps: '10' },
              ],
            },
            [PHASE.build]: {
              rationale:
                'Unchanged, on purpose. The load is going up everywhere else this phase; this is the part that keeps the shoulders able to take it.',
              exercises: [
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm', load: 'Light' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
                { name: 'Scapular Pull-Ups', sets: '2', reps: '10' },
              ],
            },
            [PHASE.sharpen]: {
              rationale:
                'Still unchanged. Everything else has dropped to maintenance; this stays exactly where it was.',
              exercises: [
                { name: 'Band External Rotations', sets: '2', reps: '12 per arm', load: 'Light' },
                { name: 'Finger Extensions', sets: '2', reps: '15', load: 'Band or rubber ring' },
                { name: 'Scapular Pull-Ups', sets: '2', reps: '10' },
              ],
            },
          },
        },
      ],
    },
    {
      id: 'easy',
      name: 'Easy Volume',
      icon: '🌤️',
      description: 'An optional third day. Easy climbing, no agenda, nothing measured.',
      priority: 3,
      fields: ['sessionVolume'],
      blocks: [
        {
          id: 'volume',
          name: 'Easy climbing',
          constantDose:
            'This day is deliberately the same all block. It is the session you drop first and add back when life allows, and a dose that changed by phase would make skipping it look like falling behind.',
          perPhase: {
            [PHASE.groove]: {
              rationale: 'Movement, not training. Three grades below your limit, stop before you are tired.',
              exercises: [{ name: 'Easy volume', sets: '1', reps: '30-45 minutes', notes: 'Optional. Never at the cost of the two committed days.' }],
            },
            [PHASE.build]: {
              rationale: 'Same as phase 1. If the two hard days are landing, this is a bonus; if they are not, this is the first thing to go.',
              exercises: [{ name: 'Easy volume', sets: '1', reps: '30-45 minutes', notes: 'Optional. Never at the cost of the two committed days.' }],
            },
            [PHASE.sharpen]: {
              rationale: 'Same again. In the last phase this is also a fine place to work movement on the project without burning a burn.',
              exercises: [{ name: 'Easy volume', sets: '1', reps: '30-45 minutes', notes: 'Optional. Never at the cost of the two committed days.' }],
            },
          },
        },
      ],
    },
  ],

  deloadWeeks: [8],
  frequency: '2 sessions/week, 48 hours apart. A third easy day is optional.',
  ordering: 'Climb & Apply first in the week while you are fresh; Pull & Protect at least two days later.',
  recommendedLayout: {
    name: 'Recommended',
    description: 'Tuesday climbing, Saturday strength — two days apart in both directions.',
    slots: { 2: 'climb', 6: 'str' },
  },
  constraints: [
    { kind: 'sessions-per-week', min: 2, max: 3, note: 'Two committed sessions, and an optional third.' },
    { kind: 'min-gap-hours', between: ['climb', 'str'], hours: 48, note: 'At least two days between the climbing day and the strength day.' },
    { kind: 'max-per-week', sessionTypeId: 'climb', count: 1, note: 'One climbing day a week — this program is built around that being true.' },
  ],
  assessments: ['max_hang_20mm_7s', 'max_pullups', 'core_plank'],
  nextPrograms: [
    { id: 'base_camp', reason: 'If two days becomes four, Base Camp is the same idea with room to breathe.' },
    { id: 'the_cruiser', reason: 'If two days is permanent and you want to stop counting blocks.' },
  ],
};
