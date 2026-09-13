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
    description:
      'Controlled articular rotations: one shoulder at a time, tracing the largest circle the joint will make, slowly enough that it takes twenty seconds to get round once. Keep the ribs down and the other side still — the point is the shoulder moving alone, not the body helping it. Five each side. Climbers lose overhead range first and notice it last, usually as a shoulder that complains on a high gaston.',
    duration: '10 min',
    focus: 'Shoulder Range',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_wrist_forearm_prep',
    name: 'Wrist and Forearm Prep',
    description:
      'On all fours: fingers forward and rock back, fingers back and rock forward, then palms up and rock. Thirty seconds each, breathing, never into sharp pain. Finish with slow wrist circles under a little load. The forearm flexors that crimp also cross the wrist, and a wrist that has lost extension range turns every mantel and every press into an argument.',
    duration: '8-10 min',
    focus: 'Wrist Health',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_ninety_ninety_hips',
    name: '90/90 Hip Switches',
    description:
      'Sit with both knees bent at ninety degrees, one leg in front and one out to the side. Lift both knees and switch sides without using your hands, keeping the chest tall. Ten switches, rest, ten more. Then hold the front-leg position and lean over the shin for thirty seconds a side. Every high step, drop knee and heel hook is bought with hip rotation, and it is the range that goes first in anyone who sits down for a living.',
    duration: '10-12 min',
    focus: 'Hip Rotation',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_thoracic_opening',
    name: 'Thoracic Opening',
    description:
      'Side-lying windmill: knees stacked on the floor in front of you, top arm tracing a slow arc from one side to the other, eyes following the hand. Eight a side, pausing wherever it catches. Then thread the needle, eight a side. A stiff upper back sends the work to the shoulder and the lower back instead, which is why the fix for a sore shoulder is often not the shoulder.',
    duration: '8 min',
    focus: 'Upper Back Mobility',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_extensor_work',
    name: 'Extensor Work',
    description:
      'Open the fingers against resistance — a rubber ring, an elastic band around the fingertips, or a hand pushed open into sand or rice. Three sets of twenty, slow out and slower back, until the back of the forearm is warm and mildly pumped. The flexors get trained every session and the extensors get trained never, and the imbalance is where medial and lateral elbow pain comes from. Ten minutes, one to three times a week, is the whole prescription.',
    duration: '10 min',
    focus: 'Elbow Health',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_skin_repair',
    name: 'Skin Repair',
    description:
      'File the high spots flat while the skin is dry — not to bare pink, just until the surface is level and there is no lip on a flapper to catch. Then moisturise lightly and leave it alone. Repeat before bed. Skin is the one tissue that limits back-to-back days on rock and the only one that repairs on a schedule you can actually change.',
    duration: '10 min',
    focus: 'Skin Management',
    category: 'recovery',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_easy_aerobic',
    name: 'Easy Aerobic Hour',
    description:
      'Thirty to sixty minutes of walking, cycling or swimming at a pace you could hold a conversation through. Not intervals, not a workout — this is the pace that moves blood through tissue that spent the week under load and then sat still. It costs a climbing session nothing and it is the cheapest thing in the app for how you feel two days later.',
    duration: '30-60 min',
    focus: 'Aerobic Base',
    category: 'endurance',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_tension_holds',
    name: 'Hollow and Arch Holds',
    description:
      'On your back, arms overhead, lower back pressed flat, shoulders and legs just off the floor — hold until the position breaks, not until a timer says so. Rest a minute, roll over, and hold the arch. Three of each. The tension you cannot hold on the floor is tension you will not find on an overhang, and the failure point is always the position going soft rather than the muscle giving out.',
    duration: '12-15 min',
    focus: 'Body Tension',
    category: 'power',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_sequence_rehearsal',
    name: 'Sequence Rehearsal',
    description:
      'Sit somewhere quiet and run your project move by move, in real time, from the ground to the chains or the top-out. Hands, feet, where you breathe, where you shake. When it goes fuzzy, that is the section you do not actually know — write it down and work it next session. Rehearsed sequences execute faster and cost less, and the fuzzy patch is worth more than the rehearsal.',
    duration: '10-15 min',
    focus: 'Movement Memory',
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_box_breathing',
    name: 'Box Breathing',
    description:
      'In for four, hold for four, out for four, hold for four. Ten rounds, nose only, sitting up. Then ten more while thinking about the move that frightens you. The second half is the drill: a nervous system that can be brought down deliberately in a quiet room can be brought down at a clip, and the skill does not arrive the first time you need it.',
    duration: '10 min',
    focus: 'Arousal Control',
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_rehearsing_the_fall',
    name: 'Rehearsing the Fall',
    description:
      'Picture the fall you are most afraid of, in detail, until it stops producing a jolt — the moment of letting go, the air, the rope coming tight or the mat arriving. Ten times, slowly, stopping if it stays sharp. This is not a substitute for practising falls for real; it is what makes the first real one survivable enough to start. If it will not settle at all, that is worth a conversation with a coach rather than another rep.',
    duration: '10 min',
    focus: 'Fear Management',
    category: 'mental',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
  {
    id: 'off_ten_minute_debrief',
    name: 'The Ten-Minute Debrief',
    description:
      'Write down three things from the last session: what actually limited you, one decision you would take back, and the single thing to do differently next time. Ten minutes, in the notes field or on paper. Most climbers repeat the same session for months because nothing ever gets named — and a named limiter is the difference between training and attendance.',
    duration: '10 min',
    focus: 'Session Review',
    category: 'strategy',
    discipline: 'both',
    level: 'Any grade',
    equipment: ['none'],
    sources: [],
  },
];
