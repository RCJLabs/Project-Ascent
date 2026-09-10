import type { Guide } from './types';

export const PEAK_PERFORMANCE: Guide = {
  id: 'peak_performance',
  name: 'PEAK PERFORMANCE',
  subtitle: '12-Week Advanced Bouldering Program',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'p', text: 'Designed for climbers who can consistently climb V8+, have 2–3+ years structured training, and are injury-free.' },
        { kind: 'h', text: 'Entry Requirements ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Grade', 'V8+ consistent'],
            [ 'Experience', '2–3+ years structured training'],
            [ 'Max Hang (20mm)', 'BW + 30 lbs (7s, half crimp)'],
            [ 'Weighted Pull-Ups', '3RM at BW + 25 lbs'],
            [ 'Max Push-Ups', '20+ strict'],
            [ 'Pain Status', 'Zero active pain'],
          ],
        },
        { kind: 'h', text: 'Why V10 Is Different' },
        {
          kind: 'table',
          head: [
            'Limiter',
            'How Addressed',
          ],
          rows: [
            [ '1. Max Finger Strength', 'Fingerboard Session: structured max hang protocol.'],
            [ '2. Movement Economy', 'Technique Session: deliberate practice on sub-max terrain.'],
            [ '3. Projecting Strategy', 'Projecting Session: structured isolation, linking, and logging.'],
          ],
        },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: 'Record these in Week 1, then re-test at the Week 6 mid-cycle, Week 11 peak, and Week 12 send. At this level, data is your edge — progress you never measured is progress you cannot trust.' },
        {
          kind: 'table',
          head: [
            'Metric',
            'How to Test',
          ],
          rows: [
            [ 'Max Hang — Half Crimp (20mm)', 'Heaviest added weight you hold cleanly for 7s, PIP at ~90°.'],
            [ 'Max Hang — Open Hand (20mm)', 'Same protocol, fingers extended over the edge.'],
            [ 'Max Hang — 3-Finger Drag (20mm)', 'Same protocol, index/middle/ring, no thumb.'],
            [ 'Hardest Flash', 'Hardest grade you flash on your first session.'],
            [ 'Hardest Send', 'Hardest boulder you can send this week.'],
            [ 'Your Project', 'Name + grade of the V9–V11 you will work all cycle.'],
          ],
        },
        { kind: 'note', text: 'Identify your project in Week 1 and commit to it. The entire 12 weeks point at one problem — a moving target gets nothing built.' },
      ],
    },
    {
      title: 'Weekly Structure',
      content: [
        { kind: 'p', text: 'Four session types + recovery. **You choose which days.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
          ],
          rows: [
            [ 'Max Intensity Bouldering', 'Limit Climbing', '~2 hrs'],
            [ 'Technique & Movement', 'Movement Economy', '~2 hrs'],
            [ 'Fingerboard & Armor', 'Structural Loading', '60–75 min'],
            [ 'Projecting & Mental Game', 'Targeted Redpoints', '2–2.5 hrs'],
            [ 'Recovery & Mobility', 'Rest / Mobility', '20–30 min'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            '4 days/week. Hard/Easy alternation mandatory.',
            '48 hours min between Max Intensity and Fingerboard. ★',
            'Technique session stays low-intensity.',
            'Projecting follows a rest or technique day.',
            'No climbing on fingerboard day.',
            'Sleep 8 hours — non-negotiable.',
          ],
        },
      ],
    },
    {
      title: '12-Week Periodization',
      content: [
        { kind: 'p', text: 'Double-periodization with two deload windows. ★' },
        {
          kind: 'table',
          head: [
            'Weeks',
            'Phase',
            'Focus',
            'Intensity',
          ],
          rows: [
            [ '1–4', 'BUILD', 'Establish baseline loads. Find working weights.', '80%'],
            [ '5', 'DELOAD 1', 'Cut volume 40%. Keep intensity. Tendon recovery. ✓', '80%'],
            [ '6–8', 'INTENSIFY', 'Push limit harder. Add hangboard weight.', '90–95%'],
            [ '9', 'DELOAD 2 ★', 'Second recovery window. Critical for tendons.', '80%'],
            [ '10–11', 'PEAK', 'Highest intensity, reduced volume. Sharpen.', '95–100%'],
            [ '12', 'SEND', 'Deload volume. All energy toward project.', 'Recovery'],
          ],
        },
        { kind: 'note', text: 'Why two deloads? Muscles adapt in days–weeks. Tendons adapt in weeks–months. Your muscles will always feel ready before your tendons are. ✓' },
      ],
    },
    {
      title: 'Fingerboard Protocol',
      content: [
        { kind: 'h', text: 'Max Hang Setup' },
        { kind: 'p', text: 'Edge: 18–20mm. Duration: 7–10s dead hangs. Sets: 4–6 per grip. Rest: 3 min min. Progress in 2.5 lb increments.' },
        { kind: 'h', text: 'Grip Positions' },
        {
          kind: 'table',
          head: [
            'Position',
            'Priority',
          ],
          rows: [
            [ 'Half Crimp — PIP at ~90°', 'Primary'],
            [ 'Open Hand — fingers extended', 'Primary'],
            [ '3-Finger Drag — index, middle, ring', 'Secondary'],
          ],
        },
        { kind: 'h', text: '12-Week Progression ★' },
        {
          kind: 'table',
          head: [
            'Weeks',
            'Phase',
            'Sets',
            'Loading',
          ],
          rows: [
            [ '1–4', 'Build', '4×7–10s/grip', 'BW or light added'],
            [ '5', 'Deload 1', '3×7s/grip', 'Reduce 30–40%'],
            [ '6–8', 'Intensify', '5–6×7–10s/grip', 'Add 2.5–5 lbs'],
            [ '9', 'Deload 2 ★', '3×7s/grip', 'Reduce to Build weight'],
            [ '10–11', 'Peak', '4–5×7–10s/grip', 'Match or exceed Intensify'],
            [ '12', 'Send', '3×7s/grip', 'Reduce to Build weight'],
          ],
        },
        { kind: 'h', text: 'The Armor Block (~30 min)' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PUSH',
          items: [
            'Push-Ups or DB Press: 3×12 → 4×12 in Intensify, 2–3×12 in Peak & Send.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'SHOULDER MAINTENANCE ★',
          items: [
            'Band External Rotations: 3×15/arm',
            'Band Face Pulls: 3×15',
            'Passive Dead Hangs: 3×20s',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'FOREARM HEALTH ★',
          items: [
            'Wrist Extensor Curls: 3×15',
            'Finger Extensions: 3×20 ★',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'CORE — THE PILLAR',
          items: [
            'Hollow Body: 3×20–30s → 3×30–40s from Intensify',
            'L-Sits: 3×10–15s → 3×15–20s from Intensify',
            'Front Lever Progressions: 3×5–8s → 3×8–12s from Intensify',
          ],
        },
      ],
    },
    {
      title: 'The Projecting System',
      content: [
        { kind: 'h', text: 'Attempt Protocol' },
        {
          kind: 'table',
          head: [
            'Phase',
            'Protocol',
          ],
          rows: [
            [ 'Before', 'Visualize full sequence, eyes closed, 60 seconds minimum.'],
            [ 'During', 'Climb the sequence, not the grade.'],
            [ 'After', 'Note exactly where and why you fell. Be specific.'],
            [ 'Between', 'Rest 5–8 minutes. Use a timer.'],
          ],
        },
        { kind: 'h', text: 'Shrinking the Problem' },
        {
          kind: 'table',
          head: [
            'Step',
            'Protocol',
          ],
          rows: [
            [ '1. Move Isolation', 'Send every individual move.'],
            [ '2. Link Building', 'String 2–3 moves from crux outward.'],
            [ '3. Top-Down', 'Send top section first. Extend links down.'],
            [ '4. Full Redpoints', 'Only when steps 1–3 are consistent.'],
          ],
        },
      ],
    },
    {
      title: 'Mental Game',
      content: [
        { kind: 'h', text: 'Decoupling Outcome from Quality' },
        { kind: 'p', text: 'A perfect attempt that ends in a fall is a better training stimulus than a sloppy send. Rate attempt quality separately from result.' },
        { kind: 'h', text: 'Fear & Commitment' },
        { kind: 'list', items: [
          '**Isolation Drill:** Do the scary move on a lower-stakes version until automatic.',
          '**False Starts:** 2–3 attempts at full power, intentionally not grabbing. Proves the fall is safe.',
          '**Shrink the Scary Section:** Isolate the move, do it 10 times at low consequence.',
        ] },
        { kind: 'h', text: 'Flow States' },
        { kind: 'p', text: 'Flow = challenge-skill balance + clear goals + immediate feedback. Not luck — conditions. ✓' },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'Advanced plateaus are almost always multi-factorial. Find the _primary_ limiter and fix that one — not everything at once.' },
        { kind: 'p', text: '**Stuck at V8–V9 for months despite training consistently:** Consistency without progression is not productive. Audit your easy days first — are they actually easy, or secretly medium-hard? Medium training suppresses adaptation on both ends. Then check your hangboard: no added weight in 6+ weeks means you have stalled. Finally, do you have a real project, or are you just repeating V8s?' },
        { kind: 'p', text: '**You can do every move in isolation but cannot link them:** This is a capacity problem, not a strength problem — your local endurance base is too thin. Add flow-set work to your Technique day (link 5–8 problems without breaks), and check your rest between link attempts. Under 5 minutes and your body is rehearsing the wrong, fatigued pattern.' },
        { kind: 'p', text: '**Your fingers feel fine but you keep falling on the same move:** Film it — what you feel you are doing and what you are actually doing rarely match. Look at your body position 1–2 moves _before_ the crux; setup errors masquerade as strength failures. Most V10-range ‘strength’ failures are actually hip-position failures.' },
        { kind: 'p', text: '**You get pumped on problems that should not pump you:** Over-gripping. Ironically, more grip strength enables more over-gripping. Next technique session, climb V4–V5 using the minimum grip force that keeps you on — your forearms should feel almost nothing. If they do not, you are over-gripping by default.' },
        { kind: 'p', text: '**You lose motivation mid-project:** Usually a difficulty mismatch or a lack of visible progress markers. Run the Shrinking the Problem protocol so every session banks a new isolated move or link. If you genuinely cannot track progress, the project is too hard for this cycle — set a secondary project one grade below and rebuild momentum.' },
        { kind: 'p', text: '**Hangboard numbers climb but your climbing does not:** Finger strength is a prerequisite for V10, not a guarantee of it. The limiter has shifted to movement quality or projecting strategy. Pour 30 focused minutes per Technique session into your top two movement weaknesses for 3–4 weeks.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**48-Hour Rule:** Min 48 hrs between Max Intensity and Fingerboard. Hard floor, not guideline. ✓' },
        { kind: 'p', text: '**Sleep:** 8 hours non-negotiable. 7 acceptable. <6 actively counterproductive.' },
        { kind: 'h', text: 'Pulley Health' },
        {
          kind: 'table',
          head: [
            'Symptom',
            'Action',
          ],
          rows: [
            [ 'Tweaky feeling', 'Drop hangboard weight 50%.'],
            [ 'Sore to touch', 'Stop hangboard. Jugs only 5–7 days.'],
            [ 'Felt a pop', 'Stop climbing. See sports medicine doctor.'],
          ],
        },
        { kind: 'p', text: '**Tendon Timeline:** Muscles adapt in days–weeks. Tendons adapt in weeks–months. Train to the tendons, not the muscles. ✓' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any finger pulley (A2 or A4).',
            'A ‘pop’ sensation in a finger or tendon.',
            'Sharp pain on the inside of the elbow (medial epicondyle).',
            'Shoulder impingement pain during hangs or limit moves.',
          ],
          footer: 'An A2 pulley injury caught early (grade 1–2) resolves in 4–8 weeks. The same injury pushed through becomes a 3–6 month setback. The math is not close.',
        },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        { kind: 'p', text: 'Peak Performance is the top of the ladder. You graduate by sending — and by being ready to do it again, harder.' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Target',
            'Why It Matters',
          ],
          rows: [
            [ 'Project Send', 'Send your cycle project, or reach 9/10-quality attempts to the final move', 'Proof the system converged: strength, movement, and strategy all arrived together.'],
            [ 'Hangboard Gains', '+2.5–5 lbs across all three grips vs. Week 1', 'Finger strength — the V10 gatekeeper — measurably increased.'],
            [ 'Movement Economy', 'Noticeably less pump on V5–V7', 'You stopped over-gripping the easy terrain; efficiency improved.'],
            [ 'Pain Status ★', 'Zero finger, elbow, or shoulder pain through both deloads and Week 12', 'You loaded at the ceiling for 12 weeks — pain-free means the tendons kept pace.'],
          ],
        },
        { kind: 'p', text: '**Repeating the Cycle:** Add 2.5–5 lbs to every grip position and raise your target bouldering grade by one increment. If you did not send, keep the project and add a slightly harder secondary one. Tendons adapt in weeks to months — a conservative re-entry beats a re-injury.' },
        { kind: 'note', text: 'Week 12 is the ideal window to take your fitness outside. The strongest version of you is the one that just finished peaking — spend it on real rock.' },
      ],
    },
  ],
};
