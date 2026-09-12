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
 * **COACH: this is a first pass rather than a syllabus.** Every line is
 * written from the drill's own description — the method was already there,
 * and what was missing is what you say about it at the wall — so the
 * wording of all of it is yours to replace, the same way M113 settled the
 * twelve cooldown stretches. `drillCoaching.test.ts` holds how much of the
 * library is done, program by program, so the count can never go quiet.
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

  // ── Iron Grip ───────────────────────────────────────────────────────────

  limit_boulders_on_the_crimps: {
    cues: [
      'Set the crimp before you pull, not while you pull.',
      'Limit minus one. Falling on every burn means the wrong boulder for this week.',
      'Three to five minutes between burns. Fingers recover slower than the ego.',
    ],
    faults: [
      'The half crimp opens into a drag halfway up and you finish anyway — that burn trained the grip you already had.',
      'A tweak gets ridden out because the boulder was nearly done. The Anvil is the phase with the least to gain from that and the most to lose.',
    ],
  },

  volume_on_moderate_crimps: {
    cues: [
      'Two grades below max, and it should feel like it.',
      'Every hold is a crimp, including the ones you would rather pinch.',
      'Count the boulders. Twenty is the dose, not the target.',
    ],
    faults: [
      'Grade drift — the session starts at minus two and ends at minus one, which turns mileage into a session you have to recover from.',
      'Skipping the crimpy start because the jug line beside it is quicker. Time on the edge is the entire point.',
    ],
  },

  projecting_with_crimp_focus: {
    cues: [
      'Take the crimp even when the pinch works. That is the drill.',
      'Four to six burns per project, then leave it alone.',
      'Five minutes of rest, and actually five.',
    ],
    faults: [
      'Beta quietly reverts to the easiest holds once the burns get hard — which is exactly when the crimping was going to count.',
      'Two projects becomes six boulders, and nothing gets enough attempts to change.',
    ],
  },

  deload_flow_session: {
    cues: [
      'Juggy terrain, RPE 5, thirty to forty-five minutes.',
      'No crimp focus this week. None.',
      'Sleep and food are the session.',
    ],
    faults: [
      'One crimpy boulder because it looked good. The Hammer starts on whatever fingers you bring to it.',
      'Treating the deload as the optional week rather than the one that makes phase 2 possible.',
    ],
  },

  power_endurance_circuit: {
    cues: [
      'No rest between boulders. Down-climb or drop, then straight onto the next.',
      'Two to three grades below max, so the last boulder of a set is still climbable.',
      'Four minutes between sets, timed rather than guessed.',
    ],
    faults: [
      'Chalking up between boulders, which is a rest wearing a ritual.',
      'Set one is clean and set four is a different climber. Pick the grade for set four.',
    ],
  },

  limit_bouldering_sessions: {
    cues: [
      'At or above your max. If you are sending, it is not hard enough.',
      'Five minutes minimum between burns. This is a nervous-system session.',
      'A full rest day after. Max hangs and limit climbing in one week is already a lot.',
    ],
    faults: [
      'Burns get shorter and rests get shorter as the session runs on, so the last twenty minutes trains power endurance instead.',
      'Stacking this the day after a Max Hang session, which is the one combination the program names.',
    ],
  },

  the_crimp_project: {
    cues: [
      'Pick the one you wrote off, not the one you nearly had.',
      'You are collecting beta, not sending. Note the crux and where it actually fails.',
      'Five to ten minutes between burns.',
    ],
    faults: [
      'Choosing something you already knew you could do, so the session says nothing about the last six weeks.',
      'Leaving without a plan for phase 3, which was the thing the session was for.',
    ],
  },

  deload_max_hang_day_off_flow: {
    cues: [
      'No hangboard. Not one set.',
      'Very easy climbing, and less of it than you want.',
      'Campus work starts next week on the fingers you arrive with.',
    ],
    faults: [
      'A light hangboard session, which is the same tissue in a week that exists to unload it.',
      'Filling the freed-up days with more climbing, so the week deloads the board and nothing else.',
    ],
  },

  contact_strength_projecting: {
    cues: [
      'One move, over and over. The crux is the session.',
      'Five minutes between goes, and stop the moment the catch gets sloppy.',
      'Wake the nervous system up before the first hard pull, every time.',
    ],
    faults: [
      'Grinding out link attempts while the single move is still not clean. Contact strength is trained on the move, not the sequence.',
      'Missing the same catch three times and going for a fourth. A tired nervous system trains nothing.',
    ],
  },

  crimp_pull_power_application: {
    cues: [
      'Small crimps and a dynamic move on the same boulder. Both, or it is a different drill.',
      'Three to five attempts each, full rest between.',
      'Film it. Campus-phase form goes before it feels like it has.',
    ],
    faults: [
      'Form breaks in the last third of the session and the video is the only thing that knows.',
      'Choosing boulders with crimps or dynamics rather than both, which halves the drill.',
    ],
  },

  send_week_crimp: {
    cues: [
      'One project for the week. Choose it before the first session.',
      'Four to six real burns per session, long rests between.',
      'Box breathe before every attempt.',
    ],
    faults: [
      'Switching projects mid-week because day one felt bad. Day one of a send week is not the verdict.',
      'Six burns where three were attempts and three were rehearsals of moves you already own.',
    ],
  },

  graduation_retest_fingers: {
    cues: [
      'Same edge, same grip, same rest as Week 0.',
      'Rested going in. Three full days off coming out.',
      'Log the number before you decide what it means.',
    ],
    faults: [
      'Testing at the end of a session, so the retest measures the day rather than the block.',
      'Warming up so thoroughly on the max hang that the first test hang is the fourth heavy hang of the morning.',
    ],
  },

  // ── Lockdown ──────────────────────────────────────────────────────────

  quiet_feet_hover_hands: {
    cues: [
      'Hover over the hold you are taking, not somewhere near it.',
      'Three full seconds, and the body goes quiet before the hand moves.',
      'Two minutes between boulders. This is slower than it feels.',
    ],
    faults: [
      'The hover shortens as the forearms load, so the last hover of a boulder is a tap.',
      'Quiet feet hold and the hover lapses, or the reverse. Losing one of the two turns this into a drill you have already done.',
    ],
  },

  drop_knee_isolation: {
    cues: [
      'Inside knee rotates down and in. The hip follows it to the wall.',
      'Use one even where a square hip would do. That is the whole exercise.',
      'Four to six problems, and the reach should come from the hip rather than the arm.',
    ],
    faults: [
      'The knee drops but the hip stays off the wall, so nothing has rotated and the reach costs the same.',
      'Skipping holds to find a drop-knee, which turns a technique drill into a different sequence.',
    ],
  },

  heel_hook_commitment: {
    cues: [
      'Pull into the wall with the heel before the hand goes anywhere.',
      'The heel is a second hand, not a balance point.',
      'Feel the hamstring and the glute. If you cannot, the heel is not loaded.',
    ],
    faults: [
      'The heel rests on the hold and takes no weight — it looks identical from the ground and trains nothing.',
      'The hip stays low and open, so the heel pulls sideways rather than in, and the foot pops on the reach.',
    ],
  },

  static_trifecta: {
    cues: [
      'All three on every move: quiet feet, three-second hover, drop-knee where it fits.',
      'Four or five problems is the session. Slower is correct.',
      'If a constraint has to go to finish the boulder, drop the boulder instead.',
    ],
    faults: [
      'Two of the three survive and the third quietly goes — usually the hover, because it costs the most forearm.',
      'Speeding up to beat the pump, which loses all three at once.',
    ],
  },

  lock_off_holds_on_wall: {
    cues: [
      'Every other move, pause three seconds in the lock before the hand leaves.',
      'Set the body first. The hand goes last.',
      'Match the intensity to how fresh the arms feel, not to the plan.',
    ],
    faults: [
      'The pause happens after the reach rather than before it, which is a rest and not a lock-off.',
      'The elbow drifts out and the shoulder shrugs as the hold gets long — the position has gone before the three seconds have.',
    ],
  },

  twist_lock_practice: {
    cues: [
      'Turn the hip into the wall until it is parallel, not square.',
      'Rotate through the move. Do not pull through it.',
      'Steep terrain only. On a slab there is nothing to twist against.',
    ],
    faults: [
      'The shoulders turn and the hips stay square, so the reach comes from the arm after all.',
      'Feet cut on the rotation, which means the twist started after the pull instead of before it.',
    ],
  },

  static_projecting: {
    cues: [
      'No dynamic moves. If a move only goes dynamically, find static beta or leave the problem.',
      'One or two grades above flash, on static terrain.',
      'Three to five attempts, five minutes between.',
    ],
    faults: [
      'One small pop in the middle of an otherwise static sequence, which is the move the drill was built to expose.',
      'Choosing a problem with no static solution at all, so the session becomes ordinary projecting with a rule nobody kept.',
    ],
  },

  deload_the_flow_session: {
    cues: [
      'Thirty minutes, RPE 4 to 5, two grades below your limit.',
      'No drills and no constraints this week.',
      'Skipping it entirely is a legitimate answer if you feel fresh.',
    ],
    faults: [
      'Adding a constraint back in, because a drill feels more productive than easy climbing.',
      'A deload that becomes a project session because the setting was good. The cost lands the following week.',
    ],
  },

  no_match_climbing: {
    cues: [
      'No hand ever meets the other on a hold. Every move goes to the next hold with the other hand.',
      'Read the sequence from the ground. The drill is mostly decided before you leave it.',
      'Full rest between problems — this is more tiring than it looks.',
    ],
    faults: [
      'A quick match to recover, which is the exact thing the drill removes.',
      'Picking problems whose sequence already alternates, so the rule never bites.',
    ],
  },

  offset_pull_practice: {
    cues: [
      'One hand stays low. The other goes long.',
      'Two or three offset pulls per problem, not every move.',
      'Three minutes between problems. Each one of these is a near-maximal pull.',
    ],
    faults: [
      'The low hand creeps up to meet the reach, which turns an offset into an ordinary move.',
      'The body swings out on the pull because the feet were not set first, and the offset becomes a shoulder problem.',
    ],
  },

  project_week_static: {
    cues: [
      'One project. Choose it before the first burn.',
      'Four to six quality burns, five to ten minutes between.',
      'Quiet feet, hover, drop-knee and twist-lock where they fit — the block, applied.',
    ],
    faults: [
      'Volume first, so the real burns happen on tired arms.',
      'Repeating the same failed sequence because it nearly worked. A burn that changes nothing is a rest taken on the wall.',
    ],
  },

  graduation_retest_static: {
    cues: [
      'Same order, same rest, same edge and grip as Week 0.',
      'Rested before you test. A tired retest measures the week, not the block.',
      'Write each number down before you form an opinion about it.',
    ],
    faults: [
      'Changing the protocol to get a better number — a bigger edge, a longer rest, a lock-off at eighty degrees rather than ninety.',
      'Skipping the test that went badly last time, which is the one with the most to say.',
    ],
  },
};

export function drillCoaching(id: string): DrillCoaching | undefined {
  return DRILL_COACHING[id];
}
