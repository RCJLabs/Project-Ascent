/**
 * The glossary (PLAN.md §7.3, M9).
 *
 * Ported from the prototype's `data/glossary.ts` — 206 terms a climber
 * actually hears at a wall, from grade systems to grip types to the
 * exercises the programs prescribe by name.
 *
 * ## Why it is content and not prose in a component
 *
 * Two consumers, not one. The page below is the obvious reader; the other
 * is the inline matcher, which looks up an authored exercise or drill name
 * and offers its definition where it appears. That only works if the terms
 * are keyed data with exact names, which is why `lookup` normalises rather
 * than the callers doing it each in their own way.
 *
 * ## Grade conversions
 *
 * Corrected on the port. The prototype's French entry read "French 5a ≈ YDS
 * 5.8, 7a ≈ 5.11d, 8a ≈ 5.13b" — every one a rung off `engine/grades.ts`,
 * which maps 5.7→5a, 5.11c→7a and 5.13a→8a. A glossary that disagrees with
 * the grade toggle in the same app is worse than no glossary, so the
 * conversions here are asserted against those tables in the tests rather
 * than trusted to stay in step by hand.
 *
 * Conversions are approximate by nature and every table in the world
 * disagrees at the margins; the point is that this app tells one story.
 */

export type GlossaryCategory =
  | 'Term'
  | 'Grade'
  | 'Gear'
  | 'Technique'
  | 'Grip'
  | 'Training'
  | 'Drill'
  | 'Exercise'
  | 'Mobility'
  | 'Concept';

export interface GlossaryEntry {
  term: string;
  category: GlossaryCategory;
  definition: string;
}

/** Display order: what a climber meets first, roughly. */
export const CATEGORY_ORDER: GlossaryCategory[] = [
  'Term',
  'Grade',
  'Gear',
  'Technique',
  'Grip',
  'Training',
  'Drill',
  'Exercise',
  'Mobility',
  'Concept',
];

export const CATEGORY_BLURB: Record<GlossaryCategory, string> = {
  Term: 'The words people use at the wall.',
  Grade: 'How hard, and who is counting.',
  Gear: 'The physical kit.',
  Technique: 'How to move.',
  Grip: 'Holds, and the ways of holding them.',
  Training: 'Methods and protocols.',
  Drill: 'Structured practice with a point.',
  Exercise: 'Individual movements the programs ask for.',
  Mobility: 'Range, and keeping it.',
  Concept: 'The ideas underneath the training.',
};

export const GLOSSARY: GlossaryEntry[] = [
  // ── Term ──────────────────────────────────────────────────────────────
  { term: 'Belay', category: 'Term', definition: 'Managing the rope for a climber so a fall is caught — and also the spot or system that holds the climber in place. The belayer feeds or takes in slack and locks off to stop a fall; \'belay on\' means ready to catch you.' },
  { term: 'Belayer', category: 'Term', definition: 'The person on the ground (or at a belay station) managing the rope for the climber. Responsible for catching falls, lowering the climber, and keeping rope tension appropriate. Indoor gyms require a belay certification — a short test on technique — before you can belay a partner.' },
  { term: 'Beta', category: 'Term', definition: 'Information about a climb, such as the sequence of moves, hold locations, or specific techniques required.' },
  { term: 'Bouldering', category: 'Term', definition: 'Climbing short, powerful routes without a rope. Falls land on a crash pad (outdoors) or built-in floor mats (gyms). Routes are called \'problems\' and graded on the V-scale or Font scale. Boulder problems are usually 5–20 feet tall and 4–15 moves long.' },
  { term: 'Crag', category: 'Term', definition: 'An outdoor climbing area. Can be a single cliff, a cluster of boulders, or a whole canyon. \'Going to the crag this weekend.\' Distinct from a \'gym\' (indoor) or \'route\' (a single climb at a crag).' },
  { term: 'Crux', category: 'Term', definition: 'The most difficult section or move of a climb.' },
  { term: 'Flapper', category: 'Term', definition: 'A piece of skin that tears off your hand or finger while climbing.' },
  { term: 'Flash', category: 'Term', definition: 'Completing a climb on your first attempt from start to finish without falling, but having prior knowledge of the beta.' },
  { term: 'Free Solo', category: 'Term', definition: 'Climbing without any rope or protection. A fall means death or serious injury. Practiced by a small number of expert climbers on routes well below their physical limit. Project Ascent\'s \'Free Solo\' mode in The Ascent borrows the name and the all-or-nothing stakes.' },
  { term: 'Lead Climbing', category: 'Term', definition: 'Climbing with the rope starting at the bottom, clipping into protection (bolts on sport, placed gear on trad) as you go up. Falls are longer than top-rope because you fall to and past your last clip. Requires more skill from both climber and belayer than top-rope.' },
  { term: 'Multi-Pitch', category: 'Term', definition: 'A climb longer than a single rope length, broken into multiple \'pitches\' (rope-length sections) with belay stations between them. The lead climber climbs a pitch, builds an anchor, belays the second climber up, then either swaps leads or continues. Common outdoors; rare indoors.' },
  { term: 'Onsight', category: 'Term', definition: 'Completing a climb on your first attempt without any prior knowledge or beta.' },
  { term: 'Projecting', category: 'Term', definition: 'Working on a climb that is at or above your limit, figuring out the moves over multiple attempts or sessions.' },
  { term: 'Pumped', category: 'Term', definition: 'The feeling of swollen, fatigued forearms caused by lactic acid buildup during sustained climbing.' },
  { term: 'Redpoint', category: 'Term', definition: 'Completing a climb from start to finish without falling, after having practiced it previously.' },
  { term: 'Send', category: 'Term', definition: 'Successfully completing a climb from start to finish without falling.' },
  { term: 'Sport Climbing', category: 'Term', definition: 'Lead climbing on routes equipped with permanent bolts and a fixed anchor at the top. The climber carries quickdraws and clips them into bolts as they ascend. Most outdoor climbing gyms have a dedicated sport-lead wall.' },
  { term: 'Top-Rope', category: 'Term', definition: 'Climbing with the rope already anchored at the top of the route, running through the anchor and back down to a belayer at the bottom. Falls are nearly instant — the rope catches you immediately with minimal slack. The safest format for beginners and the standard for indoor gym walls with auto-belays.' },
  { term: 'Trad Climbing', category: 'Term', definition: 'Short for \'traditional climbing.\' Lead climbing where the climber places their own removable protection (cams, nuts, hexes) in cracks and features as they go. The second climber removes the gear on the way up. The original form of roped climbing, predating bolted sport routes.' },
  { term: 'Whip / Whipper', category: 'Term', definition: 'A long fall on lead, especially one that swings the climber past a feature or out into space. \'Took a whipper on the third clip.\' Sounds dramatic but is usually safe when the system is set up correctly — modern ropes stretch to absorb impact.' },

  // ── Grade ─────────────────────────────────────────────────────────────
  { term: 'Font Grade (Fontainebleau)', category: 'Grade', definition: 'European bouldering grade system from Fontainebleau, France. Runs from 3 (easy) through 9A (current limit). Numerical grade plus letter and optional \'+\': 6A, 6A+, 6B, 6B+, 6C, 6C+. Rough conversion: Font 6A ≈ V3, Font 7A ≈ V6, Font 8A ≈ V11.' },
  { term: 'French Grade', category: 'Grade', definition: 'European sport climbing grade system. Numerical grade plus letter and optional \'+\': 5a, 5b, 5c, 6a, 6a+, 6b, 6b+, up to 9c. Rough conversion: French 5a ≈ YDS 5.7, French 7a ≈ 5.11c, French 8a ≈ 5.13a.' },
  { term: 'Sandbagged', category: 'Grade', definition: 'A climb graded harder than it feels, or rated lower than its actual difficulty. \'That V3 is sandbagged — it felt like V5.\' Opposite of \'soft.\' Some crags and gyms have sandbagged reputations as a point of pride.' },
  { term: 'V-Scale (V-Grade)', category: 'Grade', definition: 'Bouldering grade system used in North America. Runs V0 (easiest) through V17 (current limit). The \'V\' comes from John \'Vermin\' Sherman, who proposed it. V0–V2 is beginner, V3–V5 intermediate, V6+ expert. Style fit matters: a slab V4 and a roof V4 require different strengths.' },
  { term: 'YDS (Yosemite Decimal System)', category: 'Grade', definition: 'North American grade system for ropes routes. Class 5 is technical climbing (5.0 easy through 5.15d cutting-edge). From 5.10 up, each grade splits into letter sub-grades — 5.10a is easier than 5.10d. Most beginner gym routes are 5.6–5.10.' },

  // ── Gear ──────────────────────────────────────────────────────────────
  { term: 'Auto-Belay', category: 'Gear', definition: 'A spring-loaded or magnetic machine bolted at the top of a route that automatically retracts your rope as you climb. Clip the device to your harness, climb, and if you fall or come off, it lowers you gently. Lets you climb top-rope without a partner. Always check the clip is on your belay loop before leaving the ground.' },
  { term: 'Belay Device', category: 'Gear', definition: 'The tool a belayer uses to hold the rope and arrest falls. Common types: tubular (ATC), assisted-braking (GriGri, Mega-Jul). Goes on the belayer\'s harness with the rope threaded through it. Beginners typically learn on a tubular device first.' },
  { term: 'Chalk', category: 'Gear', definition: 'Magnesium carbonate powder used to dry sweat from hands and improve friction on holds. Carried in a chalk bag clipped to a belt or harness. Comes in loose powder, chalk balls, and liquid chalk. Some gyms restrict loose chalk to chalk balls only to reduce dust.' },
  { term: 'Crash Pad', category: 'Gear', definition: 'A foldable foam mat used to cushion falls when bouldering outdoors. Sized to cover the most likely landing zone. Spotters move pads as the climber moves over the rock. Indoor gyms use built-in floor padding instead.' },
  { term: 'Harness', category: 'Gear', definition: 'The waist-and-leg loop you wear when climbing with a rope. Has a belay loop (front) for tying in or attaching a belay device, plus gear loops on the sides for racks. Should sit snug on the waist above the hip bones — not on your stomach, not on your hips.' },
  { term: 'Quickdraw', category: 'Gear', definition: 'A pair of carabiners connected by a sewn nylon sling. One end clips into a bolt on the wall; the other end clips your rope. Sport climbers carry a rack of 8–15 draws. The bottom carabiner often has a bent gate for easier rope clipping.' },
  { term: 'Topo', category: 'Gear', definition: 'A map of an outdoor crag showing routes, their names, grades, and lines. Most popular climbing areas have published topos in guidebooks or apps (Mountain Project, theCrag). Reading the topo before approaching is how you find the routes you\'re looking for.' },

  // ── Technique ─────────────────────────────────────────────────────────
  { term: 'Backstepping (The Twist Lock)', category: 'Technique', definition: 'Turning one hip into the wall to extend your reach and reduce strain on the arms. Place the outside edge of your shoe on a hold and pivot on your toe.' },
  { term: 'Compression (The Bear Hug)', category: 'Technique', definition: 'Using opposing pressure between two hands (usually on aretes or slopers) to stay on the wall, relying on chest strength rather than grip strength.' },
  { term: 'Flagging', category: 'Technique', definition: 'Using a free leg (one not on a foothold) as a counterweight to maintain balance and prevent swinging off the wall (\'barn-dooring\').' },
  { term: 'Hand Jamming', category: 'Technique', definition: 'Inserting the hand into a crack and expanding the muscle mass to lock it in place.' },
  { term: 'Hand Matching', category: 'Technique', definition: 'Placing both hands on the same hold to transition or rest.' },
  { term: 'Run-and-Jump (Parkour)', category: 'Technique', definition: 'Converting horizontal running speed into vertical height using wall volumes.' },
  { term: 'Scumming', category: 'Technique', definition: 'Pressing a non-traditional body part (knee, thigh, hip, shoulder) against the wall for friction and balance.' },
  { term: 'Smearing', category: 'Technique', definition: 'Relying on friction between shoe rubber and wall surface where there is no distinct foothold.' },
  { term: 'Stemming', category: 'Technique', definition: 'Pushing outward with hands and feet against two opposing surfaces (like a corner or dihedral) to bridge the gap and take weight off arms.' },
  { term: 'Step-Up Dyno', category: 'Technique', definition: 'Stepping onto a high foothold and launching off it in one fluid motion.' },
  { term: 'The 1-2 (Coordination Catch)', category: 'Technique', definition: 'A sequence where one hand catches a hold, and the second hand catches the next hold immediately after, while the body is still moving.' },
  { term: 'The Bat Hang', category: 'Technique', definition: 'Hanging upside down by the toes, usually to establish a start on a competition boulder or rest on a steep roof.' },
  { term: 'The Bicycle', category: 'Technique', definition: 'A foot technique using two feet on a single hold. One foot pushes down while the other toe-hooks on top, creating a clamping motion.' },
  { term: 'The Bump', category: 'Technique', definition: 'Moving one hand from a lower hold to a higher hold in two quick, successive motions without using the other hand.' },
  { term: 'The Coil', category: 'Technique', definition: 'The loading position before a dyno — hips sunk low, legs loaded like a spring.' },
  { term: 'The Deadpoint', category: 'Technique', definition: 'A controlled dynamic move where you grab the next hold at the exact moment upward momentum reaches zero (the apex) before gravity pulls you down.' },
  { term: 'The Double Clutch', category: 'Technique', definition: 'A dynamic move where both hands leave the wall simultaneously to catch one or two new holds; an all-or-nothing commitment move.' },
  { term: 'The Drop Knee', category: 'Technique', definition: 'An aggressive backstep variation on overhangs. Rotate one leg internally so the knee points straight down toward the floor to cam your body.' },
  { term: 'The Dyno', category: 'Technique', definition: 'An explosive jump where all points of contact may leave the wall.' },
  { term: 'The Figure Four', category: 'Technique', definition: 'A specialized move where you hook a leg over your own arm to generate upward leverage when footholds are missing.' },
  { term: 'The Foot Swap', category: 'Technique', definition: 'Switching feet on a single foothold. Can be done via \'The Piano\' (slowly wiggling) or \'The Hop\' (a micro-jump).' },
  { term: 'The Gaston', category: 'Technique', definition: 'Pulling outward (laterally) with thumb pointing down and elbow out, like prying open elevator doors.' },
  { term: 'The Heel Hook', category: 'Technique', definition: 'Using the heel of the shoe to pull, push, or cam on a hold, turning the leg into a third arm.' },
  { term: 'The Knee Bar', category: 'Technique', definition: 'Camming the lower leg between two features (foot on one, knee on another) to create a hands-free rest.' },
  { term: 'The Layback', category: 'Technique', definition: 'Using opposition where hands pull and feet push against a feature (crack or arete). Lean straight back with straight arms.' },
  { term: 'The Mantle', category: 'Technique', definition: 'Transitioning from pulling up on a hold to pushing down on it, used to top out a boulder or get over a ledge.' },
  { term: 'The Meat Hook (Wrist Scum)', category: 'Technique', definition: 'Curling the wrist and forearm over a feature to rest the fingers.' },
  { term: 'The Paddle Dyno', category: 'Technique', definition: 'Using an intermediate hold to redirect momentum mid-air without latching it.' },
  { term: 'The Pogo (Moon-Kick)', category: 'Technique', definition: 'Swinging a free leg to generate upward momentum when footholds are poor; the leg kicks as the hands release, boosting the launch for tall reaches with bad feet. The kick happens before the pull.' },
  { term: 'The Rockover', category: 'Technique', definition: 'A balance-dependent move to stand up on a high foothold by shifting your center of gravity horizontally over that foot.' },
  { term: 'The Rose Move', category: 'Technique', definition: 'An extreme cross-through where one arm reaches so far across that the head must duck under the reaching arm.' },
  { term: 'The Same Side Principle', category: 'Technique', definition: 'A principle of balance: if you have a hand and foot on the same vertical line without a counterbalance, your body will swing open like a barn door.' },
  { term: 'The Scissor Kick (Switch-Blade)', category: 'Technique', definition: 'Scissoring the legs in mid-air to generate rotational momentum.' },
  { term: 'The Sidepull', category: 'Technique', definition: 'Using a vertically oriented hold by leaning away from it to create opposition.' },
  { term: 'The Skate', category: 'Technique', definition: 'A lateral dynamic move where you transfer weight from one foot to another across a distance, like an ice-skating stride.' },
  { term: 'The Toe Hook', category: 'Technique', definition: 'Using the top of the toe box to pull against a hold or feature, usually to stop a swing on roof climbs.' },
  { term: 'The Toe-Stab', category: 'Technique', definition: 'Catching a foothold at the exact same millisecond the hand latches the target handhold to arrest body swing.' },
  { term: 'The Undercling', category: 'Technique', definition: 'Using a hold that faces downward by pulling up/out against it with palms facing up.' },
  { term: 'The Vector', category: 'Technique', definition: 'The direction of force applied during a dyno. Most dynos require an arc, not a straight line.' },
  { term: 'Toeing-In (Edging)', category: 'Technique', definition: 'Actively digging the big toe into a foothold to generate upward force using the very tip of the shoe.' },

  // ── Grip ──────────────────────────────────────────────────────────────
  { term: 'Full Crimp', category: 'Grip', definition: 'The strongest but most dangerous grip. Thumb wraps over the index finger. Hyperextend the DIP joint, raise the second knuckle higher than the rest of the hand.' },
  { term: 'Half Crimp', category: 'Grip', definition: 'The standard climbing grip. Fingers bent at 90° at the PIP (second knuckle). Thumb rests naturally beside the index finger.' },
  { term: 'Jug', category: 'Grip', definition: 'A large, deep hold that is easy to grip with the entire hand.' },
  { term: 'Open Hand (The Drag)', category: 'Grip', definition: 'Fingers extended, contact on pads, knuckles relatively straight. Safest grip for tendons.' },
  { term: 'The Pinch', category: 'Grip', definition: 'Using the thumb in opposition to the fingers to squeeze a feature.' },
  { term: 'The Pocket', category: 'Grip', definition: 'Using one, two, or three fingers to pull on a hole in the rock.' },
  { term: 'The Sloper', category: 'Grip', definition: 'Relying on skin friction and surface area on a rounded, non-positive shape.' },
  { term: 'Volume', category: 'Grip', definition: 'A large, hollow feature bolted to the wall that other holds can be attached to.' },

  // ── Training ──────────────────────────────────────────────────────────
  { term: '7/3 Repeaters', category: 'Training', definition: 'Hangboard protocol: hang 7 seconds, rest 3 seconds, repeated 6 times = 1 set; 3-6 sets with 2-3 min rest between, at sub-maximum intensity (~60-70% of max) on a consistent grip. Builds tendon hypertrophy and finger capacity. Off-wall isometric training, not a climbing drill.' },
  { term: 'ARCing', category: 'Training', definition: 'Aerobic Restoration and Capillarity training. Climbing continuously at a low intensity (well below your limit) for 20-45 minutes to build endurance and improve recovery.' },
  { term: 'Campus Board — Double Dynos', category: 'Training', definition: 'A campus-board drill where both hands leave the board and catch a higher rung at the same time, training explosive two-hand dynamic power.' },
  { term: 'Campus Board — Laddering', category: 'Training', definition: 'A campus-board drill where you move up the rungs one at a time with alternating hands, training smooth, controlled contact strength and hip positioning.' },
  { term: 'Campus Board — Skips', category: 'Training', definition: 'A campus-board power drill where you explode upward skipping rungs — catching every other rung instead of each one — to build dynamic pulling power.' },
  { term: 'Campus Ladder', category: 'Training', definition: 'On a campus board, ladder up with matched, skip-1, or skip-2 patterns. Pure contact strength and dynamic power. Advanced protocol — requires Iron Grip-level finger strength.' },
  { term: 'Density Hangs', category: 'Training', definition: 'Long (30-45 second) hangs at low-to-moderate intensity at bodyweight or light added weight. Thickens the tendon matrix and builds connective-tissue capacity and finger endurance; keep form, drop off if shaking. The Lockdown program uses this in Phase 1.' },
  { term: 'Frenchies', category: 'Training', definition: 'Pull-up variant with isometric holds at top, 90°, and 120° elbow angles. Build lock-off strength across the full pulling range. 3 sets.' },
  { term: 'Kilter Board', category: 'Training', definition: 'An adjustable-angle, app-connected training board with light-up holds.' },
  { term: 'Limit Bouldering', category: 'Training', definition: 'Working on 1-3 move sequences that are at your absolute physical limit to build maximum power and strength.' },
  { term: 'Max Hangs', category: 'Training', definition: 'Short (7-10 second) hangs at high intensity (85-90% of Total Max Weight) on an 18-20mm edge, with long rests: 3-4 sets, 3 min between. Builds peak finger strength through neural recruitment; add weight once bodyweight becomes too easy.' },
  { term: 'Min-Edge Hangs', category: 'Training', definition: 'Bodyweight hangs on progressively smaller edges. Load stays constant; the edge shrinks over time. Trains crimp strength at the tissue-density level — used in The Siege\'s Finger Protocol Phase 2.' },
  { term: 'MoonBoard', category: 'Training', definition: 'A standardized, app-connected training board set at a 40-degree overhang with a specific grid of holds.' },
  { term: 'Negatives', category: 'Training', definition: 'Slow eccentric (lowering) portion of pull-ups or similar movements. Jump or use a box to the top, then lower slowly (5+ seconds). Builds strength past regular max effort.' },
  { term: 'Offset Lock-Offs', category: 'Training', definition: 'Lock off with one hand higher than the other, holding the position. Builds asymmetric pulling strength needed for real climbing reaches.' },
  { term: 'Recruitment Ladder', category: 'Training', definition: 'Progressive warm-up: 3 hangs on jugs → 2 hangs on 20mm (assisted) → 1 hang on 20mm (bodyweight).' },
  { term: 'System Board', category: 'Training', definition: 'A climbing wall with a symmetrical layout of holds designed to train specific movements and grip types.' },
  { term: 'Tension Board', category: 'Training', definition: 'A symmetrical, app-connected training board with wooden holds, allowing you to train weaknesses equally on both sides.' },

  { term: 'Campus Laddering', category: 'Training', definition: 'Ascending rung sequences on a campus board, matching hands on each rung, to train contact strength and rate of force development. Open hand only — crimping on rungs is how fingers get hurt. The highest injury-risk protocol in any program here: warm up thoroughly, cap total board time, and never campus with an existing finger or elbow symptom.' },
  { term: 'One-Arm Negatives', category: 'Training', definition: 'Jump or step to a one-arm lock-off at the bar, then lower on that arm under control for about five seconds. The strongest isometric pulling progression in these programs, with direct carryover to powerful pulls off single hands. Use a foot on a chair for assistance, and skip it entirely with any elbow symptom.' },

  // ── Drill ─────────────────────────────────────────────────────────────
  { term: 'Capacity Laps', category: 'Drill', definition: 'Climb multiple routes back-to-back at submaximal difficulty to build aerobic capacity on the wall. Usually 3-5 routes with short rests.' },
  { term: 'Crux Section Links', category: 'Drill', definition: 'Chain the hardest 3-5 move section of a project together. Rehearse until clean. Phase 2 of a siege project — builds the power-endurance for the send attempt.' },
  { term: 'Flagging Drill', category: 'Drill', definition: 'Deliberately counterbalance with the free leg during reaches — inside, outside, or back flag — to reduce the pull on the hands and stay on the wall. Test by attempting moves with and without.' },
  { term: 'Hover Hands', category: 'Drill', definition: 'Before placing each hand on a hold, hover it above the target for a 3-count while staying still. Then place precisely. Builds static body positioning and the habit of setting before reaching.' },
  { term: 'Intro to Dynos', category: 'Drill', definition: 'Short-range dynos on positive holds to learn the launch-catch rhythm without risking falls. Pick holds with forgiving grips for the catch.' },
  { term: 'Lateral Momentum', category: 'Drill', definition: 'Dyno to a hold to the side rather than straight up. Requires swinging the hips horizontally and catching with directional grip. Teaches reading sideways momentum.' },
  { term: 'Move-By-Move Beta Decoding', category: 'Drill', definition: 'On a project, work each individual move in isolation — figure out the optimal hand and foot sequence, body position, and grip type before trying to link. Phase 1 of a siege project.' },
  { term: 'Quiet Feet', category: 'Drill', definition: 'Climb with the rule that feet must be placed silently. Forces controlled weight transfer and precision — no slamming or scraping. Instant feedback on footwork quality.' },
  { term: 'Reading Sequences', category: 'Drill', definition: 'Visualize the beta before leaving the ground — every hand, every foot, every rest. Primes the nervous system and reduces mid-climb decision overhead.' },
  { term: 'Redpoint Burns', category: 'Drill', definition: 'Full-route attempts from the ground. Climb with intent to send; rest fully between burns. The final phase of projecting.' },
  { term: 'Run-and-Jumps', category: 'Drill', definition: 'Take one or two running steps across the wall, then jump to a distant hold. Competition-style move requiring commitment and mid-air body control.' },
  { term: 'Self-Analysis', category: 'Drill', definition: 'After a session or climb, write down what worked, what didn\'t, and why. Builds a personal library of patterns — the core of deliberate practice.' },
  { term: 'Sticky Feet', category: 'Drill', definition: 'Climb V-easy problems with the rule that once a foot is placed, it cannot move. Forces deliberate foot placement and weight transfer — the root of all climbing technique.' },
  { term: 'The Coordinate', category: 'Drill', definition: 'A coordinated, multi-limb move where multiple limbs release and land at the same time. Common on modern volumes and slopers.' },
  { term: 'The Full Send', category: 'Drill', definition: 'Commit 100% to the dyno with no doubt. Visualize the landing, set the body, explode. Builds the head game for send-level dynos.' },
  { term: 'The Paddle (Bumping)', category: 'Drill', definition: 'Chain two hand movements in one momentum burst — catch a hold and immediately redirect off it to a higher one. Also called \'bumping\'.' },
  { term: 'Vertical Deadpoint', category: 'Drill', definition: 'Jump straight up from both hands and feet to catch a higher hold at the apex (the \'deadpoint\') when momentum is briefly still. The cleanest dyno variant — foundation for everything else.' },

  // ── Exercise ──────────────────────────────────────────────────────────
  { term: 'Band Internal / External Rotation', category: 'Exercise', definition: 'Tie a band to a doorknob at elbow height. Rotate hand away from belly button (external) or toward belly button (internal).' },
  { term: 'Band Lat Pulldowns', category: 'Exercise', definition: 'Anchor a band high. Sit or kneel. Pull elbows down toward your back pockets.' },
  { term: 'Band Pull-Aparts', category: 'Exercise', definition: 'Hold a band with straight arms at chest height. Pull hands apart until band touches chest.' },
  { term: 'Bear Crawl', category: 'Exercise', definition: 'On all fours, lift knees 1 inch off ground. Crawl forward moving opposite hand and foot simultaneously.' },
  { term: 'Bench Press', category: 'Exercise', definition: 'Lie on a bench. Lower the bar to mid-chest, drive back to lockout. Elbows at ~45° to the torso — not flared to 90°.' },
  { term: 'Bird-Dog', category: 'Exercise', definition: 'On hands and knees. Extend opposite arm and leg simultaneously until both are level with the torso. Hold briefly; alternate sides.' },
  { term: 'Box Jumps', category: 'Exercise', definition: 'Jump onto a high box. Land softly. Step down (do not jump down).' },
  { term: 'Box Sit-to-Stand', category: 'Exercise', definition: 'Sit on a box or bench. Stand up without using arms or leaning forward excessively. Focus on driving through the heels.' },
  { term: 'Bulgarian Split Squats', category: 'Exercise', definition: 'Rear foot elevated on a bench. Lunge down with front leg.' },
  { term: 'Compression Plank', category: 'Exercise', definition: 'Push-up position. Squeeze an object between your hands as hard as possible while maintaining the plank.' },
  { term: 'Core Plank', category: 'Exercise', definition: 'Forearms on the ground, body in a straight line from head to heels. Glutes tight, core engaged. No sagging hips or piked butt.' },
  { term: 'DB Chest Fly', category: 'Exercise', definition: 'Lie on a bench with dumbbells. Lower in a wide arc with a slight elbow bend, bringing the arms out to shoulder level. Squeeze the chest to return to the top.' },
  { term: 'DB Overhead Press', category: 'Exercise', definition: 'Stand or sit. Press dumbbells from shoulder height to full lockout overhead. Keep the core braced; avoid arching the lower back.' },
  { term: 'DB Pullovers', category: 'Exercise', definition: 'Lie across a bench, dumbbell held above the chest. Lower it in an arc behind the head, then return. Works lats and serratus.' },
  { term: 'Dead Bugs', category: 'Exercise', definition: 'Lie on back. Arms up, knees bent 90°. Lower opposite arm and leg toward floor slowly.' },
  { term: 'Deadlifts', category: 'Exercise', definition: 'Hinge at the hips with a flat back. Drive the floor away to stand up with the weight. Don\'t round the spine under load.' },
  { term: 'Deep Box Step-Ups', category: 'Exercise', definition: 'Step onto a high box (higher than standard step-ups). Drive through the lead foot; don\'t push off the trailing leg. Works hip extension and single-leg strength.' },
  { term: 'Depth Jumps', category: 'Exercise', definition: 'Step off a low box, land softly in an athletic stance, then immediately jump up. Trains the stretch-shortening cycle for explosive power. Low volume — quality over quantity.' },
  { term: 'Dips', category: 'Exercise', definition: 'Antagonist pushing movement on parallel bars or rings. Lower until elbows at 90°, drive back to lockout.' },
  { term: 'Eccentric Wrist Flexor Curls', category: 'Exercise', definition: 'Use your other hand to assist the curl upward. Then remove the assisting hand and lower slowly over 4 full seconds.' },
  { term: 'Explosive Pull-Ups', category: 'Exercise', definition: 'Pull as fast as possible — try to get chest to bar. Used for power maintenance.' },
  { term: 'Face Pull (Band)', category: 'Exercise', definition: 'Anchor band high. Pull toward forehead. Rotate hands back into \'double bicep flex\' position. Trains rear deltoids.' },
  { term: 'Face Pulls with External Rotation', category: 'Exercise', definition: 'Anchor a band at forehead height. Pull the band toward your forehead while rotating the hands so elbows drop and wrists rotate back into a \'double bicep flex\' position at the top. Trains rear deltoids plus external rotators simultaneously — a staple prehab movement for pulling-heavy athletes.' },
  { term: 'Finger Extensions', category: 'Exercise', definition: 'Loop a standard rubber band around all five fingertips. Spread fingers apart against resistance, hold 2 seconds, close slowly.' },
  { term: 'Flutters', category: 'Exercise', definition: 'Lie on your back, legs straight and hovering. Alternate small up-down leg kicks. Keeps the lower back pressed into the floor.' },
  { term: 'Forearm Pronation / Supination', category: 'Exercise', definition: 'Hold a light dumbbell at one end, elbow bent 90°. Rotate palm up (supination), then palm down (pronation).' },
  { term: 'Front Lever Progression', category: 'Exercise', definition: 'Hang from bar. Lift body to horizontal. Progressions: Tuck → Advanced Tuck → Straddle → Full.' },
  { term: 'Front Lever Tuck Holds', category: 'Exercise', definition: 'Hang from a bar. Pull the knees to the chest and rotate the hips until the torso is horizontal. Regression of the full front lever; builds core-to-lat connection.' },
  { term: 'Glute Bridges', category: 'Exercise', definition: 'Lie on your back with knees bent. Drive through the heels to lift the hips until the body is a straight line from shoulders to knees. Squeeze glutes at the top.' },
  { term: 'Goblet Squat', category: 'Exercise', definition: 'Hold weight at chest height. Squat until hips pass knees. Focus: chest up, knees track over toes.' },
  { term: 'Hammer Curls', category: 'Exercise', definition: 'Hold dumbbells at sides, thumbs up (neutral grip). Curl to shoulder. Protects the Brachioradialis.' },
  { term: 'Hang Knee Raises', category: 'Exercise', definition: 'Hang from a bar. Raise the knees toward the chest. Slow and controlled — no kipping or swinging.' },
  { term: 'Hang Leg Raises', category: 'Exercise', definition: 'Hang from a bar. Raise straight legs to horizontal (or higher). Harder variant of hanging knee raises. Builds lower abs and hip flexors.' },
  { term: 'Hanging Windshield Wipers', category: 'Exercise', definition: 'Hang from bar. Lift legs to 90°. Rotate slowly side-to-side using obliques.' },
  { term: 'Hollow Body Hold', category: 'Exercise', definition: 'Lie on back. Lift shoulders and legs off ground. Arms overhead (biceps by ears). Press lower back into floor.' },
  { term: 'I-Y-T Raises', category: 'Exercise', definition: 'Lie prone. Raise the arms in the shape of each letter — I (straight ahead), Y (45°), T (straight out). Small weights or none. Activates weak mid-back muscles.' },
  { term: 'Inverted Rows', category: 'Exercise', definition: 'Set up TRX/rings/bar at waist height. Lie underneath and pull chest up while keeping body in a straight plank.' },
  { term: 'Knee Raises', category: 'Exercise', definition: 'Hang from a bar or support. Lift knees toward the chest. Starter progression to hang leg raises; builds hip-flexor strength and core control.' },
  { term: 'L-Sit', category: 'Exercise', definition: 'Support body with straight arms. Lift legs to horizontal. Trains hip flexor and anterior core strength.' },
  { term: 'Linked Laps', category: 'Exercise', definition: 'Climb a route, lower off, immediately climb it again. Chain 2-3 laps back to back. Builds route-specific power-endurance.' },
  { term: 'Lunges', category: 'Exercise', definition: 'Step one foot forward. Lower the back knee toward the ground. Push through the front heel to return. Alternate sides or do all reps on one side first.' },
  { term: 'Lying Leg Raises', category: 'Exercise', definition: 'Lie flat on your back. Raise straight legs to vertical, lower slowly without letting them touch the floor. Lower back stays pressed into the floor.' },
  { term: 'Mountain Climbers', category: 'Exercise', definition: 'Start in a push-up position. Drive one knee toward the chest, then alternate quickly. Keep the hips low and the core tight.' },
  { term: 'Overhead Press', category: 'Exercise', definition: 'Barbell or dumbbell. Press from shoulder height to full lockout overhead. Core braced; ribs tucked.' },
  { term: 'Pallof Press', category: 'Exercise', definition: 'Stand perpendicular to a cable or band. Hold the handle at the chest, press straight out, return. The core resists rotation — that\'s the point. Anti-rotation core work.' },
  { term: 'Passive Bar Hang (Dead Hang)', category: 'Exercise', definition: 'Hang from a bar with straight arms, feet off ground. Shoulders slightly active — pulled away from ears.' },
  { term: 'Penguins', category: 'Exercise', definition: 'Lie on your back, knees bent, arms at sides. Alternate reaching toward each heel with a slight crunch. Hits the obliques without spinal flexion.' },
  { term: 'Plank (Forearm)', category: 'Exercise', definition: 'Forearms on ground. Straight line head to heels. Squeeze glutes and pull belly button toward spine.' },
  { term: 'Plank Hip Dips', category: 'Exercise', definition: 'From a forearm plank, rotate the hips side to side so they nearly touch the floor. Dynamic oblique work with a plank base.' },
  { term: 'Push-Up to Plank', category: 'Exercise', definition: 'From a forearm plank, push up to a high plank one arm at a time, then return. Trains shoulder stability and anti-rotation under changing support.' },
  { term: 'Push-Ups', category: 'Exercise', definition: 'Elbows at 45° — not flared to a \'T.\' Full range of motion. Antagonist work — non-negotiable for shoulder health.' },
  { term: 'Reverse Lunges', category: 'Exercise', definition: 'Step one foot back instead of forward. Lower the back knee toward the floor, then drive the front heel to return. Easier on the knees than forward lunges.' },
  { term: 'Rice Bucket Extensors', category: 'Exercise', definition: 'Plunge hand into a bucket of dry rice. Open and close the hand, spread fingers, and rotate the wrist against resistance.' },
  { term: 'RKC Plank', category: 'Exercise', definition: 'Standard forearm plank at MAX tension. Clench fists, squeeze glutes at max effort, pull elbows toward toes.' },
  { term: 'Romanian Deadlift (RDL)', category: 'Exercise', definition: 'Hold weight at hips. Hinge forward with slight knee bend, lowering weight toward shins.' },
  { term: 'Russian Twists', category: 'Exercise', definition: 'Sit on floor, lean back slightly. Twist torso side-to-side. Rotation from the obliques.' },
  { term: 'Scapular Pull-Ups', category: 'Exercise', definition: 'Hang from a pull-up bar with arms fully extended. Without bending the elbows, pull the shoulder blades down and together — the body rises 1-2 inches. Lower with control. Trains scapular retraction and depression strength; the foundation of safe pulling under load.' },
  { term: 'Scapular Punches', category: 'Exercise', definition: 'In a push-up position (knees or feet). Keep arms straight. Protract the shoulder blades (push the ground away) then retract. Works the serratus anterior — a chronically weak link in climbers.' },
  { term: 'Scapular Shrugs (Hanging)', category: 'Exercise', definition: 'Hang from bar, arms straight. Without bending elbows, pull shoulders DOWN (away from ears), lifting body slightly.' },
  { term: 'Side Plank', category: 'Exercise', definition: 'Lie on one side, prop up on the forearm. Lift the hips so the body is a straight line from feet to head. Hold. Hits obliques and lateral core stability.' },
  { term: 'Side/Front Delt Raises', category: 'Exercise', definition: 'Stand with light dumbbells. Raise arms to the sides (lateral) or front to shoulder height. Pause at the top, lower slowly. Targets the shoulder musculature often missed by pulling.' },
  { term: 'Squats', category: 'Exercise', definition: 'Stand with feet shoulder-width. Sit back and down until the hips pass the knees. Drive through the heels to stand. Chest up, knees track over toes.' },
  { term: 'Step-Ups', category: 'Exercise', definition: 'Step onto a box with one foot. Drive through the heel to stand on the box. Step down with control. Alternate sides.' },
  { term: 'Supermans', category: 'Exercise', definition: 'Lie face down. Raise arms and legs off the ground simultaneously. Hold briefly. Strengthens the posterior chain and spinal erectors.' },
  { term: 'Toes-to-Bar', category: 'Exercise', definition: 'Hang from bar. Lift toes to bar (or knees to chest). Control the descent.' },
  { term: 'V-Ups', category: 'Exercise', definition: 'Lie on your back with arms overhead and legs straight. Simultaneously lift arms and legs to meet over the hips in a V. Slow and controlled.' },
  { term: 'Wall Angels', category: 'Exercise', definition: 'Stand with back against wall, feet 6 inches away. Arms in \'W\' shape. Slide up into \'Y\' without elbows or wrists leaving wall.' },
  { term: 'Wide-Grip Pull-Ups', category: 'Exercise', definition: 'Hands wider than shoulder-width. Explosive up, 3-second controlled descent (eccentric).' },
  { term: 'Wrist Extensor Curls', category: 'Exercise', definition: 'Forearm on thigh, palm down. Lift back of hand upward, lower slowly over 3–4 seconds.' },
  { term: 'Wrist Flexor Curls', category: 'Exercise', definition: 'Forearm on thigh, palm up. Curl wrist upward slowly.' },

  // ── Mobility ──────────────────────────────────────────────────────────
  { term: 'Cat-Cow', category: 'Mobility', definition: 'Hands and knees. Cow: inhale, drop belly to floor, look up. Cat: exhale, arch back, look at knees. Warms up the thoracic spine.' },
  { term: 'Deep Squat Hold', category: 'Mobility', definition: 'Feet shoulder-width. Squat deep with heels on ground. Chest tall. Opens the hips and ankles, and is restorative for the lower back.' },
  { term: 'Down Dog to Cobra', category: 'Mobility', definition: 'Down Dog: hands and feet on floor, hips high. Cobra: swoop down, lowering hips to floor, arching chest to sky. Mobilizes shoulders, hamstrings, and the thoracic spine — a classic climbing warmup.' },
  { term: 'Frog Stretch', category: 'Mobility', definition: 'On hands and knees, spread knees wide with feet in line. Sit hips back to target the groin. Opens the adductors — critical for high-step and drop-knee positions.' },
  { term: 'Pigeon Pose', category: 'Mobility', definition: 'From plank, bring knee forward behind wrist. Shin diagonal. Left leg straight back. Lean forward. Stretches the glutes, outer hip, and hip rotators.' },
  { term: 'Thoracic Rotations', category: 'Mobility', definition: 'Hands and knees. Right hand behind head. Touch right elbow to left wrist (under body), then rotate open pointing right elbow to ceiling. Mobilizes the upper back — critical for reach and twist moves.' },
  { term: 'World\'s Greatest Stretch', category: 'Mobility', definition: 'High plank. Step right foot outside right hand (deep lunge). Left hand planted. Reach right hand to ceiling, twisting chest open. Hits the hips, thoracic spine, and hamstrings in one flow.' },
  { term: 'Zone 1 Cardio', category: 'Mobility', definition: 'Very easy cardio where you can breathe through your nose and speak in full sentences. RPE 2–3.' },

  // ── Concept ───────────────────────────────────────────────────────────
  { term: 'Box Breathing', category: 'Concept', definition: 'A nervous system regulation tool. Inhale 4 seconds → Hold 4 seconds → Exhale 4 seconds → Hold 4 seconds.' },
  { term: 'Deload Week', category: 'Concept', definition: 'A planned reduction in training volume (typically 20–40%) while maintaining intensity. Allows connective tissue to consolidate adaptation.' },
  { term: 'Eccentric', category: 'Concept', definition: 'The lowering phase of an exercise where the muscle lengthens under tension. Eccentric loading is the primary stimulus for tendon collagen remodeling.' },
  { term: 'Flow State', category: 'Concept', definition: 'The state of effortless, fully absorbed performance. Requires: challenge-skill balance, clear goals, and immediate feedback.' },
  { term: 'Isometric', category: 'Concept', definition: 'A static muscle contraction where muscle length does not change and the joint angle remains stationary (e.g. holding a plank or a lock-off).' },
  { term: 'RPE (Rate of Perceived Exertion)', category: 'Concept', definition: 'A subjective 1–10 scale rating how hard an effort feels, used to gauge training intensity without measuring exact load. As a rough guide: 1–3 is very easy (warm-up), 4–5 moderate, 6–7 working hard, 8–9 very hard, and 10 is all-out max.' },
  { term: 'Scapular Engagement', category: 'Concept', definition: 'Pulling the shoulder blades down and back to lock the shoulder joint in a safe position. Essential for catching dynos, hanging, and pulling.' },
  { term: 'Tendon Density', category: 'Concept', definition: 'The structural thickness of a tendon. Built through long-duration, low-intensity isometric loading (30–45 second holds).' },
  { term: 'The Commitment Switch', category: 'Concept', definition: 'A mental protocol for overriding the fear reflex on committing moves. Explode with 100% power but do NOT attempt to latch the hold for the first few attempts.' },
  { term: 'The Polarization Model', category: 'Concept', definition: 'Training with clear separation between high-intensity and low-intensity days. Hard days are genuinely hard. Easy days are genuinely easy.' },
  { term: 'Time Under Tension (TUT)', category: 'Concept', definition: 'The total amount of time a muscle is resisting weight during a set. The primary variable in Density Hangs and Repeaters.' },
  { term: 'Total Max Weight', category: 'Concept', definition: 'Current Bodyweight + Max Added Weight from the Field Test. All hangboard percentages are calculated from this figure.' },
  { term: 'Visualization', category: 'Concept', definition: 'Mentally rehearsing the entire climb before leaving the ground. See every hand and foot placement in sequence to prime your nervous system.' },
];

/** Normalised lookup key: exact term, case and surrounding space aside. */
function key(term: string): string {
  return term.trim().toLowerCase();
}

const BY_KEY = new Map(GLOSSARY.map((entry) => [key(entry.term), entry]));

/**
 * The definition for an exact term, or undefined.
 *
 * Deliberately exact rather than fuzzy. A matcher that guessed would offer
 * "Deadlift" against "Deadhang" and teach the climber the wrong thing, and
 * an authored exercise name is a name — if it does not match, the answer is
 * to align the name or add the term, not to loosen the match.
 */
export function lookup(term: string): GlossaryEntry | undefined {
  return BY_KEY.get(key(term));
}

export function hasTerm(term: string): boolean {
  return BY_KEY.has(key(term));
}

/** Free-text search across terms and definitions, optionally within one category. */
export function searchGlossary(
  query: string,
  category: GlossaryCategory | null = null,
): GlossaryEntry[] {
  const needle = query.trim().toLowerCase();
  return GLOSSARY.filter((entry) => {
    if (category !== null && entry.category !== category) return false;
    if (needle === '') return true;
    return (
      entry.term.toLowerCase().includes(needle) ||
      entry.definition.toLowerCase().includes(needle)
    );
  });
}

/** Entries grouped for display, in `CATEGORY_ORDER`, empty groups dropped. */
export function groupByCategory(
  entries: readonly GlossaryEntry[],
): { category: GlossaryCategory; entries: GlossaryEntry[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    entries: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0);
}
