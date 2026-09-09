import type { Guide } from './types';

export const GROUND_ZERO: Guide = {
  id: 'ground_zero',
  name: 'GROUND ZERO',
  subtitle: '12-Week Body Preparation Program',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'You don\'t launch a rocket from a cracked launchpad.' },
        { kind: 'p', text: 'Before you start pulling, crimping, and explosive movements, you need a body that can handle the stress. Most climbing injuries occur because a climber\'s prime movers were strong, but their stabilizers were underdeveloped.' },
        { kind: 'p', text: 'Ground Zero is not about climbing grades. It is about building a bulletproof chassis — stable shoulders, a steel-plated core, and the mobility required to move efficiently on the wall.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: [
            'Profile',
            'Description',
          ],
          rows: [
            [ 'The Recruit', 'Zero climbing experience. Prepare your body before buying shoes.'],
            [ 'The Rehabber', 'Coming back from a break or injury. Rebuild confidence and stability.'],
            [ 'The Stiff', 'You have strength but can\'t touch your toes or raise arms overhead without arching.'],
          ],
        },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any tendon or joint',
            'Numbness or tingling in fingers, hands, or arms',
            'Sudden joint instability',
          ],
          footer: 'Mild muscular fatigue is normal. Joint pain is not.',
        },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: '**MISSION:** Establish your baseline — not maximum effort. We are looking for red flags, asymmetries, and movement deficits.' },
        { kind: 'h', text: 'Part 1 — Mobility Screen' },
        { kind: 'p', text: '**1. Wall Angel Test:** Stand with back flat against wall. Raise arms W→Y without elbows leaving wall. Record: Pass/Fail + which side loses contact first.' },
        { kind: 'p', text: '**2. Toe Touch:** Stand, knees straight, reach for toes. Record: distance from fingertips to floor.' },
        { kind: 'h', text: 'Part 2 — Structural Capacity' },
        { kind: 'p', text: '**Core Plank:** Forearm plank, straight line shoulders to heels. Record max time until form breaks.\n**Scapular Push-Up:** High plank, sink chest by pinching blades, push apart. Max reps in 60s.\n**Dead Bug:** Can you complete 20 reps (10/side) without lower back lifting? Yes/No.' },
      ],
    },
    {
      title: 'Operating Procedures',
      content: [
        { kind: 'h', text: 'Schedule & Frequency' },
        { kind: 'p', text: '• **Frequency:** 3–4 sessions per week. Rest days are not optional — tendons have lower blood supply and require longer recovery. ✓\n• **Core Pillar:** Dedicated Core Circuit runs twice per week, every week. No exceptions.' },
        { kind: 'h', text: 'RPE Scale' },
        {
          kind: 'table',
          head: [
            'RPE',
            'Feels Like',
            'When',
          ],
          rows: [
            [ '1–3', 'Very Easy. Full conversation.', 'Warm-up only'],
            [ '4–5', 'Moderate. Breath slightly elevated.', 'Month 1 working sets'],
            [ '6–7', 'Working Hard. Short sentences.', 'Month 2–3 working sets'],
            [ '8–9', 'Very Hard. Near failure.', 'Week 11 peak + testing'],
            [ '10', 'Max Effort. Form breaks down.', 'Avoid (testing only)'],
          ],
        },
        { kind: 'note', text: 'Target RPE 4–6 in Month 1, RPE 5–7 in Months 2 and 3.' },
        { kind: 'h', text: 'Equipment' },
        { kind: 'list', items: [
          'Resistance Bands (light Therabands + medium loop)',
          'Light Dumbbells (2–10 lbs, water bottles work)',
          'Yoga Mat',
          'TRX / Rings / Pull-Up Bar',
          'Rubber Bands ×2 (for Finger Extensions)',
        ] },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: 'Three session types. **You choose which days.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'Mission',
          ],
          rows: [
            [ 'Structural Integrity', 'Shoulders, Pull, Push, Forearms, Legs', '45–60 min', 'Build the foundation. Rotator cuff, pulling mechanics, tendon prep.'],
            [ 'Mobility & Core', 'Mobility Flow + Core Circuit', '30–40 min', 'Unlock & strengthen. Prescribed Mobility Flow + Core Circuit — The Pillar.'],
            [ 'Recovery', 'Rest / Light Activity', '0–20 min', 'Full stop. Light walk or static stretching OK.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            'Frequency: 3–4 sessions per week.',
            'Do not do two Structural Integrity sessions back-to-back.',
            'Core Circuit — The Pillar runs twice per week. No exceptions.',
            'Mobility & Core can follow a Structural day — it aids recovery.',
            'At least 2 full rest days per week.',
          ],
          footer: 'A Tuesday Structural session is identical to a Saturday Structural session.',
        },
        { kind: 'h', text: 'Sample Layouts' },
        {
          kind: 'table',
          head: [
            '',
            'Mon',
            'Tue',
            'Wed',
            'Thu',
            'Fri',
            'Sat',
            'Sun',
          ],
          rows: [
            [ 'A', 'Structural', 'Mob & Core', 'Rest', 'Structural + Core', 'Mob & Recovery', 'Rest', 'Rest'],
            [ 'B', 'Rest', 'Structural', 'Mob & Core', 'Rest', 'Structural + Core', 'Mob & Recovery', 'Rest'],
          ],
        },
      ],
    },
    {
      title: 'Warm-Up Protocol',
      content: [
        { kind: 'p', text: 'Required before every Structural Integrity session. ~10 minutes total.' },
        { kind: 'p', text: '**1. Pulse Raise (3 min):** Jumping jacks or brisk walk.\n**2. Joint Prep (3 min):** Arm Circles 10 each way · Cat-Cow 10 cycles · Thoracic Rotations 5/side.\n**3. Band Pass-Throughs (2 min):** Wide grip, arc overhead to lower back. 10 reps.\n**4. Band Pull-Aparts (2 min):** Straight arms, pull apart to chest. 15 reps.' },
        {
          kind: 'warn',
          title: 'STATIC STRETCHING WARNING',
          items: [
            'Do NOT use long static holds as your warm-up.',
            'Static stretching (30+ seconds) before dynamic activity reduces muscle elasticity.',
            'Static stretching belongs AFTER sessions or on rest days. ✓',
          ],
        },
      ],
    },
    {
      title: 'Month 1: The Alignment (Wks 1–4)',
      content: [
        { kind: 'p', text: '**MISSION:** Wake up the stabilizers. We are establishing the neural connection to the rotator cuff and lower trapezius muscles.' },
        { kind: 'note', text: 'These exercises may feel too easy. They are supposed to. The goal is to feel the small, deep stabilizers turn on.' },
        { kind: 'h', text: 'Structural Integrity A' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'SHOULDER HEALTH — The Rotator Cuff',
          items: [
            'Internal / External Rotation (Band): 2×15 each side. Elbow pinned.',
            'Wall Angels: 2×10. Keep entire back flat.',
            'Scapular Punches: 2×15. Lie on back, punch up.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE PULL — Foundation',
          items: [
            'Band Lat Pulldowns: 3×12. Pull elbows toward back pockets.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE PUSH — Antagonist',
          items: [
            'Knee Push-Ups: 3×8–10. Elbows at 45°.',
            '★ Climbers who only pull develop imbalances leading to shoulder injuries.',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'FOREARM & ELBOW HEALTH',
          items: [
            'Wrist Flexor Curls: 2×20 (light)',
            'Wrist Extensor Curls: 2×20',
            'Finger Extensions (Rubber Band): 2×15. ★ Primary pulley prevention tool.',
          ],
        },
        {
          kind: 'exercises',
          group: 'E',
          name: 'LEGS',
          items: [
            'Box Sit-to-Stand: 3×10. Control the descent.',
          ],
        },
        { kind: 'p', text: 'Rest 45–90 seconds between sets. If form breaks, end the set.' },
        { kind: 'h', text: 'Core Circuit — The Pillar A' },
        { kind: 'p', text: '3 Rounds. Rest 60 seconds between rounds.' },
        {
          kind: 'table',
          head: [
            'Exercise',
            'Reps',
            'Cue',
          ],
          rows: [
            [ 'Dead Bugs', '12 reps (slow)', 'Lower back glued to floor.'],
            [ 'Glute Bridges', '15 reps', 'Squeeze at top 2 seconds.'],
            [ 'Core Plank', '30–45 sec', 'Trembling OK — sagging not OK.'],
          ],
        },
        { kind: 'h', text: 'Mobility Flow A' },
        {
          kind: 'table',
          head: [
            'Movement',
            'Reps',
            'Purpose',
          ],
          rows: [
            [ 'Cat-Cow', '10 cycles', 'Warm up the spine.'],
            [ 'Thoracic Rotations', '5/side', 'Open the thoracic spine.'],
            [ 'World\'s Greatest Stretch', '3/side', 'Full-body opener.'],
          ],
        },
        { kind: 'h', text: 'Weekly Focus' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Dead Hang',
          ],
          rows: [
            [ '1', 'Learning the movements. RPE 4.', '3×10s'],
            [ '2', 'Focus on symmetry.', '3×12s'],
            [ '3', 'Add 1-sec pause at peak contraction.', '3×15s'],
            [ '4', 'Add 3rd set to Shoulder Health.', '3×15s (active)'],
          ],
        },
      ],
    },
    {
      title: 'Month 2: The Armor (Wks 5–8)',
      content: [
        { kind: 'p', text: '**MISSION:** Build the armor. Stabilizers are active — now add resistance. Introduces Time Under Tension: slow the lowering phase. 3 seconds down, 1 second up.' },
        { kind: 'h', text: 'Structural Integrity B' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'SHOULDER HEALTH — Maintenance & Load',
          items: [
            'Band Face Pulls: 3×15. Pull to forehead, rotate to \'double bicep.\' ✓',
            'I-Y-T Raises (TRX or Light DBs): 3×8 each shape.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE PULL — Progressive Load',
          items: [
            'Inverted Rows: 3×8–10. Rigid plank body.',
            'Dead Hang: 3 sets × weekly target duration. ★',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE PUSH — Chest',
          items: [
            'Standard Push-Ups: 3×6–10. Full toes, elbows at 45°.',
            'DB Chest Fly: 2×12. Antagonist work.',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'FOREARM & ELBOW HEALTH — Building Durability',
          items: [
            'Wrist Flexor Curls: 3×15. Increase weight slightly.',
            'Wrist Extensor Curls: 3×15. 3 seconds down.',
            'Pronation/Supination: 2×15 each direction. ★ Key for Climber\'s Elbow prevention.',
            'Finger Extensions: 3×15. Increase resistance.',
          ],
        },
        {
          kind: 'exercises',
          group: 'E',
          name: 'LEGS',
          items: [
            'Reverse Lunges: 2×10/side. Chest tall.',
          ],
        },
        { kind: 'h', text: 'Core Circuit — The Pillar B' },
        { kind: 'p', text: '3 Rounds. Rest 60 seconds.' },
        {
          kind: 'table',
          head: [
            'Exercise',
            'Reps',
            'Cue',
          ],
          rows: [
            [ 'Bird-Dog', '10/side', 'Balance a glass of water on lower back.'],
            [ 'Side Plank', '30s/side', 'Hips high.'],
            [ 'Slow Mountain Climbers', '20 total', 'Knee to chest, hold 1s.'],
            [ 'Supermans', '10 reps (3s hold)', 'Neck neutral.'],
          ],
        },
        { kind: 'h', text: 'Mobility Flow B' },
        {
          kind: 'table',
          head: [
            'Movement',
            'Duration',
            'Purpose',
          ],
          rows: [
            [ 'World\'s Greatest Stretch', '5/side', 'Full-body mobility.'],
            [ 'Pigeon Pose', '60s/side', 'Deep hip opener.'],
            [ 'Down Dog to Cobra', '10 cycles', 'Spinal mobility + nerve flossing. ✓'],
          ],
        },
        { kind: 'h', text: 'Weekly Focus' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Dead Hang',
          ],
          rows: [
            [ '5', 'Intro new movements. RPE 5.', '3×18s'],
            [ '6', 'TUT: 3 seconds down, 1 up.', '3×20s'],
            [ '7', 'Antagonist Focus. Full stretch on Fly.', '3×23s'],
            [ '8', 'DELOAD. Reduce sets to 2.', '2×20s'],
          ],
        },
      ],
    },
    {
      title: 'Month 3: The Ignition (Wks 9–12)',
      content: [
        { kind: 'p', text: '**MISSION:** Work capacity. Sustained effort under fatigue. Rest periods shorten. Movements become more complex.' },
        { kind: 'note', text: 'Month 3 emphasizes performing good reps while tired — exactly what climbing demands.' },
        { kind: 'h', text: 'Structural Integrity C' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'SHOULDER HEALTH — Peak Load',
          items: [
            'Band Face Pulls: 3×15. This never leaves the program.',
            'Scapular Shrugs (Hanging): 3×8–10. ★ Foundation for pull-ups.',
            'Dead Hang: 3 sets × weekly target.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE PULL — Strength Endurance',
          items: [
            'DB Pullovers: 3×10. Feel the lat stretch.',
            'Bear Crawl: 3×30s. Knees 1 inch off floor.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE PUSH — Complex',
          items: [
            'Push-Up to Plank: 3×10. Minimize hip rotation.',
            'Side Delt Raises: 3×12. Light weight.',
            'Front Delt Raises: 3×12. Thumbs up.',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'FOREARM & ELBOW HEALTH — Tendon Conditioning',
          items: [
            'Eccentric Wrist Flexor Curls: 3×10. 4 seconds down. ✓',
            'Wrist Extensor Curls: 3×12.',
            'Finger Extensions: 3×20. Add 2s isometric hold.',
          ],
        },
        {
          kind: 'exercises',
          group: 'E',
          name: 'LEGS',
          items: [
            'Step-Ups: 3×10/side. 3-second descent.',
          ],
        },
        { kind: 'h', text: 'Core Circuit — The Pillar C' },
        { kind: 'p', text: '3 Rounds. Rest 45 seconds (shorter than Month 2).' },
        {
          kind: 'table',
          head: [
            'Exercise',
            'Reps',
            'Cue',
          ],
          rows: [
            [ 'Hollow Body Hold', 'Max time (aim 20–30s)', 'Lower back PRESSED into floor.'],
            [ 'Lying Leg Raises', '10–12 reps', 'Slow descent.'],
            [ 'Plank Hip Dips', '20 total', 'Works obliques.'],
            [ 'Supermans', '10 reps (3s hold)', 'Neck neutral.'],
          ],
        },
        { kind: 'h', text: 'Mobility Flow C' },
        {
          kind: 'table',
          head: [
            'Movement',
            'Duration',
            'Purpose',
          ],
          rows: [
            [ 'World\'s Greatest Stretch', '5/side', 'Flowing pace.'],
            [ 'Deep Squat Hold', '30–60s', 'Opens hips and ankles. ✓'],
            [ 'Thoracic Rotations', '10/side', 'Warm up the climbing spine.'],
          ],
        },
        { kind: 'h', text: 'Weekly Focus' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Dead Hang',
          ],
          rows: [
            [ '9', 'Form perfection under fatigue.', '3×25s'],
            [ '10', 'Reduce rest to 45s. Build work capacity.', '3×28s'],
            [ '11', 'The Peak. RPE 7–8.', '3×30s — graduation standard'],
            [ '12', 'GRADUATION. Retest all baselines.', 'Dead Hang'],
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'Ground Zero is about quality, not load. These are the common faults on the stabilizer work — fix the pattern before adding weight or reps.' },
        { kind: 'p', text: '**You shake or sweat hard on the \'easy\' shoulder work:** That is your big muscles compensating for sleepy stabilizers. Drop the weight or band tension, slow down, and chase the squeeze — you want the small deep muscles to switch on, not the prime movers to burn out.' },
        { kind: 'p', text: '**You can\'t feel the target muscle:** Reduce range and slow the tempo. On band rotations, pin the elbow to your ribs and move only the forearm. On lat pulldowns, pull with the armpits, not the hands. Mind-muscle connection comes before load.' },
        { kind: 'p', text: '**Your lower back lifts on Dead Bugs:** You are out of range. Extend the limb only as far as you can keep your back glued to the floor. Too hard? Start with arms only, feet planted, and add range as control improves.' },
        { kind: 'p', text: '**You fail the Wall Angel (elbows or back pop off):** That is your current mobility, not a failure. Stop where contact breaks and work there — range opens over weeks. Forcing past your limit just recruits the wrong muscles.' },
        { kind: 'p', text: '**You\'re grinding sets to failure:** Wrong dial. We train to quality — when form breaks, the set is over. Finish every set feeling like you had 2–4 clean reps left. A broken rep is a wasted rep.' },
        { kind: 'p', text: '**You\'re tempted to cheat the reps or range:** The whole program is honest data and clean patterns. Cheating range on the screen or the drills only hides the deficit you came here to fix.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**Tendons Recover Slower Than Muscle:** Ligaments and tendons have far lower blood supply than muscle, so they need longer recovery windows. Rest days are not optional — they are when the chassis actually gets built. Two-plus full rest days per week, every week.' },
        { kind: 'p', text: '**Eccentrics Build Tendons:** The slow lowering phase — 3–4 seconds down on rows, push-ups, and wrist curls — is where connective tissue adapts. That is why Month 2 adds Time Under Tension and Month 3 adds eccentric wrist flexor curls. Do not rush the lowering.' },
        { kind: 'p', text: '**Finger Extensions, Every Session:** Rubber-band finger extensions counterbalance the powerful flexors and are your primary defense against A2 pulley injury once you start climbing. They appear in every month for a reason — never skip them. ★' },
        { kind: 'p', text: '**The Week 8 Deload:** Reduce all sets to 2 and let tissue consolidate the adaptation. Deloads are a tool, not a reward — skipping Week 8 borrows against Month 3.' },
        {
          kind: 'warn',
          title: 'BEFORE YOU TOUCH THE WALL',
          items: [
            'The A2 pulley adapts to gradual load, not pre-loading alone — Ground Zero conditions the tendon, climbing finishes the job.',
            'Your first 4–6 weeks of real climbing: moderate holds only, no aggressive crimping.',
            'Warm up 10 minutes before touching any holds, and stop at the first sign of finger pain.',
          ],
          footer: 'Graduating Ground Zero means the chassis is ready — it does not mean your fingers are ready to crimp hard. Earn that gradually.',
        },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        { kind: 'p', text: 'Before advancing to Base Camp, check off each standard. If not met, repeat Month 3.' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
            'Why',
          ],
          rows: [
            [ 'Dead Hang', '30+ sec dead hang, pain-free', 'Tendon load tolerance.'],
            [ 'Max Push-Ups', '5–10 strict', 'Antagonist strength.'],
            [ 'Core Plank', '60s forearm plank, perfect form', 'Core tension = wall efficiency.'],
            [ 'Toe Touch', 'Within 2 inches of floor', 'Hamstring flexibility for high-stepping.'],
            [ 'Wall Angel', 'W→Y, no lift', 'Rotator cuff functioning.'],
            [ 'Wrist Extensor Curls', '3×15 pain-free', 'Extensor/flexor balance.'],
          ],
        },
        { kind: 'p', text: '**Next Step: BASE CAMP** — 12-Week Climbing Foundations. Apply this chassis to the wall.' },
      ],
    },
  ],
};
