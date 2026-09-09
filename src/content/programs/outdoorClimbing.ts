/**
 * Outdoor Climbing — logging real rock.
 *
 * A `kind: 'mode'` entry with no blocks or drills at all: five discipline-
 * specific session types whose job is to capture what a day outside
 * actually produces — location, named routes, pitch counts, attempts, and
 * the safety notes each discipline demands.
 */

import type { Program } from '../types';

const ONGOING = 'ongoing';

export const OUTDOOR_CLIMBING: Program = {
  id: 'outdoor_climbing',
  name: 'Outdoor Climbing',
  subtitle: 'Log Real Rock',
  kind: 'mode',
  outdoor: true,
  stage: 'ongoing',
  discipline: 'both',
  gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'All Levels' },
  weeks: 52,
  equipment: ['none'],

  intro: {
    pitch:
      'For days on real rock. Log weekend trips, weeklong expeditions, and one-off crag days — with the fields each discipline actually needs.',
    rhythm: [
      'Log the session at the crag if you can, or same-day from memory. Names and grades fade fast.',
      'Outdoor sends count for more everywhere in the app — they earn a bonus, and named climbs become trackable projects.',
      'Skin recovers on roughly a 48-hour clock between hard sessions on real rock. Plan trips around it.',
      'Check the outdoor guide for projecting tactics, skin management, and safety protocols.',
    ],
    graduation:
      'Nothing to graduate from — this mode runs alongside your training for as long as you climb outside.',
  },

  phases: [
    {
      id: ONGOING,
      name: 'Ongoing',
      weekStart: 1,
      weekEnd: 52,
      description: 'Open-ended logging for every day you spend on real rock.',
      goals: ['Log every outdoor day', 'Record named climbs and locations', 'Track projects across trips'],
    },
  ],

  sessionTypes: [
    {
      id: 'outdoor_boulder',
      name: 'Outdoor Bouldering',
      icon: '🪨',
      description: 'Bouldering on real rock. Brush holds, note texture, pad placement matters.',
      fields: ['location', 'sessionNumber', 'attemptsToday', 'highPoint'],
    },
    {
      id: 'outdoor_sport',
      name: 'Outdoor Sport',
      icon: '🧗',
      description:
        'Sport climbing on real rock. Buddy-check before every lead; note clip stances as part of the beta.',
      fields: ['location', 'sessionNumber', 'attemptsToday', 'highPoint', 'clipStyle'],
    },
    {
      id: 'outdoor_trad',
      name: 'Outdoor Trad',
      icon: '⛰️',
      description:
        'Traditional climbing. Placement quality and pitch count matter more than grade. On-sight ethics: no prior beta.',
      fields: ['location', 'sessionNumber', 'attemptsToday', 'highPoint', 'pitches', 'gearNotes'],
    },
    {
      id: 'outdoor_dws',
      name: 'Deep Water Solo',
      icon: '🌊',
      description: 'Deep water soloing. Check water depth and tide before every session; never solo alone.',
      fields: ['location', 'sessionNumber', 'attemptsToday', 'highPoint', 'waterDepth'],
    },
    {
      id: 'outdoor_alpine',
      name: 'Alpine / Multipitch',
      icon: '🏔️',
      description:
        'Alpine or multipitch. Route-level grade, not pitch-level. Weather window and descent plan before every route.',
      fields: ['location', 'routeName', 'pitches', 'sessionDuration', 'attemptsToday'],
    },
    {
      id: 'rest',
      name: 'Rest / Recovery',
      icon: '🔋',
      description: 'Full rest or light activity. Skin recovers about 48 hours between hard sessions on real rock.',
      isRest: true,
    },
  ],

  frequency:
    'Flexible. Log every day you climb outside — weekend trips, weeklong expeditions, one-off crag days.',
  ordering:
    'Log the session at the crag if you can, or same-day from memory — names and grades fade fast. Check the outdoor guide for projecting tactics, skin management, and safety protocols.',

  constraints: [],

  assessments: [
    'max_boulder_grade',
    'max_sport_grade',
    'max_trad_grade',
    'max_alpine_grade',
    'total_outdoor_days',
  ],

  nextPrograms: [
    {
      id: 'the_siege',
      reason: 'Have an outdoor project you want badly? Siege it across twelve weeks.',
    },
    { id: 'the_cruiser', reason: 'Keep training ticking over between trips.' },
  ],
};
