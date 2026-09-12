/**
 * What a coach says while you are on the wall (PLAN.md M107b).
 *
 * ## Why this is a side table rather than two fields on `Drill`
 *
 * It was two fields on `Drill` first, which is where the milestone proposed
 * them and where they obviously belong. Then the budget test failed.
 *
 * `content/drills/index.ts` is entry-chunk by construction: `derive`,
 * `plan`, `challenges` and `plateau` all call `getDrill` synchronously, so
 * all 144 descriptions load on every cold start. Anything added to a `Drill`
 * loads with them. **Measured**: twelve drills coached cost **1.58KB**
 * gzipped (218.71 → 220.29), and all 144 cost **7.58KB** (218.71 → 226.29,
 * with distinct wording per drill — the same test with one repeated cue
 * everywhere reads 222.28, because gzip flattens the repetition and a real
 * library has none to flatten).
 *
 * Nothing on that boot path reads a cue. `derive`, `challenges` and
 * `plateau` read `category`; `plan` carries the whole drill into a day's
 * plan but the week view renders its name. The only reader is
 * `/drills/:id`, which is a lazy route. So the coaching lives here and
 * loads with the page that shows it — the same split M112 made for the
 * cooldown stretches and M110 made for the demo flag, for the same reason
 * and at five times the size.
 *
 * ## What it costs to keep them apart
 *
 * Cohesion. A cue is no longer beside the drill it coaches, so the two can
 * drift — a renamed drill id leaves its coaching orphaned, and `DrillId` is
 * `string`, so the compiler will not catch it. `drillCoaching.test.ts`
 * catches it instead: every key here must be a drill that exists.
 *
 * ## What a cue is, and what a fault is
 *
 * A **cue** is a short imperative you can say between two moves. The
 * drill's `description` already says what the drill *is*; a cue is what you
 * say to someone doing it wrong in front of you, and it is short because it
 * has to land while they are still moving.
 *
 * A **fault** is not a cue inverted. "Keep the heel down" is a cue; "the
 * heel creeps up over the first two moves and you never feel it happen" is
 * the fault, and a climber reads it to find out whether they are the person
 * it describes. Faults are allowed to run longer, because being
 * recognisable from the outside takes more words than an instruction does.
 *
 * **COACH: twelve of 144 are written, from Base Camp, and they are a first
 * pass rather than a syllabus — the wording of every line is yours to
 * replace, and the remaining 132 are yours to write or to delegate. The
 * count is held by `drillCoaching.test.ts` so it can never go quiet.**
 */

export interface DrillCoaching {
  /** Short imperatives. Two minimum where a drill is coached at all. */
  cues: string[];
  /** The shapes of going wrong, each recognisable from the outside. */
  faults: string[];
}

export const DRILL_COACHING: Record<string, DrillCoaching> = {
  sticky_feet: {
    cues: [
      'Pick the spot on the hold before the foot leaves the last one.',
      'Eyes on the placement, then look away. The eyes leave before the weight arrives.',
      'Climb slow enough that you never need the second try.',
    ],
    faults: [
      'The foot lands, then slides a centimetre to where you actually wanted it. That is the adjustment, and the person making it almost never sees it.',
      'Placements go sloppy on the last two boulders, when you are tired and the rule starts to feel optional — which is exactly when the habit is being built.',
    ],
  },

  flagging: {
    cues: [
      'Reach with the right, flag with the left. The leg goes where the swing wants to take you.',
      'The flagging foot touches the wall. It is a brake, not decoration.',
      'Feel for the moment the hips stop wanting to turn — that is the flag working.',
    ],
    faults: [
      'The leg comes out after the hand has already moved, which is a recovery rather than a flag.',
      'The flag hangs in the air touching nothing, so it counterbalances nothing.',
    ],
  },

  hover_hands_3s_pause: {
    cues: [
      'Hover over the hold you are going to take, not somewhere near it.',
      'Three full seconds. Count them out loud if the count keeps shrinking.',
      'The body goes quiet before the hand moves, not after it lands.',
    ],
    faults: [
      'The hover drifts — the hand circles the hold hunting for the grip instead of holding still above it.',
      'The count speeds up as the forearms load, and the last hover of a boulder is a tap.',
    ],
  },

  the_trifecta_all_three: {
    cues: [
      'One constraint at a time in your head; all three in the body.',
      'If you have to drop one to finish the boulder, the boulder is too hard.',
      'Finish fewer, better.',
    ],
    faults: [
      'Two of the three hold and the third quietly lapses — usually the hover, because it costs the most forearm.',
      'Climbing faster to beat the pump, which loses all three at once.',
    ],
  },

  endurance_intervals_4x4: {
    cues: [
      'No rest between boulders means none. Walking to the next one is the rest.',
      'Pick boulders you can flash tired, not boulders you can flash fresh.',
      'Three minutes between rounds, timed rather than guessed.',
    ],
    faults: [
      'Round one is comfortable and round four is a different sport — round four is the one you chose the grade for.',
      'Shaking out at the top of each boulder, which turns sixteen climbs into sixteen rests.',
    ],
  },

  volume_build_mini_assessment: {
    cues: [
      'Test first, while you are fresh. Volume after.',
      'Log the number you got, not the number you wanted.',
      'Quiet feet on all thirty, including the ones at the end.',
    ],
    faults: [
      'Climbing the volume first because it is the better half, then testing tired — a number that measures fatigue is worse than no number.',
      'Grade creep: flash-minus-one drifts up to flash as the session warms up.',
    ],
  },

  continuous_circuit_5_10_min: {
    cues: [
      'Find the rest holds before you need them.',
      'Straight arms wherever the wall allows it.',
      'Down a hold is better than off the wall.',
    ],
    faults: [
      'Climbing through the good holds because stopping feels like cheating — the resting is the drill.',
      'Stepping down to reset at four minutes and calling the round five.',
    ],
  },

  deload_flow_rpe_5: {
    cues: [
      'Two grades below max means two, not one.',
      'If you are trying, this is not the session.',
      'Stop while it still feels easy.',
    ],
    faults: [
      'A deload that turns into a project session because the setting was good. The week it costs is the one after.',
      'Adding a drill back in, because a constraint feels productive.',
    ],
  },

  box_breathing_projecting: {
    cues: [
      'Four rounds before every attempt, including the one you are impatient for.',
      'Even count in, even count out. The hold at each end is part of it.',
      'The breathing is the drill. The send is a side effect.',
    ],
    faults: [
      'The ritual gets skipped on the attempt that feels good — which is the attempt it was built for.',
      'The count shrinks as the attempt gets closer, so four seconds becomes something like three.',
    ],
  },

  intro_to_dynos: {
    cues: [
      'Generate from the legs. The arms only catch.',
      'Aim to arrive at the hold, not past it.',
      'Both feet stay on until the pop feels controlled.',
    ],
    faults: [
      'Throwing further rather than throwing better, which is how a first dyno session becomes a shoulder.',
      'Catching on a straight, unengaged arm — the shoulder takes the whole arrival on its own.',
    ],
  },

  send_week_foundations: {
    cues: [
      'Full rest between burns, even when you feel ready sooner.',
      'Every attempt is a real attempt. Three good ones beat six tired ones.',
      'Breathe before you pull on.',
    ],
    faults: [
      'Spending the day on volume first, so the real attempts happen on an empty tank.',
      'Repeating the same failed sequence because it nearly worked. A burn that changes nothing is a rest you took on the wall.',
    ],
  },

  graduation_retest_foundations: {
    cues: [
      'Same order, same rest, same holds as Week 0.',
      'Rested before you test. A tired retest measures the week, not the block.',
      'Write the number down before you have an opinion about it.',
    ],
    faults: [
      'Changing the protocol to get a better number — a wider edge, a fresher grip, a longer rest between push-up sets.',
      'Skipping the test that went badly last time, which is the one with the most to say.',
    ],
  },
};

export function drillCoaching(id: string): DrillCoaching | undefined {
  return DRILL_COACHING[id];
}
