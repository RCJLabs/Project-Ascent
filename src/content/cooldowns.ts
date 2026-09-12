/**
 * Cooldown stretches (PLAN.md M112).
 *
 * ## What this is, and what it is not
 *
 * The app already promises this, in exactly one place: step 12 of the
 * starting guide's first-session walkthrough — *"Cool down. Light stretches
 * for shoulders, forearms, and hips. 3-5 minutes. Skip ballistic
 * stretching."* Nothing in the app did it. That line is the whole spec, and
 * the content below does not exceed it.
 *
 * **It is not prehab, and it must not become prehab.** Nine of the programs
 * prescribe antagonist and armor work in real blocks — thirteen of them,
 * with exercises, doses and progressions — and a generator that invented a
 * second set of prehab work would be competing with the program the climber
 * is actually running. Prehab is training. This is five minutes at the end.
 *
 * **It is not rehabilitation.** `returnToClimbing.ts` sets the rule this
 * follows: nothing in this app prescribes an exercise, a dose or a load for
 * an injury. So an injured part is handled the way `warmup.ts` handles one —
 * by leaving out anything that works it — and never by prescribing something
 * *for* it.
 *
 * **It claims nothing.** Not that it prevents injury, not that it speeds
 * recovery, not that it improves anything. The copy says what it is: the
 * five minutes the app's own guide already asked for.
 *
 * ## The content itself
 *
 * **COACH: this is a starter set, written to the guide's own words and
 * deliberately conservative — static, light, nothing ballistic, nothing
 * loaded, nothing that reads as treatment. Twelve items is enough to
 * exercise the funnel and fill five minutes; it is not a considered
 * coaching syllabus, and the wording of every line is yours to replace.**
 */

import type { BodyPart } from './warmups';

export interface CooldownExercise {
  id: string;
  name: string;
  /** One line, in the climber's hands, not a clinician's. */
  description: string;
  seconds: number;
  /**
   * The tissue this actually works.
   *
   * One field, doing both jobs, because for a stretch they are the same
   * question: the part it eases after a session that loaded it is the part
   * it should stay away from when that part is hurt. A separate `unloads`
   * would be a field with no reading that differs from this one.
   */
  targets: BodyPart[];
}

export const COOLDOWN_EXERCISES: CooldownExercise[] = [
  {
    id: 'forearm-flexor',
    name: 'Forearm flexor stretch',
    description:
      'Arm straight out, palm up, gently pull the fingers back with the other hand. Ease into it — you want a long stretch, not a sharp one. Swap sides.',
    seconds: 60,
    targets: ['fingers', 'wrist', 'elbow'],
  },
  {
    id: 'forearm-extensor',
    name: 'Forearm extensor stretch',
    description:
      'Same arm position, palm down, gently press the back of the hand toward you. The other side of the forearm, which climbing rarely lengthens on its own. Swap sides.',
    seconds: 60,
    targets: ['wrist', 'elbow'],
  },
  {
    id: 'finger-spread',
    name: 'Open-hand spread',
    description:
      'Spread the fingers wide, hold, then relax. Ten slow repetitions. After a session of closed grips this is the opposite shape.',
    seconds: 40,
    targets: ['fingers'],
  },
  {
    id: 'doorway-pec',
    name: 'Doorway chest opener',
    description:
      'Forearm on a door frame at shoulder height, step through gently until you feel it across the chest. Shoulders stay down. Swap sides.',
    seconds: 60,
    targets: ['shoulder'],
  },
  {
    id: 'cross-body-shoulder',
    name: 'Cross-body shoulder stretch',
    description:
      'Arm across the chest, other hand at the elbow, draw it in slowly. Stop well before anything pinches. Swap sides.',
    seconds: 45,
    targets: ['shoulder'],
  },
  {
    id: 'overhead-tricep',
    name: 'Overhead triceps stretch',
    description:
      'Hand behind the neck, other hand at the elbow, ease it back. Ribs stay down rather than flaring. Swap sides.',
    seconds: 45,
    targets: ['shoulder', 'elbow'],
  },
  {
    id: 'lat-hang',
    name: 'Passive hang or lat stretch',
    description:
      'A relaxed hang from a jug, feet supported, shoulders loose — or the same shape kneeling with hands on a bench. Breathe out and let it lengthen.',
    seconds: 60,
    targets: ['shoulder', 'back'],
  },
  {
    id: 'child-pose',
    name: "Child's pose",
    description:
      'Knees wide, hips back to the heels, arms long in front. Let the back round out. This is the one to stay in if you only do one.',
    seconds: 60,
    targets: ['back', 'shoulder', 'hip'],
  },
  {
    id: 'thread-needle',
    name: 'Thread the needle',
    description:
      'On all fours, slide one arm under the other and rest the shoulder down. A rotation for the upper back, which holds a lot after overhangs. Swap sides.',
    seconds: 50,
    targets: ['back', 'shoulder'],
  },
  {
    id: 'pigeon',
    name: 'Figure-four or pigeon',
    description:
      'Lying on your back with one ankle across the opposite knee, or the same shape on the floor if it is comfortable. Deep in the hip. Swap sides.',
    seconds: 60,
    targets: ['hip'],
  },
  {
    id: 'hip-flexor',
    name: 'Half-kneeling hip flexor',
    description:
      'One knee down, tuck the pelvis under and shift forward a little. High steps and heel hooks shorten this side. Swap sides.',
    seconds: 50,
    targets: ['hip', 'knee'],
  },
  {
    id: 'calf-ankle',
    name: 'Calf and ankle',
    description:
      'Hands on a wall, back leg straight, heel down. Then circle each ankle slowly. Small holds and down-climbing both go through here.',
    seconds: 45,
    targets: ['ankle', 'knee'],
  },
];

export function getCooldownExercise(id: string): CooldownExercise | undefined {
  return COOLDOWN_EXERCISES.find((e) => e.id === id);
}
