/**
 * What each drill is, in a paragraph (PLAN.md M137).
 *
 * The 156 descriptions gzip to about sixteen kilobytes — a tenth of the
 * entry chunk — and lived on every cold start because the drill registry is
 * entry-chunk by construction: `derive`, `plan`, `plateau` and `challenges`
 * all call `getDrill` synchronously. Nothing on the boot path reads the
 * paragraph itself; the pages that do are lazy routes and import this file,
 * and the search sheet fetches it when it opens, the way the glossary has
 * been fetched since M65. The one engine that read the text — the injury
 * scan — reads `Drill.loads` instead, derived from these words and pinned
 * to them by `drillText.test.ts`.
 *
 * Keyed by drill id, in the order of the drill files. The cues and faults
 * are in `drillCoaching.ts` for the same reason.
 */

import { getDrill } from './drills';
import type { DrillId } from './types';

export const DRILL_TEXT: Readonly<Record<string, string>> = {
  // ── Base Camp (drills/baseCamp.ts) ──
  sticky_feet:
    'Climb 6-8 V0-V2 boulders at RPE 4-5. Rule: once a foot is placed on a hold, it does NOT move until you step to the next hold. No readjusting, no pivoting, no "just a nudge." Forces you to commit to foot placement before weighting — the root habit of precise climbing. If you catch yourself adjusting, downclimb and restart.',
  flagging:
    'Climb 6-8 moderate boulders. On every reach with your RIGHT hand, flag your LEFT leg behind you (outside flag or back flag) to counterbalance. Same for left-hand reaches with the right leg. Flagging prevents the barn-door swing that cuts feet. Climb slower than usual to think through each reach.',
  hover_hands_3s_pause:
    'Before placing each hand on a hold, hover it above the target for a 3-count. Stay still — no micro-adjustments, no eyeing the next move. Place precisely, commit, move on. Forces static body position under load and trains the nervous system to find the quiet position between moves.',
  the_trifecta_all_three:
    'Combine Sticky Feet + Flagging + Hover Hands on every climb. 6-8 boulders, V-easy. This is the hardest drill week because all three constraints compound — a session finishes slower than normal. Quality over quantity: one beautifully climbed boulder beats five messy ones.',
  endurance_intervals_4x4:
    'Pick 4 boulders you can flash (2 grades below your max). Climb all 4 back-to-back with no rest between boulders. Rest 3 min. Repeat for 4 rounds = 16 climbs total. Heart rate stays elevated, forearms learn to recover while climbing. If you can’t complete a round, downgrade one boulder and continue.',
  volume_build_mini_assessment:
    'First half: retest Max Push-Ups, Max Pull-Ups, Dead Hang. Log to Assessment. Second half: climb 20-30 boulders at Flash grade minus 1. Keep Quiet Feet discipline throughout. This week is your first measurable check-in against Week 0 baselines.',
  continuous_circuit_5_10_min:
    'Build a route by traversing along the easy wall. Climb continuously for 5 minutes without stepping down. Rest 3 min. Repeat 3-4 times, adding 30s to each round. Trains aerobic endurance and pump management. Focus on resting on good holds mid-climb — the ability to rest on the wall is a learnable skill.',
  deload_flow_rpe_5:
    'Intentional easy week. Climb 30 min at RPE 5 on terrain 2+ grades below max. No drills, no constraints — just fluid, relaxed climbing. Recovery week before the mental-game phase. Sleep matters more than the session. Reduce all Engine Room sets to 2.',
  box_breathing_projecting:
    'Pick a project 1-2 grades above your flash level. Before every attempt, do 4 rounds of box breathing: inhale 4s, hold 4s, exhale 4s, hold 4s. Slows the heart rate, focuses attention, and builds the pre-attempt ritual. 3-5 attempts total, 5 min rest between. The breathing is the drill, not the send.',
  intro_to_dynos:
    'Pick 3-4 juggy V0-V2 boulders. Instead of reaching for each hold, generate momentum and commit to a small dynamic move. Start with mini-pops (both feet stay on) and progress to full deadpoints. This is the FIRST exposure to dynamic movement — form over distance. If you feel any shoulder tweak, stop and switch to static.',
  send_week_foundations:
    'Pick the hardest project you’ve been eyeing. Apply everything: Quiet Feet, Flagging, Hover Hands when possible, Box Breathing before each attempt. 3-5 quality burns, 5-10 min rest between. This is your first performance peak. If you send, try the next grade up. If you don’t, the beta is banked for next cycle.',
  graduation_retest_foundations:
    'Repeat every Week 0 baseline: Max Push-Ups, Max Pull-Ups, Dead Hang, Core Plank, Flash Grade, Capacity Test (4x4). Log everything — this is your graduation scorecard. Compare to Week 0 numbers; the data rules the story.',

  // ── Gravity Defied (drills/gravityDefied.ts) ──
  vertical_deadpoint:
    'Pick 3-5 problems with a clear straight-up dyno move. Sink hips LOW, arms stay straight. Explode using legs — do NOT pull with arms first. At the top of the arc (the deadpoint), do NOT grab — just slap or hover over the target hold. RPE 6-7. If your elbows bend before your hips leave the wall, restart. The arms are ropes, not motors.',
  lateral_momentum:
    'Traverse dynamically on juggy terrain. The trailing leg is your engine — push sideways off it to swing hips in the direction of the next hold. Cue: "push with the foot." Hips lead, hands follow. 4-6 traverse problems, 2-3 reps each. Do not muscle the reach; redirect momentum.',
  double_clutch:
    'On dyno-friendly boulders, launch and CLAP hands mid-air before latching the target hold. The clap forces full commitment — you cannot half-attempt a move while clapping. 3-5 problems, RPE 6-7. Drops the safety net that keeps dynos feeling underpowered.',
  the_pogo:
    'Set up with one foot on a hold, the other free. Swing the free leg back, then KICK forward and up to generate momentum. The kick happens BEFORE the pull. This is the "free-leg engine" most boulderers ignore. 4-6 attempts per side on moderate terrain.',
  step_up_dyno:
    'Put weight over a high foothold. Press through the HEEL to drive up — this recruits the glute instead of the quad. 3-4 problems with high-step dyno sequences. The press should feel like standing up from a deep single-leg squat with a launch at the top.',
  the_paddle_bumping:
    'Dyno to an intermediate hold, then BUMP to the finish hold in under half a second. Do not hang on the intermediate — it is a stepping stone. Trains contact strength plus the ability to re-launch from a partially loaded position. 3-4 problems with bumpable sequences.',
  run_and_jumps:
    'Run alongside the wall, step on volumes, catch a high hold. Commits you to a fully dynamic attack with both feet airborne mid-attempt. Landings matter — absorb with knees and hips, hands off the ground. 3-5 attempts, only on juggy finish holds.',
  deload_target_practice:
    'Intentional easy week to let the CNS recover from 7 weeks of high-force work. Reduce all dyno attempts 30%. On each attempt, touch the target hold with your INDEX FINGER specifically — the accuracy constraint forces light touches. No limit attempts. Sleep is the training this week.',
  the_coordinate:
    'Chain TWO or more dynamic moves you have learned in Phase 1-2 on a single boulder. Sequence momentum — exit of move 1 becomes the setup for move 2. This is where drills become real climbing. 2-3 problems, 3-5 attempts each.',
  the_full_send:
    'On overhangs, toes grip like talons and pull the wall TOWARD you as the hands leave. Maintain toe-tension through the air. For the catch, hand and foot contact the new holds at the exact same moment — arrests swing. 3-4 attempts on overhanging projects.',
  integration_project_week:
    'Pick a limit boulder requiring at least one dynamic move you have drilled this program. Apply the Commitment Switch: first 3 attempts explode 100% but do NOT latch — tap and control landing. Attempts 4+: same power, open hand, latch. 4-6 quality burns, 5 min rest between.',
  graduation_flight_test:
    'Retest Box Jump Height, Explosive Pull-Ups, Dead Hang, and Max Dynamic Grade. Then attempt a graduation boulder: a V4-V5 requiring 2+ dynamic skills, or 1-2 grades above your starting flash. Log everything. This is your scorecard vs Week 0.',
  limit_dynos_four_burns:
    'Warm up 25-30 min — dynamic movement needs full tissue temperature and primed shoulders. Pick 3-4 boulders at your limit that force a committing dynamic move (deadpoint, dyno, or big throw). 4 quality burns each, 4-5 min rest between burns, 8+ min between problems. Log the hardest dyno you attempt and whether you stick the landing. End a problem after two ugly burns in a row — sloppy dynamic climbing trains bad motor patterns and risks your ankles on the fall.',
  style_diverse_dynamic_day:
    'Pick 4-5 limit problems that each demand a DIFFERENT dynamic style — one straight-up deadpoint, one lateral swing, one paddle or bump, one all-out commitment throw. 3-4 burns each. The point is breadth: your launch and catch have to work in every direction, not just your favourite one. Rate landing quality honestly — a caught-but-barn-door catch is not a clean send.',
  crux_isolation_hard_move:
    'Pick ONE dynamic project just beyond your level. For the first 30 min, isolate the crux move off the start holds or a pad — drill the launch and catch in isolation: hip drive, timing, body tension on the catch. Then link it into the full problem. This is move-mastery under maximal force, not volume. Rest fully (5+ min) between real attempts; quality beats quantity here.',
  deload_flow_dynos:
    'Deload week — drop intensity hard. 5-6 boulders well within your limit that still move dynamically, at RPE 5-6. Focus purely on smooth, precise launches and soft, controlled landings. No projecting, no max throws. The catch tissues (shoulders, fingers) and your nervous system need this week to absorb the first block. Climb, do not grind.',
  intensify_five_burns:
    'The hardest dynamic block. Pick 3 limit problems with committing dynamic cruxes, 5 quality burns each, 5 min rest between burns. Push the grade you attempt above Block 1. Your catches should feel noticeably more secure than four weeks ago. Log the hardest dyno you send — you should be banking sends now, not just attempts.',
  dynamic_link_ups:
    'Pick 2-3 moderate problems (1-2 grades below limit) that chain back-to-back dynamic moves. Climb each TWICE back-to-back with no rest, 3-4 sets, 4 min rest between sets. This builds the power-endurance to throw a second and third dyno when already pumped — the thing that ends most dynamic boulders. Form first; if the catches turn to flails, the set is done.',
  the_hard_flash_day:
    'Pick 5-6 unfamiliar dynamic problems one grade below your max and try to FLASH each — read the dynamic beta from the ground and commit fully on the first go. Dynamic climbing punishes hesitation, so this trains reading momentum and committing without rehearsal. 2 attempts max per problem, then move on. Log how many you flash clean.',
  deload_soft_catches:
    'Second deload — line it up with your Technique deload for a true rest week. 5-6 easy problems at RPE 5, dynamic but well within limit. Treat every catch as a precision rep: exact hand placement, quiet landing, no swing. This is the last reset before the performance phase. Sleep and eat like it is part of the training, because it is.',
  peak_projecting_six_burns:
    'Performance phase. Pick 2-3 of your hardest dynamic projects, 6 burns each, full 5+ min rest. You are strong and recovered now — this is where the block’s hardest dynamic sends happen. Treat every burn like the send: precise warm-up, full commitment, soft landing. Log the hardest dyno you attempt; it should be a personal best.',
  send_window:
    'Prime conditions, prime effort. Pick your single best dynamic project and give it real send burns — 4-6 attempts with long rest and no junk volume around them. Warm up thoroughly but conserve; the goal is the send, not a workout. Send it early? Bank it and move to the next project. Log the send and the landing quality.',
  consolidate_and_convert:
    'Convert the gains. Revisit 2-3 dynamic problems that were at your limit four weeks ago — they should go cleanly now. Then push one grade harder on a fresh dynamic project. This proves the block worked and resets your baseline. Keep volume moderate; you are sharpening, not breaking down before the test.',
  graduation_send_test:
    'Graduation. Warm up fully, then attempt the hardest dynamic boulder you can — your performance flight test. Whether you send or just bank the beta, log your hardest dyno attempted and sent for the program. Compare to Week 1: a one-to-two-grade jump in dynamic sending is a strong result. Celebrate the send, then choose your next program.',

  // ── Iron Grip (drills/ironGrip.ts) ──
  limit_boulders_on_the_crimps:
    'Pick 3-5 crimpy boulders at your limit minus 1 grade. Climb each 2-3 times, resting 3-5 min between burns. Focus on precise crimp placement and purposeful body position. If you feel any finger tweak, STOP — Repeater phase should not push into pain.',
  volume_on_moderate_crimps:
    '20-25 moderate boulders (2 grades below max) with crimp holds. Move through them steadily, rest 1-2 min between. Builds tendon tolerance and crimp-position mileage. The Anvil phase is about time-on-the-edge — this accumulates it.',
  projecting_with_crimp_focus:
    'Pick 2-3 limit projects featuring crimp moves. Bias your beta toward crimp holds even when pinch or jug alternatives exist — this is the applied version of the hangboard work. 4-6 burns per project, 5 min rest.',
  deload_flow_session:
    'End of Phase 1. Intentional easy week — no crimp focus, no limit attempts. Climb 30-45 min at RPE 5 on juggy terrain. Sleep and protein matter more than the session. The Hammer phase is about to demand everything; arrive fresh.',
  power_endurance_circuit:
    'Pick 4-6 boulders at 2-3 grades below your max. Climb them back-to-back with no rest, then rest 4 minutes. Repeat 3-4 sets. Builds the ability to pull hard repeatedly — where your new max hangs will actually pay off in real climbing.',
  limit_bouldering_sessions:
    'Peak intensity climbing. Pick 2-3 projects at or above your max grade. 5-8 burns per project with 5+ min rest. This is where Phase 2’s max hang gains show up. Take a full rest day after — Max Hang sessions and limit climbing together is heavy CNS load.',
  the_crimp_project:
    'Find a project that scared you 6 weeks ago because of its crimps. Attempt it now — burn after burn, 5-10 min rest. You may not send. You will be shocked at how different it feels. Collect beta, note the crux, set a plan for Phase 3.',
  deload_max_hang_day_off_flow:
    'End of Phase 2. Very easy climbing only. No hangboard this week. Sleep + food > sessions. Campus board is about to enter the picture — your fingers need to be fully recovered.',
  contact_strength_projecting:
    'Pick 2-3 max-grade projects with dynamic moves — dyno, paddle, deadpoint. Focus on projecting the crux — the single hardest move — with long rests (5+ min). This is where campus-board power meets real rock. Quality over quantity.',
  crimp_pull_power_application:
    'Campus board recruits fast-twitch; the wall is where you cash it in. Pick 3-4 boulders with BOTH small crimps AND dynamic moves. Burn them hard — 3-5 attempts each, full rest. Film yourself if possible; campus-phase form breaks quickly.',
  send_week_crimp:
    'Peak performance of the program. Pick your hardest crimp project and commit the week to sending it. 2 sessions of 4-6 quality burns each with long rest. Box Breathe before each attempt. This is what 12 weeks of finger work paid for.',
  graduation_retest_fingers:
    'Retest every Week 0 baseline: Max Hang at 20mm, Weighted Pull-Ups 3RM, 90° Lock-Off, Core Lever progression, Max Pull-Ups, Dead Hang. Log everything. Then rest 3 full days before any climbing — transition to deload maintenance.',

  // ── Lockdown (drills/lockdown.ts) ──
  quiet_feet_hover_hands:
    'Before placing each hand on a hold, hover it above the target for a 3-count while staying still. Then place precisely. Forces slow, static climbing and perfect body positioning. Do for 6-8 V-easy boulders, rest 2 min between.',
  drop_knee_isolation:
    'On overhanging V-easy boulders, find every opportunity to drop-knee. Rotate the inside knee down toward the wall, which rotates the hip into the wall and extends your reach. Do not skip holds — use drop-knees even where a square hip would work. 4-6 problems, focus on hip rotation, not arm pull.',
  heel_hook_commitment:
    'Pick 5-6 problems with intentional heel-hook holds (or create them on juggy traverses). On every heel hook, fully weight the heel — pull yourself INTO the wall using the heel before reaching. Do not just use the heel for balance; use it as a second hand. Forces the hamstring and glute engagement climbers typically skip.',
  static_trifecta:
    'Combine the last three drills on every climb: Quiet Feet on every foot placement, 3-second Hover before every hand, drop-knee wherever possible. Slower session than normal — that is the point. Quality over quantity. 4-5 problems, V-easy.',
  lock_off_holds_on_wall:
    'Climb a V-easy to V-moderate problem. On every OTHER move, pause in the lock-off position for 3 seconds before reaching. Builds in-position isometric capacity and the habit of setting the body before the hand moves. 4-6 problems, 2 min rest. Match intensity to how fresh the arms feel.',
  twist_lock_practice:
    'On overhanging problems, turn your body into the wall so your hip is parallel to the wall instead of square. The twist-lock is the key to reaching long on roofs and steep sections without cutting feet. 5-6 problems, focus on rotating through moves, not pulling through them.',
  static_projecting:
    'Pick a project 1-2 grades above your flash on static terrain. NO dynamic moves allowed — every move static and controlled. If you cannot do a move statically, find a static beta or skip the problem. Exposes which moves require real static strength. 3-5 attempts, 5 min rest.',
  deload_the_flow_session:
    'Intentional easy week. Climb 30 minutes at RPE 4-5 on terrain 2+ grades below your limit. No drills, no constraints — just smooth, relaxed static movement. Recovery matters more than stimulus this week. Skip if you are feeling fresh; your CNS will thank you.',
  no_match_climbing:
    'Pick V-easy to V-moderate problems. Climb them without matching hands on any hold — every move must be a controlled reach to the next hold with the OTHER hand. Forces precise sequencing and commits the body to each move. 5-6 problems, full rest between.',
  offset_pull_practice:
    'On overhanging terrain, find moves where you can intentionally leave ONE hand low and reach far with the other — the offset pull. Builds one-armed pulling strength in a real climbing context. 4-5 problems, 2-3 offset pulls each, rest 3 min between problems.',
  project_week_static:
    'Pick your hardest static project. Apply everything: Quiet Feet, Hover Hands, Drop-Knees, Twist-Locks where they fit. 4-6 quality burns, 5-10 min rest between. This is your first performance peak on static strength. Send or bank the beta for next cycle.',
  graduation_retest_static:
    'Retest every Week 0 baseline: Density Hang (BW and +10lbs), 90° Lock-Off, Max Pull-Ups, Hollow Body, Max Static Grade, Wrist Extensors. Log everything. Your strength gains here are what qualify you for Iron Grip’s weighted hangboard work.',

  // ── The Long Game (drills/longGame.ts) ──
  tlg_arc_2x10:
    'Aerobic Restoration and Capillarization. Climb continuously for 10 minutes at RPE 3-4 — easy breathing, sustained MILD pump. No sends, no peak effort. Traverse or lap easy routes 3-4 grades below your on-sight. Rest 5 min. Climb 10 more minutes. ARC does not feel like training — that is the point. The adaptation is vascular. If you pump out, you went too hard.',
  tlg_arc_2x15:
    'Same ARC protocol, extend continuous duration to 15 minutes per round. Skill focus this week: straight arms throughout, breathe out on every move. Practice shaking out every 5-8 moves EVEN WHEN FRESH — shaking is a skill you groove now, not a reaction.',
  tlg_arc_2x20:
    'Peak Phase 1 ARC duration. 20 minutes of continuous climbing, rest 5 min, 20 more. Terrain stays 3-4 grades below on-sight. Skill focus: clip practice from 3 different stances per round. Notice which stances feel stable and which force you to pump out — that is beta for your future projects.',
  tlg_deload_arc_movement:
    'End of Base phase. Reduce ARC to 2x12 min at VERY easy intensity. Focus entirely on perfect movement — quiet feet, read two moves ahead, exhale on every reach. Recovery matters more than stimulus this week. Skip if you feel fresh and need to train; add extra sleep if you do not.',
  tlg_linked_laps_doubles:
    'Phase 2 begins. Pick 2 routes at 80-90% of your redpoint grade. Climb the first, lower, pull immediately onto the second, climb it. Rest 4 minutes. Repeat 3-4 sets. Now you WILL pump — the training is keeping functional while pumped. Phase 1 taught you not to pump; Phase 2 teaches you to climb through it.',
  tlg_4x4_route_intervals:
    '4 moderate routes (2 grades below redpoint) back-to-back with ZERO rest between them. That is one set. Rest 4 min. Repeat 3-4 sets. Brutal forearm-buffering stimulus. If you drop off a route mid-set, the set is over — lower, rest, restart the full set.',
  tlg_the_pump_clock:
    'Climb until you feel pump onset — note the time. Shake out for 10 seconds (timed). Continue climbing. Your goal this session is to EXTEND the time-to-pump window by 20-30%. Try 3 rounds. Teaches active recovery while climbing and builds shakeout efficiency.',
  tlg_deload_arc_2x10:
    'End of Engine phase. Reduce all intervals to 2 sets maximum. Or just ARC 2x10 easy minutes. Sleep and nutrition are the training this week. Phase 3 needs you fresh — send attempts do not happen in fatigued forearms.',
  tlg_linked_laps_shakeout:
    'Phase 3 begins. Short maintenance version of Phase 2 intervals — 2 sets only of linked doubles. Then 10 minutes of intentional shakeout practice on a fresh route: climb, shake, climb, shake. Time each shakeout to 10-15s per arm. Precise shakeouts can save an attempt.',
  tlg_maintenance_linked_laps:
    'Same 2-set linked laps. Film at least one attempt — watch back between sets for pacing, clipping, and hang points. Your phase 2 engine is now your toolkit; you are refining how you use it, not building more.',
  tlg_arc_taper:
    'Massive taper. Single ARC round, 15 minutes, very easy. No intensity work. You are conserving everything for send day. Rest more than you think you need.',
  tlg_no_endurance_send_week:
    'No dedicated endurance session this week. Your endurance sessions this week are your send attempts themselves. Rest, sleep, protein, patience. The training is done.',
  tlg_onsight_route_reading:
    '3-5 routes at your on-sight level. Before each route, spend 60 seconds reading it from the ground: note rest positions, cruxes, clipping stances. Attempt the route cold. After each, note where your read was wrong. Route reading is a skill and it is trained here.',
  tlg_clipping_drills:
    'Pick 3 moderate routes (1-2 grades below on-sight). Climb each twice. First attempt: clip from 3 different stances per clip (left side, right side, direct). Second attempt: practice one-hand, one-motion clipping — no fumbling. If you fumble, re-establish balance and try again. Builds clipping efficiency you will desperately need on redpoints.',
  tlg_fall_ladder:
    'Use the 4-step fall ladder: (1) Clip fall — climb 1 ft above the bolt and let go; (2) Half-clip — 3-4 ft above; (3) Full-bolt — climb to next bolt without clipping, fall; (4) Commitment fall — attempt a hard move above the bolt, fall naturally. Only progress when the current level feels comfortable. Rebuilds trust in the system.',
  tlg_deload_easy_onsights:
    'End of Base. 2-3 attempts only on moderate routes. No projecting, no max efforts. Review notes from the past 4 weeks — find patterns in what went wrong on on-sights. Sleep matters more than the session.',
  tlg_project_selection_burns:
    'Phase 2 performance begins. Pick 1-2 target routes at your redpoint limit. Attempt 1: climb the full route, note every issue. Attempts 2-3: isolate the crux — take the rope, work the moves. Rest 5-8 min between burns. 3-4 burns total per session.',
  tlg_crux_to_chains:
    'Same project(s). Now LINK sections. Try bottom-to-crux on burn 1. Crux-to-chains on burn 2. Full redpoint attempt on burn 3 if you have it. 3-5 min rest between burns. Notes after every burn: where did you fall and why?',
  tlg_full_redpoint_attempts:
    'Burn-for-burn on your project. 3-4 full redpoint attempts with 8-10 min rest between. Before EVERY burn: visualize every clip, rest, and crux move for 60 seconds. Take brutal notes after each fall. Strength? Technique? Mental? Be specific.',
  tlg_deload_volume_day:
    'End of Engine. No projecting. 5-6 moderate routes at a grade below your redpoint. Focus on cruising them with perfect movement — quiet feet, straight arms, slow breathing. Keeps the motor patterns grooved while letting the pump system recover.',
  tlg_visualization_burns:
    'Send phase. Warm up 25-30 min. Before every burn: full visualization of the complete route, 60s minimum, eyes closed. 2-4 full project burns with 8-10 min rest. Decoupling: rate each attempt quality 0-10 INDEPENDENT of send/fail. A perfect attempt that falls is better than a sloppy send.',
  tlg_film_review_projecting:
    'Film 2 project attempts from the ground. Watch back between burns. Look for: early arm bending, hip drift away from wall, foot hesitations, rushed clips. Reattempt with the feedback in mind. Video exposes what you cannot feel.',
  tlg_peak_conditions_send:
    'Time the session for peak conditions — coolest, driest part of the day, least-crowded section of the gym. 3 high-quality burns, 10-12 min rest between. Sleep 8+ hrs night before. Warm up 30 min, not 20. This is where 11 weeks of work arrive.',
  tlg_send_week:
    'The training is done. Attempts only: 2-3 per session, 10+ min rest between. If the send does not happen, it does not happen — the beta is banked for next cycle. Immediately after the final attempt (send or not), complete the graduation assessment retest on the baselines.',

  // ── Peak Performance (drills/peakPerformance.ts) ──
  pp_limit_four_burns:
    'Warm up 20-30 min to full temperature. Pick 3-4 projects at your max grade. 4 quality burns per project, 5 min rest between, 10+ min rest between projects. Stop if form visibly breaks on two consecutive burns — CNS is fried. Log attempts per project.',
  pp_style_diverse_limit:
    'Pick 3-4 projects that span different styles (slab, vertical, overhang, roof). Builds breadth at limit. 3-4 burns each, 5 min rest. Exposes weakest style — note which one felt worst, feed it into next Technique day.',
  pp_crux_isolation:
    'Pick 2-3 projects where the crux move has been shutting you down. For each: try the crux in isolation (pre-rig the sequence) for 5-8 attempts with 3-4 min rest. THEN run the full boulder once. Isolation creates the strength gain; full run integrates it.',
  pp_deload_flow:
    'End of Build phase. Climb 45-60 min at RPE 6 on V5-V7. No limit work, no projects. Light session lets the fingers and CNS recover before Intensify. Sleep and eat well this week — tendon adaptation is happening in the background.',
  pp_intensify_five_burns:
    'Peak-volume limit session. Pick 3 projects, 5 quality burns each, 5 min rest between burns. This is the hardest climbing week of the program so far. If burn 5 feels worse than burn 1, stop the project — added fatigue is wasted.',
  pp_boulder_link_ups:
    'Pick 2-3 moderate-to-hard problems (1-2 grades below max). Climb each TWICE back-to-back with no rest. 3 sets per problem with 5 min between sets. Builds power endurance at high intensity — your new max strength starts earning grades here.',
  pp_hard_flash_day:
    'Warm up fully, then try to flash 5-6 boulders 1-2 grades below your max in a single session. No second burns allowed. Tests how well limit strength translates to first-go performance. Read sequences carefully before starting.',
  pp_deload_flash_volume:
    'End of Intensify. 20-25 moderate boulders (2-3 grades below max) with 1-2 min rest between. No limit work. Keeps motor patterns grooved while giving tendons and CNS a full week to catch up before Peak & Send.',
  pp_critical_taper:
    'THIRTY-FIVE percent volume reduction. 4-5 boulders at moderate grade only. This second deload exists because tendons take MONTHS to adapt while muscles adapt in weeks. Muscles feel ready; tendons are not. Skip this week and your Peak sends become Peak injuries. Non-negotiable.',
  pp_peak_projecting:
    'First peak session. Pick your #1 project. 6 burns with 6-8 min rest between — longer than normal because you are optimizing send quality, not accumulation. Visualize each sequence before leaving the ground. Note exactly where you fell and why.',
  pp_send_window:
    'Pick your hardest project. 4-5 burns max, 8-10 min rest between. Sleep 8+ hrs night before. This is where the 12 weeks pay off. If the send does not happen this session, you have Week 12 — no panic.',
  pp_graduation_retest:
    'Split the week: one session to retest ALL baselines (Max Hang, Weighted Pull 3RM, Max Grade, Flash Grade, Front Lever, Hollow Body), one final send session on any remaining project. Log everything. Rest 3+ days after before any programming rotation.',
  pp_movement_inventory:
    'Climb 6-8 sub-max boulders while consciously inventorying your movement: where are feet slipping, which hands feel weak, which body positions feel awkward? Write 2-3 weaknesses in the notes. This phase is diagnostic — you are finding what to work on, not grinding a fix.',
  pp_video_review_day:
    'Film yourself on 4-5 boulders at 1-2 grades below max. Watch back between attempts. Look for: early arm-bend, hips drifting away from wall, foot placement hesitation. One focus per boulder. Video exposes what you cannot feel.',
  pp_weakness_drilling_1:
    'Pick ONE weakness from Weeks 1-2. For that weakness, pick 4-5 sub-max boulders that expose it and climb each 2-3 times with deliberate attention. Example: weak compression means pinchy problems, climbed focusing purely on body tension. Rest 3 min between burns.',
  pp_weakness_drilling_2:
    'Pick your SECOND weakness and repeat the drilling structure from Week 3. Two weeks per weakness is the minimum dose for neural change to stick. If both weaknesses feel fixed already, pick a third.',
  pp_footwork_under_fatigue:
    'Climb 8-10 boulders 2-3 grades below max, with intentional small foot holds. Between boulders: 10 push-ups + 20s hollow body hold — pre-fatigue upper body and core. Simulates the footwork challenge on the last move of a project when you are pumped.',
  pp_silent_feet_hover:
    '6-8 moderate boulders (2 grades below max). Feet make no sound on holds, hands pause 2-3 seconds above next hold before placing. Slower session than you are used to. Forces precision under the mental tension that comes with the Intensify phase.',
  pp_body_position_puzzles:
    'Pick 4-5 boulders that feature awkward or contested body positions (heel-toes, drop-knees, layback cruxes). Climb each 3 times, experimenting with subtle body position variations. Log which variation worked. Tactical flexibility.',
  pp_deload_style_library:
    'End of Intensify. Climb 10-15 V5-V7 boulders across ALL styles in one session. No projects. No focus. Just accumulate varied mileage on solid terrain. Gives the nervous system broad recovery while maintaining movement vocabulary.',
  pp_integration_day:
    'After Deload 2. Climb 4-6 boulders at your old flash level — they should feel different. Apply Silent Feet and body position awareness from Phase 2. Every send should feel cleaner than it used to. Integration, not fixing more.',
  pp_flow_projecting_prep:
    'Very low intensity, high volume. 15-20 boulders 3 grades below max. Climb them at speed (moderate RPE 5-6). Building motor-pattern speed for Peak week. Fewer mental cues, more fluid execution.',
  pp_light_maintenance:
    'Heart-rate-up, volume-low. 8-10 easy boulders. Goal is keeping the nervous system engaged without adding fatigue before send attempts. If you feel fresh, skip this session entirely and rest.',
  pp_graduation_assessment:
    'This week\'s technique session is the movement portion of your graduation assessment. Climb 5 different-style boulders at 1-2 grades below max. Rate attempt quality (0-10) independent of send/fail. Log anything that still feels weak — feeds into your next program pick.',
  pp_project_selection:
    'Pick 1-2 projects at your max grade. For each: 5-6 attempts with 5-8 min rest between. Between attempts, visualize the next burn with eyes closed for 60 seconds minimum. Focus on move isolation — can you DO each move, not yet link them. Log exactly where you fell and why after every attempt.',
  pp_link_building:
    'Same project(s) as Week 1. Now build links: start 2-3 moves before the crux, top out at 2-3 moves after. 5-6 attempts, 5-8 min rest. The goal is not the send — it is stringing consecutive moves. Do not try for the full redpoint yet.',
  pp_top_down_redpointing:
    'Send the TOP section first. Start at the last rest before the top-out and climb through. Then extend down — start one move lower, send again. Builds ending-confidence for when you do try the full redpoint. 6-8 attempts, prioritize quality over count.',
  pp_deload_session_review:
    'End of Build. Do not project this week. Use the session for low-intensity climbing (1-2 grades below project) AND to review all your crux notes from Weeks 1-3. Pick: do you keep this project for Intensify, or swap? Log your decision.',
  pp_full_redpoint_attempts:
    'First full-boulder attempts. 5-6 burns with 6-8 min rest. Between burns, run the visualize-climb-note-rest loop. Before EVERY burn: eyes closed, run the full sequence in your head, 60s minimum. Notes after must be specific — not \'fell on the crux\' but \'left foot cut on the second-to-last move because I did not flag\'.',
  pp_mental_game_commitment:
    'If there is a scary move on your project (exposure, bad landing, dyno), this is the day. Use the isolation drill: do the scary move on a lower-stakes version until automatic. Then false starts: 2-3 attempts at full power, intentionally NOT grabbing. Proves the fall is safe. Then try for the send.',
  pp_conditions_day:
    'Time the session for peak conditions (cool, dry, low-crowd). Go for the send. 4-6 burns with 8-10 min rest — fewer but higher-quality attempts. If no send, log exactly what happened: fell on X move because Y. Feeds into Deload 2 strategy.',
  pp_deload_strategy_review:
    'End of Intensify. No projecting. Low-intensity climbing plus an honest review of project progress. Decide: double down on this project for Peak (if links are consistent), or switch to a different project at the same grade. Overcommitting to a plateau project is how send cycles fail.',
  pp_deload2_light_session:
    'Second tendon-recovery week. NO projecting. Short, easy session only — moderate boulders, 1-2 grades below max. The project is waiting; your tendons are catching up. One week of restraint here saves three weeks of injury.',
  pp_peak_session_1:
    'Peak phase projecting. 6-8 burns on your chosen project with 8-10 min rest. Decoupling: RATE each attempt 0-10 on execution quality independent of send/fail. A perfect attempt that falls is a better stimulus than a sloppy send. Focus on flow — challenge-skill balance, clear goals, immediate feedback.',
  pp_send_attempts_quality:
    '4-6 burns max, 10-15 min rest between. Prioritize SEND quality. Sleep 8+ hrs the night before. Warm up 40 min, not 30. The ceiling for the 12 weeks — express everything you built. If no send, the send window continues into Week 12.',
  pp_final_attempts:
    'Either send the project (celebrate), or bank the beta and graduate. Either way, complete the assessment retest in your other session this week. Then take 3+ full rest days before any new program. Rotating programs while running on fumes from a Peak cycle compounds into injury.',

  // ── The Siege (drills/siege.ts) ──
  sg_project_selection_recon:
    'Try 2-3 candidate routes 1-2 grades above your current redpoint. Climb each on top-rope or with a stick-clip — you are auditioning, not sending. Pick THE project by the end of the session. Selection rule: if you can do every move first try, it is too easy; if you cannot decode the crux at all, it is too hard. The right project has a clear crux you can imagine unlocking and a few sections you already climb cleanly.',
  sg_move_by_move_decoding:
    'Work the project one move at a time, using stick-clip or top-rope as needed. Figure out the beta for each individual move and rehearse it until it feels repeatable. Do not care about linking yet — care about knowing exactly what every move demands. Expect 4-6 focused attempts with 8-15 min rest between. Log the moves that feel low-percentage.',
  sg_beta_refinement_rests:
    'Refine the sequence you decoded. Hunt micro-beta — a thumb catch, a heel that turns a campus into a reach, a knee bar that becomes a rest. Find and rehearse every shake-out and stance on the route. Test alternative beta through the crux: the first solution is rarely the most efficient. By the end of this session your beta should feel close to final.',
  sg_first_links_checkpoint:
    'Start chaining: link 3-5 move sections, including at least one attempt through the crux. Keep the volume moderate — your fingerboard work deloads this week, so respect the recovery. Checkpoint: if the moves still feel impossible rather than low-percentage, reassess your project choice now, before you invest the linking phase in it.',
  sg_section_links_doubles:
    'Link 5-8 move sections, especially through and around the crux. 2-3 quality burns per session with 15-20 min rest between — each burn should be a genuine effort, not a rehearsal. Climb in the better conditions of your session window. The goal this week: stitch the route into 3-4 reliable chunks.',
  sg_extend_links_crux:
    'Chain longer. At least one link this session should carry from before the crux to after it — the crux move executed with pump in the forearms, not fresh. 2-3 burns, 15-20 min rest. If you can only do the crux fresh but never linked into it, that is the exact capacity the Power-Endurance session is building in parallel.',
  sg_bottom_to_crux:
    'On your best burn of the day, link from the ground all the way to the crux, OR from the crux to the anchors. Pick whichever half is your weakness. 2-3 high-quality burns with 15-20 min rest. You are proving you can arrive at the crux with enough left to fight, and finish the route once past it.',
  sg_longest_links_reassess:
    'Link the biggest chunks the route allows — ideally ground-to-crux-to-near-the-chains in one or two pieces. Reassessment rule: if you are still falling BEFORE the crux this week, the route may be too hard for this cycle — consider dropping a grade so you get a send under your belt. By the end of Week 8 you should have at least one link that includes the full crux sequence.',
  sg_full_redpoint_burns:
    'Switch to single-attempt mode. 2-3 full redpoint burns from the ground with 20-30 min rest between. Conditions matter now — climb in the coolest, driest part of your session. Warm up thoroughly but conserve skin and fingers for the real attempts. Treat every burn as a send attempt: same warm-up, same focus, same clipping.',
  sg_first_one_hang:
    'Aim for a one-hang: the whole route with a single rest or fall. This is the last milestone before the send and a strong predictor it is coming. 2 maybe 3 burns, full rest between, best conditions. Protect skin aggressively — tape splits early, and stop the session while your fingers still feel crisp.',
  sg_refine_dont_rehearse:
    'You know the route — now optimize the variables around it. Dial clipping stances, the exact warm-up that leaves you primed but not pumped, and the time-of-day with the best conditions. Reduce volume so every burn is fully fresh. You are no longer learning moves; you are removing reasons to fall.',
  sg_send_window:
    'Taper hard. Keep attempts few and fully rested — quality over quantity. Maximize recovery between burns (30+ min) and prioritize the coolest, driest window of the day. If conditions are poor, it is fine to wait for a better day rather than burn skin on a low-percentage go. This is the send.',
  sg_capacity_laps_arc:
    'Aerobic Restoration and Capillarization. Continuous climbing at RPE 3-4 (easy breathing, mild pump) on easy routes or long traverses. 15-20 min continuous, 2 rounds with 5 min rest between. Do not stop between routes — keep moving. This is boring and foundational; it grows the capillary network your forearms use to clear pump. Skip it and the linking weeks will hurt more.',
  sg_arc_volume_build:
    'Same aerobic intent, more time under tension. Extend to 18-22 min continuous, 2-3 rounds, 5 min rest between. Stay strictly at RPE 3-4 — if you get genuinely pumped you are climbing too hard and training the wrong system. Use easier terrain or bigger holds to keep moving the whole round.',
  sg_arc_light_intervals:
    'Bridge toward links. One ARC round (15-20 min easy continuous), then 2-3 light interval laps: climb 2-3 minutes at RPE 5-6, rest an equal amount, repeat. This introduces a moderate pump-and-clear cycle without the intensity of true doubles. Keep form clean — sloppy intervals just teach bad movement under fatigue.',
  sg_capacity_consolidation:
    'Your last pure-base week before the linking block. Peak the ARC volume: 2-3 long rounds (20+ min) at RPE 3-4, or one extended pyramid. Keep it easy and high-volume — you are banking aerobic capacity, not testing it. Next week the intensity steps up, so finish this session pump-free and recovered.',
  sg_rope_links_doubles:
    'Pick 2 routes at 80-90% of your redpoint grade. Climb the first, lower, and pull straight back onto the second — no ground rest. Rest 4-6 min between sets and repeat 3-4 times. This is the core power-endurance stimulus: teaching the forearms to keep working and partially recover through sustained pump.',
  sg_doubles_added_volume:
    'Same doubles format, slightly more load: add a set (4-5 total) or nudge route difficulty toward 90% of redpoint. Rest 4-6 min between sets. The target is buffering pump on harder terrain — by the end of the set your forearms should be deeply pumped but your movement still controlled. If form collapses, drop intensity, not focus.',
  sg_rope_links_triples:
    'Upgrade to triples: 3 routes back-to-back with no ground rest, 5-7 min between sets, 2-3 sets total. Use routes around 80% of redpoint so you can complete all three. Triples push the duration of the pumped state and rehearse recovering between crux sections — exactly what a long project demands.',
  sg_triples_peak_volume:
    'The highest power-endurance volume of the program: 3-4 sets of triples, 5-7 min between. This is the peak of the linking block — next week shifts toward send-specific intensity. Quality rule: if your climbing turns to flailing, drop a route rather than grind out junk laps. Pumped-but-precise beats exhausted-and-sloppy.',
  sg_redpoint_bursts:
    'Shift from volume to intensity. Pick a route at your redpoint grade (not your project). 1 all-out burn, 20 min full rest, then 1-2 more. This mimics the pattern of actual send-day projecting so your body rehearses the recovery-to-peak cycle. Each burn is maximal effort followed by real recovery — not a circuit.',
  sg_burst_intensity:
    'Peak burst week. 1-2 maximal burns on a redpoint-grade route with full recovery (20+ min) between. The system you want on send day is the ability to go to your limit, recover, and go again — rehearse exactly that. Keep total volume low; intensity is the whole point and fatigue is the enemy.',
  sg_taper_begins:
    'Cut volume in half and hold intensity. One or two crisp bursts on a redpoint-grade route, full rest, then stop. You are keeping the power-endurance system sharp while shedding accumulated fatigue so it is available for the project. Leave the session feeling like you could have done more.',
  sg_send_support:
    'Minimal volume — just enough to stay primed. A short ARC flush (10-15 min easy continuous) or one easy burst to keep the forearms awake without adding fatigue. Skip this session entirely if you are deep in send attempts on the project; recovery for the redpoint takes priority over any training stimulus this week.',

  // ── Off the wall (drills/offWall.ts) ──
  off_shoulder_cars:
    'Controlled articular rotations: one shoulder at a time, tracing the largest circle the joint will make, slowly enough that it takes twenty seconds to get round once. Keep the ribs down and the other side still — the point is the shoulder moving alone, not the body helping it. Five each side. Climbers lose overhead range first and notice it last, usually as a shoulder that complains on a high gaston.',
  off_wrist_forearm_prep:
    'On all fours: fingers forward and rock back, fingers back and rock forward, then palms up and rock. Thirty seconds each, breathing, never into sharp pain. Finish with slow wrist circles under a little load. The forearm flexors that crimp also cross the wrist, and a wrist that has lost extension range turns every mantel and every press into an argument.',
  off_ninety_ninety_hips:
    'Sit with both knees bent at ninety degrees, one leg in front and one out to the side. Lift both knees and switch sides without using your hands, keeping the chest tall. Ten switches, rest, ten more. Then hold the front-leg position and lean over the shin for thirty seconds a side. Every high step, drop knee and heel hook is bought with hip rotation, and it is the range that goes first in anyone who sits down for a living.',
  off_thoracic_opening:
    'Side-lying windmill: knees stacked on the floor in front of you, top arm tracing a slow arc from one side to the other, eyes following the hand. Eight a side, pausing wherever it catches. Then thread the needle, eight a side. A stiff upper back sends the work to the shoulder and the lower back instead, which is why the fix for a sore shoulder is often not the shoulder.',
  off_extensor_work:
    'Open the fingers against resistance — a rubber ring, an elastic band around the fingertips, or a hand pushed open into sand or rice. Three sets of twenty, slow out and slower back, until the back of the forearm is warm and mildly pumped. The flexors get trained every session and the extensors get trained never, and the imbalance is where medial and lateral elbow pain comes from. Ten minutes, one to three times a week, is the whole prescription.',
  off_skin_repair:
    'File the high spots flat while the skin is dry — not to bare pink, just until the surface is level and there is no lip on a flapper to catch. Then moisturise lightly and leave it alone. Repeat before bed. Skin is the one tissue that limits back-to-back days on rock and the only one that repairs on a schedule you can actually change.',
  off_easy_aerobic:
    'Thirty to sixty minutes of walking, cycling or swimming at a pace you could hold a conversation through. Not intervals, not a workout — this is the pace that moves blood through tissue that spent the week under load and then sat still. It costs a climbing session nothing and it is the cheapest thing in the app for how you feel two days later.',
  off_tension_holds:
    'On your back, arms overhead, lower back pressed flat, shoulders and legs just off the floor — hold until the position breaks, not until a timer says so. Rest a minute, roll over, and hold the arch. Three of each. The tension you cannot hold on the floor is tension you will not find on an overhang, and the failure point is always the position going soft rather than the muscle giving out.',
  off_sequence_rehearsal:
    'Sit somewhere quiet and run your project move by move, in real time, from the ground to the chains or the top-out. Hands, feet, where you breathe, where you shake. When it goes fuzzy, that is the section you do not actually know — write it down and work it next session. Rehearsed sequences execute faster and cost less, and the fuzzy patch is worth more than the rehearsal.',
  off_box_breathing:
    'In for four, hold for four, out for four, hold for four. Ten rounds, nose only, sitting up. Then ten more while thinking about the move that frightens you. The second half is the drill: a nervous system that can be brought down deliberately in a quiet room can be brought down at a clip, and the skill does not arrive the first time you need it.',
  off_rehearsing_the_fall:
    'Picture the fall you are most afraid of, in detail, until it stops producing a jolt — the moment of letting go, the air, the rope coming tight or the mat arriving. Ten times, slowly, stopping if it stays sharp. This is not a substitute for practising falls for real; it is what makes the first real one survivable enough to start. If it will not settle at all, that is worth a conversation with a coach rather than another rep.',
  off_ten_minute_debrief:
    'Write down three things from the last session: what actually limited you, one decision you would take back, and the single thing to do differently next time. Ten minutes, in the notes field or on paper. Most climbers repeat the same session for months because nothing ever gets named — and a named limiter is the difference between training and attendance.',
};

/**
 * The paragraph, shipped or written (PLAN.md M286).
 *
 * A drill the climber wrote is not in the map above and never will be — that
 * map is a build artefact of the library. It carries its own `text` instead,
 * and this is the one place that has to know, so no caller does.
 */
export function drillText(id: DrillId): string | undefined {
  return DRILL_TEXT[id] ?? getDrill(id)?.text;
}
