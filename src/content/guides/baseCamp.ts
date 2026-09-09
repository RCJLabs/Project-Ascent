import type { Guide } from './types';

export const BASE_CAMP: Guide = {
  id: 'base_camp',
  name: 'BASE CAMP',
  subtitle: '12-Week Climbing Foundations',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'p', text: 'Base Camp is where your climbing life begins. We are training all the systems a new climber needs: technique, strength, endurance, and the mental game — in that order.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: [
            'Profile',
            'Description',
          ],
          rows: [
            [ 'The Fresh Graduate', 'Completed Ground Zero. Shoulders stable, core engaged, chassis bulletproof.'],
            [ 'The New Climber', '0–3 months climbing. Can hang from a bar for 30+ seconds.'],
            [ 'The Returning Climber', 'Coming back after 6+ months off. Need to rebuild safely.'],
          ],
        },
        { kind: 'h', text: 'Entry Requirements ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Dead Hang', '30+ seconds, pain-free'],
            [ 'Max Push-Ups', '5+ strict (or 15 knee push-ups)'],
            [ 'Core Plank', '60 seconds strict form'],
            [ 'Wrist Extensors', '3×15 pain-free'],
          ],
        },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: 'Establish your baseline before Week 1 — not a max effort, honest data. You cannot improve what you do not measure. Test on a fresh, well-rested day, record every number, and re-test at Week 6 and Week 12.' },
        { kind: 'h', text: 'Physical Readiness (The Engine)' },
        {
          kind: 'table',
          head: [
            'Test',
            'Protocol',
          ],
          rows: [
            [ 'Max Push-Ups', 'Chest to floor, full lockout. Max continuous reps (knees allowed — note it).'],
            [ 'Max Pull', 'Pull-Ups (if you can do 1+) or Inverted Rows. Max strict reps, no kipping.'],
            [ 'Dead Hang', 'Two hands, feet off, bar or large jugs. Max time until grip fails.'],
            [ 'Core Plank', 'Forearm plank, straight line shoulders to heels. Max time until form breaks.'],
          ],
        },
        { kind: 'h', text: 'Skill Assessment (The Wall)' },
        {
          kind: 'table',
          head: [
            'Test',
            'Protocol',
          ],
          rows: [
            [ 'Max Flash / On-Sight', 'Hardest grade you send cleanly on the first try — boulder or route.'],
            [ 'Capacity Test', '30 min bouldering (or 20 min ropes): count clean sends/laps at a comfortable grade.'],
          ],
        },
        { kind: 'note', text: 'Do not cheat the reps — shallow push-ups and kipping pull-ups only cheat your future self. The Week 6 and Week 12 retests are how you prove the 12 weeks worked.' },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: 'Four session types. **You choose which days.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'Mission',
          ],
          rows: [
            [ 'Technique', 'Climb: Drills', '45–60 min', 'Drill of the week. Low intensity, high focus.'],
            [ 'Engine Room', 'Strength & Core', '45–60 min', 'Off-wall strength (Push/Pull/Legs) + Core Circuit.'],
            [ 'Performance', 'Climb: Limit', '45–60 min', 'Hard effort. Limit bouldering or routes + Core Circuit.'],
            [ 'Recovery', 'Active Rest', '20–30 min', 'Light mobility, walking, or yoga. At least 1–2/week.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            'Frequency: 4–5 sessions per week. Consistency beats intensity.',
            'Technique before Performance — fresh nervous system for drilling.',
            'Engine Room on a non-climbing day.',
            'At least 1 full rest day between hard sessions.',
            'Core Circuit runs twice per week. No exceptions.',
          ],
          footer: 'A Tuesday Engine Room is identical to a Saturday Engine Room.',
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
            [ 'A', 'Technique', 'Engine + Core', 'Rest', 'Performance + Core', 'Rest', 'Recovery', 'Rest'],
            [ 'B', 'Technique', 'Rest', 'Engine + Core', 'Performance + Core', 'Rest', 'Technique', 'Recovery'],
          ],
        },
      ],
    },
    {
      title: 'Month 1: The Foundation (Wks 1–4)',
      content: [
        { kind: 'p', text: '**MISSION:** Build the physical base while installing core movement patterns on the wall.' },
        { kind: 'h', text: 'The Engine Room — Strength Protocol' },
        { kind: 'p', text: 'Execute once per week on a non-climbing day. Choose Track A or B.' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PUSH',
          items: [
            'Track A: Push-Ups 3×6–12',
            'Track B: Weighted Push-Ups or DB Bench 3×8–10',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PULL',
          items: [
            'Track A: Inverted Rows or Assisted Pull-Ups 3×5–10',
            'Track B: Strict Pull-Ups or Weighted Rows 3× to failure',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'LEGS',
          items: [
            'Track A: Glute Bridges or Lunges 3×10–15',
            'Track B: Goblet Squats or Deadlifts 3×8–10',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'CORE CIRCUIT — THE PILLAR',
          items: [
            'Pick 5 exercises · 40–60 seconds each · 20s rest · 2 rounds',
            'Pool: Plank / Knee Raise / Dead Bugs / Twists / V-Ups / Bird Dogs / Penguins / Flutters / Mtn Climbers',
          ],
        },
        { kind: 'h', text: 'Weekly Curriculum' },
        {
          kind: 'table',
          head: [
            'Week',
            'Technique Drill',
            'Performance',
            'Engine Room',
          ],
          rows: [
            [ '1', 'Sticky Feet — once placed, no adjusting', '3–5 limit attempts, 3 min rest. Core Circuit.', 'Track A or B protocol'],
            [ '2', 'Flagging — Reach Right? Flag Left.', 'Limit Block. Use a flag on your project.', 'Add 1–2 reps'],
            [ '3', 'Hover Hands — 3s pause over next hold', 'Increase intensity — one grade harder', 'If Track A easy, try Track B'],
            [ '4', 'The Trifecta — all three combined', 'Volume Day: max moderate boulders in 40 min', 'Perfect form, not max reps'],
          ],
        },
      ],
    },
    {
      title: 'Month 2: The Engine (Wks 5–8)',
      content: [
        { kind: 'p', text: '**MISSION:** Build the endurance system. Month 2 trains your body to sustain effort under fatigue.' },
        { kind: 'h', text: 'Engine Room — Strength Maintenance' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Track A: Lat Pulldowns 3×8–10',
            'Track B: Weighted Pull-Ups 3×5',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PUSH',
          items: [
            'Track A: Push-Ups 3× to failure',
            'Track B: DB Bench 3×8–10',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'LEGS',
          items: [
            'Track A: Step-Ups 3×12/leg',
            'Track B: RDLs 3×8–10',
          ],
        },
        { kind: 'h', text: 'Weekly Curriculum' },
        {
          kind: 'table',
          head: [
            'Week',
            'Endurance Protocol',
            'Performance',
            'Notes',
          ],
          rows: [
            [ '5', '4×4 Endurance Intervals', '45–60 min moderate (RPE 5–7). Core Circuit.', 'Don\'t let form break on last rep'],
            [ '6', 'Volume Build — add 1 extra set', 'Mini-Assessment: retest Max Push-Ups, Max Pull-Ups, Dead Hang', 'Quiet Feet mandatory'],
            [ '7', 'Continuous Circuit 5–10 min', 'Match Week 5 mileage in less time', 'Build density'],
            [ '8', 'DELOAD: Flow RPE 5', '30 min Trifecta practice. Get sleep.', 'Reduce all sets to 2'],
          ],
        },
      ],
    },
    {
      title: 'Month 3: The Headspace (Wks 9–12)',
      content: [
        { kind: 'p', text: '**MISSION:** Sharpen the mind. Mental training is physical training.' },
        { kind: 'h', text: 'Engine Room — Power Maintenance' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL-UPS + PUSH SUPERSET',
          items: [
            'Track A: 3×5 Pull-Ups + 10 Push',
            'Track B: 3×3 Heavy Pull-Ups + 5 Dips',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'LEGS',
          items: [
            'Track A: Box Jumps 3×5',
            'Track B: Weighted Box Jumps 3×5',
          ],
        },
        { kind: 'h', text: 'Weekly Curriculum' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Performance',
            'Notes',
          ],
          rows: [
            [ '9', 'Box Breathing + Projecting', 'Visualization before every attempt', 'Inhale 4s → Hold 4s → Exhale 4s → Hold 4s'],
            [ '10', 'Intro to Dynos', '30 min dynamic movement', 'Mini-Pops + Deadpoints on jugs'],
            [ '11', 'Send Week', 'Pick hardest project. 3–5 quality burns.', 'Box Breathe. Visualize. Send.'],
            [ '12', 'Graduation Retest', 'Repeat all Week 0 baselines', 'Record everything in Assessment Log'],
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'The most common early-climber faults and their fixes. Start here before adding training — most plateaus are technique, not strength.' },
        { kind: 'p', text: '**Feet keep slipping or banging the wall:** You are moving too fast and not watching placements. Drill Quiet Feet — eyes on the foot until it contacts, zero noise. If you can hear your feet, slow down.' },
        { kind: 'p', text: '**You barn-door / swing off sideways:** Reaching with the same-side hand and foot creates rotational instability. Use Flagging — reach right, flag left; reach left, flag right. The trailing leg is your counterweight.' },
        { kind: 'p', text: '**You grab holds frantically and over-grip:** Reactive grabbing burns energy and wrecks precision. Drill Hover Hands — pause 3 full seconds over the next hold before grabbing. It forces core tension and a deliberate placement.' },
        { kind: 'p', text: '**You panic and thrash when pumped:** Fatigue makes cowards of us all. When the forearms burn, the brain wants to flail. Train the opposite — find a jug, shake out, and use Box Breathing (4-4-4-4) to drop your heart rate before the next move.' },
        { kind: 'p', text: '**You are stuck at a grade:** Strength masking bad technique is the classic plateau. Drop two grades and run the Trifecta — Sticky Feet + Flagging + Hover Hands — until clean movement is automatic, then reapply it at your limit.' },
        { kind: 'p', text: '**Progress stalled and you feel beat up:** Check the boring stuff first. The foundation cracks where you cut corners — did you skip warm-ups, miss Core Circuit days, or train through joint pain? Fix adherence before changing the plan.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**Finger Extensions Are Non-Negotiable:** Climbing overloads the finger flexors. Rubber-band finger extensions (spread against resistance, hold 2s) counterbalance them and are your primary defense against A2 pulley injury. Every session. ★' },
        { kind: 'p', text: '**Tendon Timeline:** Muscles adapt in days; tendons and pulleys adapt in weeks to months. The Progressive Hang protocol builds that tolerance slowly on purpose — do not rush hang duration or edge size to chase a number.' },
        { kind: 'p', text: '**The Drop & The Roll:** Never jump from the top if you can down-climb — save your joints for the long game. If you fall, do not stick it stiff-legged; land soft, bend the knees, and roll.' },
        { kind: 'p', text: '**The Week 8 Deload:** Deload weeks are not optional. Reduce volume and let connective tissue consolidate what your muscles already built. Skipping it borrows against Month 3.' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any tendon or joint.',
            'Numbness or tingling in fingers, hands, or arms.',
            'Sudden joint instability or a \'pop\' sensation.',
          ],
          footer: 'Mild muscular fatigue or a light burn is normal. Joint pain is not. Pain persisting beyond 24–48 hours = see a doctor or PT before continuing.',
        },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        {
          kind: 'table',
          head: [
            'Metric',
            'Target',
          ],
          rows: [
            [ 'Max Push-Ups', '15+ (Track A) or 10+ weighted (Track B)'],
            [ 'Max Pull-Ups', '5+ strict pull-ups'],
            [ 'Dead Hang', '60+ seconds'],
            [ 'Core Plank', '90+ seconds'],
            [ 'Flash Grade', 'V1–V2 consistent'],
            [ 'Capacity Test', '4×4 completed with good form'],
          ],
        },
        { kind: 'p', text: '**Next:** Gravity Defied (dynamic climbing) or Lockdown (static power) or The Long Game (route endurance).' },
      ],
    },
    {
      title: 'Mental Game',
      content: [
        { kind: 'p', text: 'Strength and endurance are useless if you panic. Month 3 trains the mind — and these tools work from your first limit attempt, not just at graduation.' },
        { kind: 'h', text: 'Box Breathing' },
        { kind: 'p', text: 'A nervous-system reset for before every limit attempt: Inhale 4s → Hold 4s → Exhale 4s → Hold 4s. Two or three rounds drops your heart rate and quiets the panic reflex before you touch the wall.' },
        { kind: 'h', text: 'Visualization' },
        { kind: 'p', text: 'Before you leave the ground, rehearse the whole climb — every hand and foot in sequence. If you cannot \'see\' the move in your head, do not start the climb. Seeing it primes the nervous system to execute it.' },
        { kind: 'h', text: 'Commitment' },
        { kind: 'p', text: 'On send attempts: warm up perfectly, box breathe, visualize, then commit fully. Half-committed attempts teach hesitation. Trust the preparation and execute.' },
        { kind: 'note', text: 'Mental training is physical training. The climber who stays calm when the forearms burn out-performs the stronger climber who panics.' },
      ],
    },
  ],
};
