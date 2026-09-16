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
 * Written to the guide's own words and deliberately conservative — static,
 * light, nothing ballistic, nothing loaded, nothing that reads as
 * treatment. It went to the coach as a starter set and came back with all
 * twelve kept and two lines changed, both of them places the content broke
 * the rules stated above: the lat stretch was the one *loaded* item, and
 * Child's pose claimed a priority the generator's own weighting decides.
 * Each is noted where it sits (PLAN.md, coaching call 9).
 */

import type { BodyPart } from './bodyParts';

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
    targets: ['fingers', 'pulley', 'hand', 'forearm', 'wrist', 'elbow'],
  },
  {
    id: 'forearm-extensor',
    name: 'Forearm extensor stretch',
    description:
      'Same arm position, palm down, gently press the back of the hand toward you. The other side of the forearm, which climbing rarely lengthens on its own. Swap sides.',
    seconds: 60,
    targets: ['wrist', 'hand', 'forearm', 'elbow'],
  },
  {
    id: 'finger-spread',
    name: 'Open-hand spread',
    description:
      'Spread the fingers wide, hold, then relax. Ten slow repetitions. After a session of closed grips this is the opposite shape.',
    seconds: 40,
    targets: ['fingers', 'pulley', 'hand'],
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
    // Was "Passive hang or lat stretch", and the hang came out at the
    // coaching review. Not because hanging is harmful — a relaxed hang from
    // a jug with the feet supported is a normal way to decompress a
    // shoulder — but because this file's own rule three paragraphs up is
    // "nothing loaded", and it was the one item breaking it, on fingers that
    // have just finished a session. The kneeling version is the same shape
    // with the fingers left out.
    id: 'lat-hang',
    name: 'Kneeling lat stretch',
    description:
      'Kneel with the hands on a bench or the arm of a sofa, hips back toward the heels, chest sinking between the arms. Breathe out and let it lengthen.',
    seconds: 60,
    targets: ['shoulder', 'lat', 'back'],
  },
  {
    id: 'child-pose',
    name: "Child's pose",
    description:
      'Knees wide, hips back to the heels, arms long in front. Let the back round out. Nothing to pull against here — it is a shape to settle into.',
    seconds: 60,
    targets: ['back', 'shoulder', 'lat', 'hip'],
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
    targets: ['hip', 'groin'],
  },
  {
    id: 'hip-flexor',
    name: 'Half-kneeling hip flexor',
    description:
      'One knee down, tuck the pelvis under and shift forward a little. High steps and heel hooks shorten this side. Swap sides.',
    seconds: 50,
    targets: ['hip', 'groin', 'knee'],
  },
  // Three M223 added, for parts the list had nothing for at all. A cooldown
  // is what a hurt part is kept *away* from as well as what eases it after
  // a session, so a part with none was a part the app could not protect.
  {
    id: 'neck-trap',
    name: 'Neck and upper trap',
    description:
      'Sit tall, ease one ear toward the shoulder and let the other arm rest heavy at your side. An afternoon of belaying lives here. Swap sides.',
    seconds: 40,
    targets: ['neck', 'shoulder'],
  },
  {
    id: 'side-body',
    name: 'Side body opener',
    description:
      'Reach one arm overhead and lean away from it, breathing into the ribs on the long side. Hard lock-offs and deep crimping load this. Swap sides.',
    seconds: 45,
    targets: ['rib', 'lat', 'shoulder'],
  },
  {
    id: 'hamstring-hinge',
    name: 'Hamstring hinge',
    description:
      'One heel forward, hinge from the hip with a long back until you feel it behind the thigh. Every heel hook of the session goes through here. Swap sides.',
    seconds: 50,
    targets: ['hamstring', 'back'],
  },
  {
    id: 'calf-ankle',
    name: 'Calf and ankle',
    description:
      'Hands on a wall, back leg straight, heel down. Then circle each ankle slowly. Small holds and down-climbing both go through here.',
    seconds: 45,
    targets: ['ankle', 'achilles', 'foot', 'knee'],
  },
];
