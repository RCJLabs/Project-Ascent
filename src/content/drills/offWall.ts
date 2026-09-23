import type { Drill } from '../types';

/**
 * The drills for a day you are not on a wall (PLAN.md M132).
 *
 * Every one of the 144 drills the library shipped with declares `equipment:
 * ['wall']`, and that is not an oversight — it is what the library *is*.
 * Drills were extracted from the seven programs that schedule them, those
 * programs prescribe climbing, and `filterDrills` hides anything the climber
 * cannot equip. So a climber with no wall listed opened the library to
 * nothing at all, and `novelStimulus` walked its whole preference order and
 * fell out of the bottom into a generic sentence.
 *
 * The twenty-three drills filed under *recovery* look like they should cover
 * this and do not. Read them: "climb 30 min at RPE 5", "5-6 easy problems",
 * "20-25 moderate boulders". They are deload *sessions*, correctly tagged,
 * and no amount of retagging produces a single thing to do on a Tuesday when
 * the gym is shut, the finger is sore, or the trip has no rock in it.
 *
 * **These belong to no program, which is new.** `sources` has meant "the
 * programs this was extracted from" and every drill had at least one; a
 * drill with an empty `sources` is one the library offers on its own, and
 * the catalogue test now says so rather than calling it an orphan. It is
 * also why M132 had to build a way to *choose* a drill: a library-only drill
 * that nothing prescribes is unreachable otherwise.
 *
 * They are deliberately short. The day this is for is a day with something
 * wrong with it — a closed gym, a tweaked pulley, a hotel room — and a
 * forty-minute prescription on that day gets read and not done.
 */
export const OFF_WALL_DRILLS: Drill[] = [
  {
    id: 'off_shoulder_cars',
    name: 'Shoulder CARs',
    duration: '10 min',
    focus: 'Shoulder Range',
    loads: ['shoulder'],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_wrist_forearm_prep',
    name: 'Wrist and Forearm Prep',
    duration: '8-10 min',
    focus: 'Wrist Health',
    loads: ['fingers', 'forearm'],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_ninety_ninety_hips',
    name: '90/90 Hip Switches',
    duration: '10-12 min',
    focus: 'Hip Rotation',
    loads: ['hip'],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_thoracic_opening',
    name: 'Thoracic Opening',
    duration: '8 min',
    focus: 'Upper Back Mobility',
    loads: ['shoulder'],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_extensor_work',
    name: 'Extensor Work',
    duration: '10 min',
    focus: 'Elbow Health',
    loads: ['forearm'],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_skin_repair',
    name: 'Skin Repair',
    duration: '10 min',
    focus: 'Skin Management',
    loads: [],
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_easy_aerobic',
    name: 'Easy Aerobic Hour',
    duration: '30-60 min',
    focus: 'Aerobic Base',
    loads: [],
    category: 'endurance',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_tension_holds',
    name: 'Hollow and Arch Holds',
    duration: '12-15 min',
    focus: 'Body Tension',
    loads: ['shoulder'],
    category: 'power',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_sequence_rehearsal',
    name: 'Sequence Rehearsal',
    duration: '10-15 min',
    focus: 'Movement Memory',
    loads: [],
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_box_breathing',
    name: 'Box Breathing',
    duration: '10 min',
    focus: 'Arousal Control',
    loads: [],
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_rehearsing_the_fall',
    name: 'Rehearsing the Fall',
    duration: '10 min',
    focus: 'Fear Management',
    loads: [],
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_ten_minute_debrief',
    name: 'The Ten-Minute Debrief',
    duration: '10 min',
    focus: 'Session Review',
    loads: [],
    category: 'strategy',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
];
