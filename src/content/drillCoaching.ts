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
 * ## What is here
 *
 * All 144, three cues and two faults each, written from each drill's own
 * description — M107 established that those paragraphs already carry the
 * method, so what was added is what a coach says about it while you are
 * doing it. `drillCoaching.test.ts` holds the coverage program by program,
 * so a drill added later cannot arrive silently uncoached.
 *
 * **COACH: this is a first pass rather than a syllabus, and it is 144
 * drills written in one go.** Every line is overrulable the way M113's
 * twelve cooldown stretches were. The shapes most likely to need your eye
 * are the ones where a drill's description left the failure mode unstated
 * and the fault below is a coach's inference rather than the program's
 * own words.
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

  // ── Gravity Defied ────────────────────────────────────────────────────

  vertical_deadpoint: {
    cues: [
      'Hips sink before anything leaves the wall.',
      'The arms are ropes, not motors. Straight until the legs have gone.',
      'At the top of the arc, hover or slap. Do not grab.',
    ],
    faults: [
      'The elbows bend before the hips move, which is the arms starting the launch and the legs finishing it.',
      'Grabbing at the deadpoint instead of hovering, so you never learn where the arc actually tops out.',
    ],
  },

  lateral_momentum: {
    cues: [
      'Push with the foot. The trailing leg is the engine.',
      'Hips go first and the hands follow them.',
      'Redirect the momentum. Do not build it again with the arms.',
    ],
    faults: [
      'The reach gets muscled at the last moment because the swing arrived short — a pull dressed as a dyno.',
      'The trailing foot leaves before it has pushed, so there was nothing to swing from.',
    ],
  },

  double_clutch: {
    cues: [
      'Clap before the latch. Audible, not implied.',
      'Three to five problems at RPE 6 to 7. This is not a max session.',
      'If you can half-attempt it, you are not clapping.',
    ],
    faults: [
      'The clap softens into a brush of the hands near the chest, which leaves the safety net exactly where it was.',
      'The target gets grabbed early on the way up, so the clap happens after the commitment rather than instead of the hesitation.',
    ],
  },

  the_pogo: {
    cues: [
      'Swing back, then kick forward and up. The kick comes before the pull.',
      'The standing foot stays where it is. Only the free leg moves.',
      'Both sides. The weaker one is the one worth the reps.',
    ],
    faults: [
      'The pull starts first and the kick arrives to help, which is the order that makes a pogo feel useless.',
      'The free leg swings across the body rather than through it, so the momentum goes sideways and barn-doors you off.',
    ],
  },

  step_up_dyno: {
    cues: [
      'Weight over the foot before you press.',
      'Press through the heel. Through the toes is the quad.',
      'It should feel like standing out of a deep single-leg squat, with a launch at the top.',
    ],
    faults: [
      'The hands pull the body up to the high foot instead of the foot pressing it up, which is the move done backwards.',
      'The heel lifts as the press starts, so the drive goes through the forefoot and the glute never fires.',
    ],
  },

  the_paddle_bumping: {
    cues: [
      'The intermediate is a stepping stone. Do not hang on it.',
      'Under half a second between the two. Count it out loud if the gap keeps growing.',
      'Set the feet for the second move before you leave for the first.',
    ],
    faults: [
      'The intermediate gets held and settled on, which turns a bump into two separate moves and trains neither.',
      'The second hand goes before the first has loaded, so there is nothing to re-launch from.',
    ],
  },

  run_and_jumps: {
    cues: [
      'Juggy finish holds only.',
      'Absorb the landing with knees and hips. Hands stay off the ground.',
      'Check the mat and the run-in before every attempt.',
    ],
    faults: [
      'The landing gets taken on straight legs with a hand down, which is how this drill produces a wrist rather than a dyno.',
      'Attempts continue past the point where the run-up has gone ragged — the approach is half the move.',
    ],
  },

  deload_target_practice: {
    cues: [
      'Index finger on the target. That is the accuracy constraint.',
      'Thirty per cent fewer attempts than a normal week.',
      'No limit attempts. None.',
    ],
    faults: [
      'The touch becomes a catch, which puts the load straight back into the week that exists to remove it.',
      'The attempt count stays where it was because the moves feel easy — the deload is in the volume, not the grade.',
    ],
  },

  the_coordinate: {
    cues: [
      'The exit of move one is the setup for move two. Plan it that way.',
      'Two or three problems, three to five attempts each.',
      'If the first move lands wrong, the second is not worth trying.',
    ],
    faults: [
      'Each move gets climbed as its own problem with a reset between, which is the thing the drill exists to stop.',
      'Choosing a boulder where the two dynamic moves sit far apart, so nothing has to cascade.',
    ],
  },

  the_full_send: {
    cues: [
      'Toes pull the wall toward you as the hands leave.',
      'Hold the toe tension through the air.',
      'Hand and foot arrive together. That is what kills the swing.',
    ],
    faults: [
      'The feet cut on the launch, so the catch becomes a swing to control rather than a position to hold.',
      'The foot lands after the hand and the body has already opened before the tension arrives.',
    ],
  },

  integration_project_week: {
    cues: [
      'First three burns: full power, tap the hold, control the landing. Do not latch.',
      'Burns four onward: the same power, open hand, latch.',
      'Four to six quality burns, five minutes between.',
    ],
    faults: [
      'The first three get latched anyway because the catch was there, which skips the switch and keeps the hesitation.',
      'Power drops on the burns that are meant to latch, so the send attempts are weaker than the rehearsals.',
    ],
  },

  graduation_flight_test: {
    cues: [
      'Test first, while fresh. The graduation boulder after.',
      'Same box, same bar, same edge as Week 0.',
      'Log the number before you decide how you feel about it.',
    ],
    faults: [
      'The graduation attempt goes first because it is the interesting half, and the retest then measures a tired climber.',
      'Picking a graduation boulder with no real dynamic move in it, which tests nothing this program built.',
    ],
  },

  limit_dynos_four_burns: {
    cues: [
      'Twenty-five to thirty minutes of warm-up. Cold shoulders do not catch.',
      'Four burns, then move on. Eight minutes between problems.',
      'Two ugly burns in a row ends the problem.',
    ],
    faults: [
      'The third and fourth burns get flailed through because the first two nearly worked, which trains the sloppy pattern and risks the ankles.',
      'Warm-up gets cut because the session is short, so the hardest throws of the week land on the least prepared tissue.',
    ],
  },

  style_diverse_dynamic_day: {
    cues: [
      'One of each: straight-up deadpoint, lateral swing, paddle or bump, all-out throw.',
      'Three or four burns each, then move.',
      'Rate the landing honestly. A caught barn-door is not a clean send.',
    ],
    faults: [
      'Four problems that are all your favourite style, chosen because they felt best in the warm-up.',
      'Counting a catch that swung out and held as clean, which hides exactly the direction you are weakest in.',
    ],
  },

  crux_isolation_hard_move: {
    cues: [
      'Thirty minutes on the move alone, off the start holds or a pad.',
      'Drill the launch and the catch separately before you link anything.',
      'Five minutes between real attempts.',
    ],
    faults: [
      'Linking too early, so every attempt spends its best effort on the approach and arrives at the crux tired.',
      'Volume creeps in because one move does not feel like a session. It is move mastery, not a workout.',
    ],
  },

  deload_flow_dynos: {
    cues: [
      'Five or six boulders, all well within your limit, RPE 5 to 6.',
      'Precise launches and soft landings. That is the whole session.',
      'Climb, do not grind.',
    ],
    faults: [
      'A max throw at the end because everything felt good, which undoes the week for the shoulders and the fingers both.',
      'Projecting sneaks onto the last boulder, and the week stops being a deload half an hour before it ends.',
    ],
  },

  intensify_five_burns: {
    cues: [
      'Push the grade above block one. This is the hardest dynamic week.',
      'Five burns per problem, five minutes between.',
      'You should be banking sends now, not only attempts.',
    ],
    faults: [
      'Repeating block one’s grade because it is comfortable, which makes the hardest week of the block the same as its first.',
      'The catches feel no more secure than four weeks ago and the burns continue anyway. That is a recovery signal, not a volume problem.',
    ],
  },

  dynamic_link_ups: {
    cues: [
      'Each problem twice, back to back, no rest between the two.',
      'One to two grades below limit, so the second lap is still climbable.',
      'Four minutes between sets, timed rather than guessed.',
    ],
    faults: [
      'The catches turn to flails mid-set and the set gets finished anyway. Form first — if the catches go, the set is done.',
      'The gap between the two laps creeps in as a chalk-up, which removes the pump the drill is built around.',
    ],
  },

  the_hard_flash_day: {
    cues: [
      'Read the dynamic beta from the ground, then commit on the first go.',
      'Two attempts maximum, then move on.',
      'Log how many you flash clean.',
    ],
    faults: [
      'The second attempt becomes a fourth because the problem now feels close, which is projecting rather than flashing.',
      'Hesitating on the launch to see how it feels. A half-committed dyno on a first go is a fall with extra steps.',
    ],
  },

  deload_soft_catches: {
    cues: [
      'Every catch is a precision rep: exact hand, quiet landing, no swing.',
      'RPE 5, dynamic but well within limit.',
      'Line it up with the technique deload so the week is a real rest week.',
    ],
    faults: [
      'Treating it as a light session rather than the last reset before performance phase, and arriving at peak week already flat.',
      'Sloppy landings because the moves are easy, which is the one habit a deload should never be building.',
    ],
  },

  peak_projecting_six_burns: {
    cues: [
      'Six burns each, five minutes minimum between.',
      'Every burn is the send: precise warm-up, full commitment, soft landing.',
      'Log the hardest dyno you attempt. It should be a personal best.',
    ],
    faults: [
      'Junk volume around the burns, so the strongest and most recovered week of the block gets spent warming up.',
      'Burn six is a token go on a tired body. Five real attempts beat six where one was scenery.',
    ],
  },

  send_window: {
    cues: [
      'One project. Four to six real burns, long rests, nothing around them.',
      'Warm up thoroughly, then conserve. The goal is the send, not a workout.',
      'Send it early, bank it, and move to the next.',
    ],
    faults: [
      'A session of volume before the burns, which spends the conditions the window was chosen for.',
      'Staying on the project after it has clearly gone for the day, which turns a send window into a tired rehearsal.',
    ],
  },

  consolidate_and_convert: {
    cues: [
      'Revisit the ones that were at your limit four weeks ago. They should go cleanly.',
      'Then one fresh project, a grade harder.',
      'Moderate volume. You are sharpening, not breaking down.',
    ],
    faults: [
      'The revisit turns into a full session, so nothing is left for the grade that would actually reset the baseline.',
      'Choosing old problems you had already sent, which proves nothing about the block.',
    ],
  },

  graduation_send_test: {
    cues: [
      'Full warm-up. This is the hardest throw of the program.',
      'Log the hardest dyno attempted and the hardest sent.',
      'Compare against week 1 before you judge the block.',
    ],
    faults: [
      'Attempting it under-warmed because it is the last session and the session feels ceremonial.',
      'Not logging the attempt because it did not go. The grade attempted is half the scorecard.',
    ],
  },

  // ── The Long Game ─────────────────────────────────────────────────────

  tlg_arc_2x10: {
    cues: [
      'Three to four grades below on-sight. If you are choosing holds, it is too hard.',
      'Ten minutes without stepping off. The clock is the set.',
      'Mild pump and easy breathing. If you pump out, you went too hard.',
    ],
    faults: [
      'The grade creeps up in the second round because the first felt too easy, which turns a vascular session into a pumpy one.',
      'Stepping down for a few seconds to shake and calling it continuous. The continuity is the stimulus.',
    ],
  },

  tlg_arc_2x15: {
    cues: [
      'Straight arms throughout. Bent arms are the first thing to go at fifteen minutes.',
      'Exhale on every move.',
      'Shake every five to eight moves even when you do not need to.',
    ],
    faults: [
      'Shaking only when the forearms ask for it, which trains the reaction rather than the habit.',
      'The arms bend somewhere in the second half and nobody notices until the pump arrives.',
    ],
  },

  tlg_arc_2x20: {
    cues: [
      'Twenty minutes, five off, twenty more.',
      'Clip from three different stances each round.',
      'Note which stances felt stable. That is beta for a future project.',
    ],
    faults: [
      'The clipping practice gets dropped in the second round when the forearms start talking — which is when the stance actually matters.',
      'Terrain drifts up from three grades below on-sight, so twenty minutes becomes impossible rather than dull.',
    ],
  },

  tlg_deload_arc_movement: {
    cues: [
      'Twelve minutes, very easy. Shorter than last week on purpose.',
      'Quiet feet, read two moves ahead, exhale on every reach.',
      'Skipping it is a legitimate answer if you feel fresh.',
    ],
    faults: [
      'Running the usual twenty because the shorter round feels pointless. The reduction is the point.',
      'Adding intensity back as movement practice, which is the same session under a different name.',
    ],
  },

  tlg_linked_laps_doubles: {
    cues: [
      'Lower off the first and pull straight onto the second. No gap.',
      'Eighty to ninety per cent of redpoint, so the second route is still climbable.',
      'Four minutes between sets, timed rather than guessed.',
    ],
    faults: [
      'A chalk-up and a shake between the two routes, which is exactly the rest the drill removes.',
      'Set one is clean and set four falls off the first route. Pick the grade for set four.',
    ],
  },

  tlg_4x4_route_intervals: {
    cues: [
      'Four routes, zero rest between them. That is one set, then four minutes.',
      'Two grades below redpoint. This is buffering, not projecting.',
      'Come off mid-set and the set is over. Lower, rest, restart the whole set.',
    ],
    faults: [
      'Finishing a set after coming off, which turns four routes into a slightly harder ordinary session.',
      'Rest creeps in as rope work between routes. The zero is the stimulus.',
    ],
  },

  tlg_the_pump_clock: {
    cues: [
      'Note the time at pump onset before you do anything about it.',
      'Ten seconds of shake, timed. Not until it feels better.',
      'Three rounds, and the window should be twenty to thirty per cent longer by the last.',
    ],
    faults: [
      'The shake runs until the forearms feel good, which is a rest and leaves you no number to extend.',
      'Not writing the onset time down, so there is nothing for round three to beat.',
    ],
  },

  tlg_deload_arc_2x10: {
    cues: [
      'Two sets maximum, or simply ten easy minutes twice.',
      'No intensity work this week.',
      'Send attempts do not happen in fatigued forearms. That is what the week is for.',
    ],
    faults: [
      'Keeping the interval sessions and shortening only the ARC, so the hard stimulus stays and the easy one goes.',
      'Treating a light week as a lost week and adding a session back.',
    ],
  },

  tlg_linked_laps_shakeout: {
    cues: [
      'Two sets only. This is maintenance, not a build.',
      'Ten to fifteen seconds per arm, timed, on a fresh route.',
      'Climb, shake, climb, shake. The shakeout is the second half of the session.',
    ],
    faults: [
      'Three or four sets because two feels short, which spends the week the send needs.',
      'Shaking for as long as it takes rather than to a count, so the skill never gets calibrated.',
    ],
  },

  tlg_maintenance_linked_laps: {
    cues: [
      'Two sets, same as last week. Refining, not building.',
      'Film one attempt and watch it back between sets.',
      'Look for pacing, clipping, and where you chose to hang.',
    ],
    faults: [
      'Filming and not watching until after the session, which removes the only chance to change anything.',
      'Adding volume because the engine feels good. The engine is built; this week is about using it.',
    ],
  },

  tlg_arc_taper: {
    cues: [
      'One round, fifteen minutes, very easy.',
      'No intensity work at all.',
      'Rest more than you think you need.',
    ],
    faults: [
      'A second round because one felt too short. Conserving is the session.',
      'Treating the taper as the week to fix something. Nothing gets fixed in a taper.',
    ],
  },

  tlg_no_endurance_send_week: {
    cues: [
      'No dedicated endurance session. The send attempts are it.',
      'Rest, sleep, protein, patience.',
      'The training is done.',
    ],
    faults: [
      'Adding a light ARC to feel productive, which spends forearms the attempts need.',
      'Filling the rest days with volume because the week feels empty.',
    ],
  },

  tlg_onsight_route_reading: {
    cues: [
      'Sixty seconds on the ground before you touch it. Rests, cruxes, clipping stances.',
      'Attempt it cold. One go.',
      'Afterwards, write down where the read was wrong.',
    ],
    faults: [
      'Reading for sixty seconds and then climbing whatever presents itself, so the read was never tested.',
      'Skipping the note afterwards, which is where the skill actually improves.',
    ],
  },

  tlg_clipping_drills: {
    cues: [
      'First lap: three stances per clip — left, right, direct.',
      'Second lap: one hand, one motion, no fumbling.',
      'Fumble, re-establish balance, then try again rather than forcing it.',
    ],
    faults: [
      'Clipping from the most comfortable stance every time, which is the habit the drill exists to break.',
      'Forcing a fumbled clip from a collapsing position, which rehearses the panic clip you least want on a redpoint.',
    ],
  },

  tlg_fall_ladder: {
    cues: [
      'One rung at a time, and only move up when the current one is genuinely comfortable.',
      'Tell the belayer which fall is coming, every time.',
      'Let go. Do not climb down to make it smaller.',
    ],
    faults: [
      'Jumping to the commitment fall on day one because the clip falls felt fine, which is how the ladder stops working.',
      'Reaching for the rope or the last hold on the way off, which rehearses the hesitation rather than removing it.',
    ],
  },

  tlg_deload_easy_onsights: {
    cues: [
      'Two or three attempts on moderate routes. That is the whole session.',
      'No projecting and no max efforts.',
      'Read back four weeks of notes and look for the pattern.',
    ],
    faults: [
      'The review gets skipped because the climbing was the plan. The notes are half the session.',
      'Two easy routes becomes six because the body feels fine, which is not what the week is measuring.',
    ],
  },

  tlg_project_selection_burns: {
    cues: [
      'Burn one goes top to bottom. Note every issue, send or not.',
      'Burns two and three: take the rope and work the crux.',
      'Five to eight minutes between burns, three or four in total.',
    ],
    faults: [
      'Attempt one turns into a redpoint attempt, so the information-gathering burn gets spent on trying.',
      'Choosing a route so far above your limit that you never reach the crux to work it.',
    ],
  },

  tlg_crux_to_chains: {
    cues: [
      'Burn one bottom to crux. Burn two crux to chains. Burn three the whole thing if you have it.',
      'Three to five minutes between burns.',
      'Write down where you fell and why, after every burn.',
    ],
    faults: [
      'Both links get attempted in one burn, so neither gets a fresh effort and the data is muddy.',
      'The note says fell at the crux, which is where rather than why.',
    ],
  },

  tlg_full_redpoint_attempts: {
    cues: [
      'Sixty seconds of visualisation before every burn — every clip, every rest, every crux move.',
      'Eight to ten minutes between attempts.',
      'After each fall: strength, technique or mental. Pick one and be specific.',
    ],
    faults: [
      'Visualisation gets skipped on the burn you feel readiest for, which is the burn it would have helped most.',
      'The note says did not feel strong, which is a mood rather than a cause.',
    ],
  },

  tlg_deload_volume_day: {
    cues: [
      'Five or six routes a grade below redpoint, cruised.',
      'Quiet feet, straight arms, slow breathing.',
      'No projecting. The motor patterns stay and the pump system recovers.',
    ],
    faults: [
      'One go on the project because it is right there, which is the whole reason the week says no projecting.',
      'Cruising turns into pushing the pace, and the volume day becomes an interval session.',
    ],
  },

  tlg_visualization_burns: {
    cues: [
      'Twenty-five to thirty minutes of warm-up before the first burn.',
      'Sixty seconds minimum with the eyes closed, the whole route.',
      'Rate each attempt nought to ten on quality, not on whether it went.',
    ],
    faults: [
      'Scoring the attempt by its outcome, which is the one thing the rating exists to decouple.',
      'A sloppy send gets a ten and a perfect attempt that fell gets a four. It is the other way round.',
    ],
  },

  tlg_film_review_projecting: {
    cues: [
      'Film from the ground and watch between burns, not afterwards.',
      'Look for early arm bending, hips drifting off the wall, foot hesitation, rushed clips.',
      'Go again with one specific thing to change.',
    ],
    faults: [
      'Watching for how it looked rather than for one fixable thing, so the next burn is identical.',
      'Filming both attempts and reviewing neither until the drive home.',
    ],
  },

  tlg_peak_conditions_send: {
    cues: [
      'Coolest, driest part of the day. Quietest part of the wall.',
      'Thirty minutes of warm-up, not twenty.',
      'Three high-quality burns, ten to twelve minutes between.',
    ],
    faults: [
      'Going when it suits the calendar rather than when conditions are good, on the one session built around conditions.',
      'A fourth and a fifth burn because the third was close, which spends the next session too.',
    ],
  },

  tlg_send_week: {
    cues: [
      'Attempts only. Two or three a session, ten minutes minimum between.',
      'If it does not go, the beta is banked. That is a real outcome.',
      'Retest the baselines straight after the final attempt, send or not.',
    ],
    faults: [
      'Training creeps back in because the week feels idle, and the attempts get the leftovers.',
      'Skipping the graduation retest after a session that did not end in a send, which loses twelve weeks of measurement to a bad mood.',
    ],
  },

  // ── The Siege ─────────────────────────────────────────────────────────

  sg_project_selection_recon: {
    cues: [
      'You are auditioning, not sending. Top-rope or stick-clip everything.',
      'Every move first try means too easy. No idea at the crux means too hard.',
      'Pick one by the end of the session. Leaving undecided costs a week.',
    ],
    faults: [
      'Choosing the route you want to have climbed rather than the one that fits the rule — the audition exists to stop that.',
      'Trying each candidate once and calling it recon, so the choice is made on a first impression of a cold route.',
    ],
  },

  sg_move_by_move_decoding: {
    cues: [
      'One move at a time. Linking is not this session.',
      'Rehearse each move until it repeats, not until it happens once.',
      'Log the moves that feel low-percentage. Those are the project.',
    ],
    faults: [
      'Starting to link because the moves are going well, which spends the session and leaves the hard moves undecoded.',
      'A move gets done once and marked solved. Once is luck; repeatable is beta.',
    ],
  },

  sg_beta_refinement_rests: {
    cues: [
      'Hunt the micro-beta: a thumb catch, a heel that turns a campus into a reach, a knee bar that becomes a rest.',
      'Test an alternative through the crux. The first solution is rarely the best one.',
      'Find and rehearse every shake-out, not just the moves.',
    ],
    faults: [
      'Settling on the first sequence that worked, which is how a route stays at ninety per cent for a season.',
      'Rests get noted and never rehearsed, so on the redpoint you arrive at one and do not know how to use it.',
    ],
  },

  sg_first_links_checkpoint: {
    cues: [
      'Three to five move sections, and at least one attempt through the crux.',
      'Moderate volume. The fingerboard deloads this week for a reason.',
      'Checkpoint: still impossible rather than low-percentage means reassess the choice now.',
    ],
    faults: [
      'The checkpoint gets skipped because reassessing feels like quitting — it is cheaper this week than in week 8.',
      'Volume creeps up because linking is the fun part, and the deload the week was built around disappears.',
    ],
  },

  sg_section_links_doubles: {
    cues: [
      'Five to eight move sections, especially through and around the crux.',
      'Two or three burns, fifteen to twenty minutes between. Each one a genuine effort.',
      'Climb in the better conditions of your window, not the convenient part of it.',
    ],
    faults: [
      'Burns become rehearsals — going through the sequence rather than trying it, which trains nothing new.',
      'Four or five burns because the rests feel long, so the last two happen on a body that has nothing left.',
    ],
  },

  sg_extend_links_crux: {
    cues: [
      'At least one link carries from before the crux to after it.',
      'The crux with pump in the forearms, not fresh.',
      'Two or three burns, fifteen to twenty minutes between.',
    ],
    faults: [
      'Every link stops at the crux, so the move only ever gets tried fresh and the redpoint version is never rehearsed.',
      'Doing the crux fresh and calling it solved. If it never goes linked, that is the capacity problem the parallel session is fixing.',
    ],
  },

  sg_bottom_to_crux: {
    cues: [
      'Pick the half that is your weakness, not the half that feels good.',
      'Ground to crux, or crux to anchors. One or the other on your best burn.',
      'Two or three burns, fifteen to twenty minutes between.',
    ],
    faults: [
      'Always choosing bottom-to-crux because the top already goes, which leaves the finish untested under fatigue.',
      'Best burn spent on a warm-up lap, so the real link happens third and tired.',
    ],
  },

  sg_longest_links_reassess: {
    cues: [
      'The biggest chunks the route allows, in one or two pieces.',
      'By the end of this week, one link should contain the full crux sequence.',
      'Still falling before the crux means consider dropping a grade and banking a send.',
    ],
    faults: [
      'The reassessment rule gets read and not applied, which is how a cycle ends with no send and no link.',
      'Chunk sizes stop growing and the sessions repeat week 5, so the route never gets stitched together.',
    ],
  },

  sg_full_redpoint_burns: {
    cues: [
      'Single-attempt mode. Two or three burns from the ground, twenty to thirty minutes between.',
      'Warm up thoroughly but conserve skin and fingers for the real attempts.',
      'Every burn gets the same warm-up, the same focus, the same clipping.',
    ],
    faults: [
      'A rehearsal burn sneaks in first, which spends the best attempt of the day on a lap.',
      'Climbing at whatever time suits, on the phase where conditions start deciding the outcome.',
    ],
  },

  sg_first_one_hang: {
    cues: [
      'The whole route with one rest or fall. That is the milestone.',
      'Two burns, maybe three, full rest, best conditions.',
      'Tape a split early and stop while the fingers still feel crisp.',
    ],
    faults: [
      'Pushing a fourth and fifth burn on tired skin, which costs the next session and the one after.',
      'Taking two hangs and calling it close. The one-hang is a specific thing and it predicts the send.',
    ],
  },

  sg_refine_dont_rehearse: {
    cues: [
      'You know the moves. Now dial the clipping stances, the warm-up and the time of day.',
      'Reduce volume so every burn is fully fresh.',
      'You are removing reasons to fall, not learning anything new.',
    ],
    faults: [
      'Going back to working moves because it feels like training — rehearsal at this stage only costs skin.',
      'The warm-up never gets tested, so send day uses one that has left you either cold or already pumped.',
    ],
  },

  sg_send_window: {
    cues: [
      'Few attempts, fully rested. Thirty minutes or more between burns.',
      'Coolest, driest window of the day.',
      'Poor conditions are a reason to wait, not a reason to burn skin.',
    ],
    faults: [
      'Going anyway on a bad day because the session was in the diary, which spends skin on a low-percentage attempt.',
      'Adding volume around the burns because the session feels short. The session is meant to feel short.',
    ],
  },

  sg_capacity_laps_arc: {
    cues: [
      'RPE 3 to 4. Easy breathing and a mild pump, never more.',
      'Fifteen to twenty minutes continuous, two rounds, five minutes between.',
      'Do not stop between routes. Keep moving.',
    ],
    faults: [
      'The terrain is hard enough to pump you, which trains the wrong system and makes the session pointless rather than merely dull.',
      'Skipping it because it is boring — the linking weeks are where that bill arrives.',
    ],
  },

  sg_arc_volume_build: {
    cues: [
      'Eighteen to twenty-two minutes continuous, two or three rounds.',
      'Strictly RPE 3 to 4. Genuine pump means you are climbing too hard.',
      'Use easier terrain or bigger holds to keep moving for the whole round.',
    ],
    faults: [
      'Holding the grade and shortening the round, when the point is holding the round and dropping the grade.',
      'The last third of each round becomes survival, which is an endurance session rather than a capacity one.',
    ],
  },

  sg_arc_light_intervals: {
    cues: [
      'One ARC round first, then two or three light laps at RPE 5 to 6.',
      'Work and rest are equal. Two to three minutes each.',
      'Keep the form clean. Sloppy intervals teach bad movement under fatigue.',
    ],
    faults: [
      'The intervals drift up toward true doubles, which is next block and lands on legs that have not built to it.',
      'The ARC round gets dropped to make room for the intervals, so the bridge loses the half it is bridging from.',
    ],
  },

  sg_capacity_consolidation: {
    cues: [
      'Peak the volume: two or three rounds over twenty minutes, RPE 3 to 4.',
      'Easy and high-volume. You are banking capacity, not testing it.',
      'Finish pump-free and recovered. Next week the intensity steps up.',
    ],
    faults: [
      'Testing the base because it is the last week of it, which arrives at the linking block already tired.',
      'Cutting the volume because the intensity is low and it feels like a wasted session. This is the biggest aerobic week of the program.',
    ],
  },

  sg_rope_links_doubles: {
    cues: [
      'Lower off the first and pull straight onto the second. No ground rest.',
      'Eighty to ninety per cent of redpoint, so both routes go.',
      'Four to six minutes between sets, three or four sets.',
    ],
    faults: [
      'A chalk-up and a shake at the ground between the two, which removes the entire stimulus.',
      'Set one is clean and set four falls off the first route. Choose the grade for set four.',
    ],
  },

  sg_doubles_added_volume: {
    cues: [
      'Add a set or nudge the grade toward ninety per cent. One or the other, not both.',
      'Deeply pumped forearms with controlled movement is the target.',
      'If form collapses, drop the intensity rather than the focus.',
    ],
    faults: [
      'Adding the set and the grade in the same week, so the jump is too big and the last sets turn to flailing.',
      'Grinding out a set after the movement has gone, which trains sloppiness under pump.',
    ],
  },

  sg_rope_links_triples: {
    cues: [
      'Three routes back-to-back, no ground rest. Five to seven minutes between sets.',
      'Around eighty per cent of redpoint so all three are completable.',
      'Two or three sets. The duration of the pumped state is the point.',
    ],
    faults: [
      'Keeping the doubles grade for triples, so the third route never gets climbed and the set is really a double.',
      'Resting at the anchor between routes, which breaks the continuity the triple exists to train.',
    ],
  },

  sg_triples_peak_volume: {
    cues: [
      'Three or four sets. The highest power-endurance volume of the program.',
      'Pumped but precise. Exhausted and sloppy is a different session.',
      'If the climbing turns to flailing, drop a route rather than grind out junk laps.',
    ],
    faults: [
      'Finishing the planned sets after the movement has gone, so the peak week banks fatigue rather than capacity.',
      'Treating this as a week to push harder terrain — the volume is the progression, and the grade stays.',
    ],
  },

  sg_redpoint_bursts: {
    cues: [
      'A route at your redpoint grade, not the project.',
      'One all-out burn, twenty minutes of full rest, then one or two more.',
      'Each burn is maximal and each rest is real. This is not a circuit.',
    ],
    faults: [
      'Cutting the rest because twenty minutes feels idle, which turns the burst session back into power endurance.',
      'Using the project, so the session becomes projecting and the recovery-to-peak cycle never gets rehearsed.',
    ],
  },

  sg_burst_intensity: {
    cues: [
      'One or two maximal burns, twenty minutes or more of recovery between.',
      'Total volume stays low. Intensity is the whole point.',
      'Go to the limit, recover, and go again. That is the send-day pattern.',
    ],
    faults: [
      'Adding a third and fourth burn, which converts the sharpening week into a fatigue week.',
      'Warming up so much that the first maximal burn is the fourth hard thing of the day.',
    ],
  },

  sg_taper_begins: {
    cues: [
      'Half the volume, the same intensity.',
      'One or two crisp bursts, full rest, then stop.',
      'Leave feeling like you could have done more.',
    ],
    faults: [
      'Dropping the intensity along with the volume, which sheds the sharpness the taper is meant to keep.',
      'Adding a session back because the week feels empty, which is the fatigue the taper exists to shed.',
    ],
  },

  sg_send_support: {
    cues: [
      'Ten to fifteen minutes of easy continuous climbing, or one easy burst.',
      'Just enough to stay primed. No more.',
      'Deep in send attempts on the project? Skip it entirely.',
    ],
    faults: [
      'Turning the flush into a session because it feels like a wasted day, which takes fitness out of the redpoint.',
      'Doing it the day before a send attempt on tired forearms, when skipping it was the instruction.',
    ],
  },

  // ── Peak Performance ──────────────────────────────────────────────────

  pp_limit_four_burns: {
    cues: [
      'Twenty to thirty minutes of warm-up, to full temperature.',
      'Four burns per project, five minutes between. Ten or more between projects.',
      'Form visibly breaking on two burns in a row ends that project.',
    ],
    faults: [
      'Burns three and four get flailed through because two nearly worked, which trains the sloppy pattern at max load.',
      'Rests shrink as the session runs on, so the last hour is power endurance at a limit grade.',
    ],
  },

  pp_style_diverse_limit: {
    cues: [
      'Slab, vertical, overhang, roof. Four different styles, not four boulders.',
      'Three or four burns each, five minutes between.',
      'Note which style felt worst. It feeds the next technique day.',
    ],
    faults: [
      'Three overhangs and a vertical, chosen because they looked best in the warm-up — breadth is the drill.',
      'The worst style gets abandoned after one burn, which is the style with the most to give.',
    ],
  },

  pp_crux_isolation: {
    cues: [
      'Pre-rig the sequence and try the crux alone, five to eight attempts.',
      'Three to four minutes between isolation attempts.',
      'Then one full run. Isolation builds it, the full run integrates it.',
    ],
    faults: [
      'Running the full boulder between every isolation attempt, so the crux always arrives tired and never improves.',
      'Skipping the full run at the end, which leaves a stronger move that has never been climbed into.',
    ],
  },

  pp_deload_flow: {
    cues: [
      'Forty-five to sixty minutes at RPE 6 on V5 to V7.',
      'No limit work and no projects.',
      'Sleep and eat well. Tendon adaptation is what the week is for.',
    ],
    faults: [
      'One limit go at the end because the body feels good, which is the week Intensify is built on.',
      'Dropping the session entirely instead of climbing easy — the movement keeps the patterns, the intensity is what goes.',
    ],
  },

  pp_intensify_five_burns: {
    cues: [
      'Three projects, five burns each, five minutes between.',
      'This is the hardest climbing week of the program so far.',
      'Burn five worse than burn one means stop that project.',
    ],
    faults: [
      'Finishing all five on every project regardless, so the added fatigue buys nothing and costs the next session.',
      'Choosing projects that went last block, which makes the peak volume week the easiest one.',
    ],
  },

  pp_boulder_link_ups: {
    cues: [
      'Each problem twice, back to back, no rest between the two.',
      'One to two grades below max so the second lap is climbable.',
      'Three sets per problem, five minutes between sets.',
    ],
    faults: [
      'A chalk-up between the two laps, which removes the pump the drill is built around.',
      'Picking problems at max, so the first lap is the session and the second never happens.',
    ],
  },

  pp_hard_flash_day: {
    cues: [
      'Five or six boulders one to two grades below max. No second burns.',
      'Read the sequence carefully before you leave the ground.',
      'Warm up fully first. A flash day punishes a cold start.',
    ],
    faults: [
      'A second go on the one that nearly went, which is projecting and voids the test.',
      'Choosing boulders you have watched other people climb, so the reading half was done for you.',
    ],
  },

  pp_deload_flash_volume: {
    cues: [
      'Twenty to twenty-five moderate boulders, two to three grades below max.',
      'One to two minutes between. Keep moving.',
      'No limit work at all.',
    ],
    faults: [
      'Grade drift through the session until minus three becomes minus one, which turns mileage into a session to recover from.',
      'Cutting the volume because the grades are easy. The volume is what keeps the patterns grooved.',
    ],
  },

  pp_critical_taper: {
    cues: [
      'Thirty-five per cent less volume. Four or five boulders at a moderate grade.',
      'Muscles adapt in weeks and tendons in months. The muscles are lying to you.',
      'Non-negotiable. Skip it and the peak sends become peak injuries.',
    ],
    faults: [
      'Skipping it because the first deload already happened and the body feels ready. Feeling ready is the symptom.',
      'Keeping the volume and dropping only the grade, which is not what thirty-five per cent means.',
    ],
  },

  pp_peak_projecting: {
    cues: [
      'One project. Six burns, six to eight minutes between.',
      'Longer rests than usual, because this is about send quality rather than accumulation.',
      'Visualise the sequence before you leave the ground, every time.',
    ],
    faults: [
      'Shortening the rests back to five minutes, which trades the quality the phase exists for.',
      'The note says fell at the crux. Where is not why.',
    ],
  },

  pp_send_window: {
    cues: [
      'Four or five burns maximum, eight to ten minutes between.',
      'Eight hours of sleep the night before.',
      'No send today is fine. Week 12 exists.',
    ],
    faults: [
      'A sixth and seventh burn because the fifth was close, which spends the week that was held in reserve.',
      'Junk volume before the burns, which spends the session the twelve weeks were for.',
    ],
  },

  pp_graduation_retest: {
    cues: [
      'Split the week: one session to retest, one to send.',
      'Same edge, same bar, same rest as Week 0.',
      'Three full rest days after, before any new program.',
    ],
    faults: [
      'Retesting and sending in the same session, so whichever comes second measures a tired climber.',
      'Rolling straight into the next program on peak-cycle fatigue, which is how a good block ends in an injury.',
    ],
  },

  pp_movement_inventory: {
    cues: [
      'Six to eight sub-max boulders, climbed to notice rather than to send.',
      'Where do the feet slip, which hands feel weak, which positions feel awkward?',
      'Write two or three weaknesses down. That is the deliverable.',
    ],
    faults: [
      'Fixing things as you notice them, which is the next two weeks and not this one. This session diagnoses.',
      'Finishing with no notes, so weeks 3 and 4 have nothing to target.',
    ],
  },

  pp_video_review_day: {
    cues: [
      'Film four or five boulders one to two grades below max.',
      'Watch back between attempts, not afterwards.',
      'One focus per boulder. Early arm-bend, hips off the wall, or foot hesitation.',
    ],
    faults: [
      'Watching for how it looked rather than for one fixable thing, so the next attempt is identical.',
      'Filming everything and reviewing it at home, which removes the only chance to change anything.',
    ],
  },

  pp_weakness_drilling_1: {
    cues: [
      'One weakness. Four or five sub-max boulders that expose it.',
      'Each climbed two or three times with deliberate attention.',
      'Three minutes between burns.',
    ],
    faults: [
      'Drilling two weaknesses at once, which halves the dose on both.',
      'Choosing boulders you climb well, so the weakness never actually gets exposed.',
    ],
  },

  pp_weakness_drilling_2: {
    cues: [
      'The second weakness, same structure as week 3.',
      'Two weeks per weakness is the minimum dose for the change to stick.',
      'Both already fixed? Pick a third rather than repeating the first.',
    ],
    faults: [
      'Going back to weakness one because it felt productive, which leaves the second one untouched.',
      'Deciding a weakness is fixed after one session. One session is a good day.',
    ],
  },

  pp_footwork_under_fatigue: {
    cues: [
      'Eight to ten boulders two to three grades below max, on deliberately small feet.',
      'Between boulders: ten push-ups and twenty seconds of hollow body.',
      'The fatigue is the point. Precision arrives before it or not at all.',
    ],
    faults: [
      'Skipping the push-ups because they interrupt the climbing, which removes the entire premise.',
      'Taking bigger feet as the session goes on, so the drill gets easier exactly where it should bite.',
    ],
  },

  pp_silent_feet_hover: {
    cues: [
      'Feet make no sound. If you hear it, that placement did not count.',
      'Two to three seconds hovering above the hold before you place.',
      'Six to eight boulders, two grades below max. Slower than you are used to.',
    ],
    faults: [
      'The hover shortens as the forearms load, and the last placements of a boulder are taps.',
      'Feet get quiet and the hover goes, or the reverse. Losing one turns it into a drill you have already done.',
    ],
  },

  pp_body_position_puzzles: {
    cues: [
      'Four or five boulders with contested positions: heel-toes, drop-knees, layback cruxes.',
      'Climb each three times with a different variation.',
      'Log which variation worked. The log is the point.',
    ],
    faults: [
      'Climbing it the same way three times because the first way worked, which trains no flexibility at all.',
      'Trying variations and noting none, so nothing survives the session.',
    ],
  },

  pp_deload_style_library: {
    cues: [
      'Ten to fifteen boulders, V5 to V7, across every style.',
      'No projects, no focus. Varied mileage on solid terrain.',
      'Broad recovery for the nervous system, vocabulary kept.',
    ],
    faults: [
      'One project go because the terrain is right there, which is the whole thing the week says no to.',
      'Ten boulders in one style, which recovers just as well and maintains nothing.',
    ],
  },

  pp_integration_day: {
    cues: [
      'Four to six boulders at your old flash level. They should feel different.',
      'Apply silent feet and the body-position work from phase 2.',
      'Every send should feel cleaner than it used to. That is the measurement.',
    ],
    faults: [
      'Pushing the grade because the old flash level feels easy, which is the point being missed rather than proved.',
      'Climbing them the old way, so nothing from phase 2 gets integrated and the day just banks volume.',
    ],
  },

  pp_flow_projecting_prep: {
    cues: [
      'Fifteen to twenty boulders, three grades below max, at speed.',
      'RPE 5 to 6. Fluid rather than careful.',
      'Fewer mental cues. This is the session where you stop thinking.',
    ],
    faults: [
      'Climbing them precisely and slowly, which is a different drill and leaves the motor patterns at the old speed.',
      'The grade creeps up until speed is impossible, and the session becomes ordinary volume.',
    ],
  },

  pp_light_maintenance: {
    cues: [
      'Eight to ten easy boulders. Heart rate up, volume down.',
      'Keep the nervous system awake without adding fatigue.',
      'Feeling fresh? Skip it entirely and rest.',
    ],
    faults: [
      'Turning a maintenance session into a workout because it felt too easy, which takes something out of the send attempts.',
      'Doing it the day before a send attempt when skipping it was the instruction.',
    ],
  },

  pp_graduation_assessment: {
    cues: [
      'Five boulders, five different styles, one to two grades below max.',
      'Rate attempt quality nought to ten, independent of send or fail.',
      'Log whatever still feels weak. It picks your next program.',
    ],
    faults: [
      'Scoring by outcome, which is the one thing the rating exists to decouple.',
      'Choosing five boulders in your best style, so the assessment measures the half you already knew about.',
    ],
  },

  pp_project_selection: {
    cues: [
      'One or two projects at your max grade, five or six attempts each.',
      'Sixty seconds of visualisation with the eyes closed between attempts.',
      'Can you do each move? Linking is not this week.',
    ],
    faults: [
      'Trying to link because the moves went well, which spends the session and leaves the hard moves undecoded.',
      'The note says fell low down. Which move, and why, is what week 2 needs.',
    ],
  },

  pp_link_building: {
    cues: [
      'Start two or three moves before the crux and top out two or three after.',
      'Five or six attempts, five to eight minutes between.',
      'The goal is consecutive moves, not the send.',
    ],
    faults: [
      'Going for the full redpoint because a link felt good, which turns every attempt into a low-percentage go from the ground.',
      'Links that always start after the crux, so the crux is only ever climbed fresh.',
    ],
  },

  pp_top_down_redpointing: {
    cues: [
      'Send the top section first, from the last rest through the top-out.',
      'Then start one move lower and send it again.',
      'Six to eight attempts, and quality decides when to stop.',
    ],
    faults: [
      'Extending down two or three moves at a time because progress feels slow, so no section is ever actually owned.',
      'Skipping to full attempts once the top goes, which loses the ending-confidence the drill was building.',
    ],
  },

  pp_deload_session_review: {
    cues: [
      'No projecting. One to two grades below the project.',
      'Read every crux note from weeks 1 to 3.',
      'Decide: keep this project for Intensify, or swap. Log the decision.',
    ],
    faults: [
      'The review gets skipped because the climbing was the plan, so the decision gets made by default in week 5.',
      'One go on the project to see how it feels, which is the week not happening.',
    ],
  },

  pp_full_redpoint_attempts: {
    cues: [
      'Five or six burns, six to eight minutes between.',
      'Eyes closed, full sequence, sixty seconds minimum before every burn.',
      'Visualise, climb, note, rest. Every loop, every time.',
    ],
    faults: [
      'A note that says fell on the crux rather than left foot cut on the second-to-last move because I did not flag.',
      'Visualisation gets skipped on the burn you feel readiest for, which is the burn it would have helped most.',
    ],
  },

  pp_mental_game_commitment: {
    cues: [
      'Do the scary move on a lower-stakes version until it is automatic.',
      'Then two or three false starts: full power, deliberately not grabbing.',
      'Only then go for the send.',
    ],
    faults: [
      'Going straight to send attempts because the move is physically easy, which leaves the hesitation exactly where it was.',
      'The false starts get done at half power, so they prove the fall is safe from a height you were never going to fall from.',
    ],
  },

  pp_conditions_day: {
    cues: [
      'Cool, dry, uncrowded. Time the session around the conditions.',
      'Four to six burns, eight to ten minutes between. Fewer and better.',
      'No send? Log fell on X move because Y. That is what deload 2 plans around.',
    ],
    faults: [
      'Going at the convenient hour on the one session built entirely around conditions.',
      'Leaving without a specific note, so the strategy review two weeks later has nothing to work with.',
    ],
  },

  pp_deload_strategy_review: {
    cues: [
      'No projecting. Low intensity, and an honest look at the progress.',
      'Links consistent? Double down. Links not moving? Switch to another project at the same grade.',
      'Overcommitting to a plateau project is how send cycles fail.',
    ],
    faults: [
      'Keeping the project out of sunk cost, which is the exact failure the session exists to catch.',
      'Switching after one bad session rather than on the pattern in the notes.',
    ],
  },

  pp_deload2_light_session: {
    cues: [
      'No projecting. Short and easy, one to two grades below max.',
      'The project is waiting. The tendons are catching up.',
      'One week of restraint here saves three weeks of injury.',
    ],
    faults: [
      'Treating the second deload as optional because the first one already happened. Tendons work on a different clock to muscles.',
      'A single project burn at the end, which is the whole week undone in ten minutes.',
    ],
  },

  pp_peak_session_1: {
    cues: [
      'Six to eight burns, eight to ten minutes between.',
      'Rate every attempt nought to ten on execution, independent of send or fail.',
      'Clear goal, immediate feedback, nothing else in your head.',
    ],
    faults: [
      'A sloppy send scores ten and a perfect attempt that fell scores four. It is the other way round.',
      'Rests shrink as the session goes on, so burn eight has nothing behind it.',
    ],
  },

  pp_send_attempts_quality: {
    cues: [
      'Four to six burns maximum, ten to fifteen minutes between.',
      'Forty minutes of warm-up, not thirty.',
      'Eight hours of sleep the night before. It counts as preparation.',
    ],
    faults: [
      'Warming up on the project, so the first real burn is the third hard effort of the day.',
      'Extra burns because the window feels short. It continues into week 12 by design.',
    ],
  },

  pp_final_attempts: {
    cues: [
      'Send it, or bank the beta and graduate. Both are outcomes.',
      'Complete the assessment retest in your other session this week either way.',
      'Three full rest days before any new program.',
    ],
    faults: [
      'Skipping the retest because the project did not go, which loses twelve weeks of measurement to one afternoon.',
      'Rotating straight into the next program on peak-cycle fatigue, which compounds into an injury.',
    ],
  },
};

export function drillCoaching(id: string): DrillCoaching | undefined {
  return DRILL_COACHING[id];
}
