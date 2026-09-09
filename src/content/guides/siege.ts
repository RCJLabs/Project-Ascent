import type { Guide } from './types';

export const THE_SIEGE: Guide = {
  id: 'the_siege',
  name: 'THE SIEGE',
  subtitle: '12-Week Advanced Sport Projecting',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'You don\'t climb a 5.13. You lay siege to it.' },
        { kind: 'p', text: 'The Siege is Project Ascent\'s first advanced sport program. It assumes you\'ve already built the finger strength (Iron Grip), the aerobic engine (Long Game), and the technique base. What\'s left is the route itself — one specific, carefully chosen, hard route, worked methodically across 12 weeks.' },
        { kind: 'p', text: 'This isn\'t a strength program. It\'s a **projecting protocol**. The training happens on the route.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: [
            'Profile',
            'Description',
          ],
          rows: [
            [ 'The Redpoint Hunter', 'Consistently redpointing 5.12c/d. Ready to commit 12 weeks to a specific 5.13.'],
            [ 'The Iron Grip Graduate', 'Fingers are strong. Now translate to rope terrain.'],
            [ 'The Plateau Breaker', 'Tried and failed to redpoint a grade jump with casual projecting. Ready for structure.'],
          ],
        },
        { kind: 'h', text: 'Recommended Prerequisites ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Iron Grip Completion', 'OR equivalent finger-strength baseline'],
            [ 'Max Hang 20mm (7s)', 'Bodyweight + 30%'],
            [ 'Redpoint Grade', 'Confirmed 5.12d (or 5.12c on-sight)'],
            [ 'Climbing Experience', '3+ years structured training'],
            [ 'Pain Status', 'Zero active finger, elbow, or shoulder pain'],
          ],
        },
        { kind: 'note', text: 'If you don\'t meet the finger-strength bar, run Iron Grip first. Trying to siege 5.13 with 5.12 fingers builds injury, not sends.' },
      ],
    },
    {
      title: 'Project Selection — Week 1 is Critical',
      content: [
        { kind: 'p', text: 'The Siege is fundamentally about the route you pick. A bad pick wastes 12 weeks.' },
        { kind: 'h', text: 'The Three-Candidate Method' },
        { kind: 'p', text: 'Week 1, Session 1: visit 2–3 candidate routes. Attempt each on top-rope or with stick-clip. Work a handful of moves on each. By end of session, commit to ONE.' },
        {
          kind: 'table',
          head: [
            'Criterion',
            'How to Evaluate',
          ],
          rows: [
            [ 'Difficulty', '1–2 grades above your confirmed redpoint. NOT 3.'],
            [ 'First-Try Moves', 'You should do MOST individual moves first-try. Not all — if all, it\'s too easy.'],
            [ 'Crux Decodable', 'You can figure out a crux solution by end of Session 2. If not, it\'s too hard.'],
            [ 'Access', 'You can realistically climb it 2+ times per week for 12 weeks. Weather, gym time, drive, partner availability.'],
            [ 'Style Fit', 'It rewards something you\'re good at OR exposes a weakness you want to fix. Not both.'],
          ],
        },
        { kind: 'note', text: 'The romance of a perfect route is not the same as the right route for this cycle. Optimize for trainability.' },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: 'Four session types. 4 sessions per week. **Hard/Easy alternation is mandatory.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'Mission',
          ],
          rows: [
            [ 'Project Session', 'Decode / Link / Send', '90–120 min', 'The entire program happens here. Phase-dependent structure.'],
            [ 'Power-Endurance', 'Capacity / Doubles / Bursts', '45–75 min', 'Build and maintain the rope-specific engine.'],
            [ 'Fingerboard + Structural', 'Hangboard + Pull/Push/Core/Armor', '60–75 min', 'Protect the fingers. Maintain supporting strength.'],
            [ 'Rest / Mobility', 'Recovery', '20–30 min', 'Prescribed mobility flow. Sleep 8 hrs.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            '4 sessions/week. Hard/Easy alternation is mandatory.',
            'Project Session when fresh — schedule after a full rest day.',
            'Power-Endurance comes 48 hrs after a Project Session.',
            'Fingerboard + Structural on a non-climbing day.',
            'Never two hard climbing days back-to-back.',
            'At least 2 full rest days per week. Non-negotiable for tendons.',
          ],
        },
        { kind: 'h', text: 'Sample Layout' },
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
            [ 'Standard', 'Project', 'Fingerboard', 'Rest', 'Power-End', 'Rest', 'Project', 'Rest'],
          ],
        },
      ],
    },
    {
      title: 'Phase 1: Decode (Wks 1–4)',
      content: [
        { kind: 'p', text: '**MISSION:** Know every move on the route. Do not stress linking. Do not stress sending. Stress KNOWING.' },
        { kind: 'h', text: 'Project Session Protocol' },
        { kind: 'p', text: 'Work the project one move at a time. Use stick-clip or top-rope as needed. Figure out beta for each move, then rehearse the sequence. 4–6 attempts per session with 8–15 min rest between.' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Target',
          ],
          rows: [
            [ '1', 'Project Selection Session', 'Try 2–3 candidates. Commit to ONE by end of day.'],
            [ '2', 'Move-by-Move Decoding (Lower Half)', 'Solve every move below crux. Build a beta notebook.'],
            [ '3', 'Move-by-Move Decoding (Upper Half)', 'Solve crux + every move above. Note clipping stances.'],
            [ '4', 'Beta Rehearsal + Deload', 'Rehearse the full sequence from the rope. Half-volume week.'],
          ],
        },
        { kind: 'note', text: 'Rule of thumb: if you can\'t do a move after 3 serious attempts across 2 sessions, change your beta. Beta that doesn\'t work for YOUR body isn\'t beta.' },
        { kind: 'h', text: 'Off-Wall This Phase' },
        { kind: 'p', text: 'Fingerboard is **Max Hangs on the 20mm edge**. Warm up with a hang ladder from 30mm → 20mm before top sets. Add 2–5 lbs per week when the last set felt solid, not when it felt hard.' },
        { kind: 'p', text: 'Power-Endurance is **ARC (Capacity Laps)**. 15–20 min continuous climbing at RPE 3–4. Two rounds, 5 min rest between. Boring and foundational. Skip it and Phase 2 will hurt more.' },
      ],
    },
    {
      title: 'Phase 2: Link (Wks 5–8)',
      content: [
        { kind: 'p', text: '**MISSION:** Chain what you know. Your body is catching up to your knowledge.' },
        { kind: 'h', text: 'Project Session Protocol' },
        { kind: 'p', text: 'Linking, not redpointing. 2–3 quality burns per session with 15–20 min rest between.' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Target',
          ],
          rows: [
            [ '5', 'Short Links', '5–8 move sections, especially through the crux.'],
            [ '6', 'Extended Links', '10+ move sections. Link through the crux on your best burn.'],
            [ '7', 'Crux-Out Links', 'Bottom-to-crux OR crux-to-chains on one attempt per session.'],
            [ '8', 'Deload + One-Hang Attempts', 'Half-volume week. If linking well, try a one-hang — rest at a clip, continue.'],
          ],
        },
        {
          kind: 'warn',
          title: 'PROJECT PACE CHECK',
          items: [
            'If you\'re still falling BEFORE the crux by Week 8, the project is too hard. Drop a grade.',
            'If you\'re linking the full route by Week 7, the project may be too easy. Either finish it early and pick a harder project for the remaining weeks, or stay and polish for a confident send.',
            'By END of Week 8, at least one link should include the crux sequence.',
          ],
        },
        { kind: 'h', text: 'Off-Wall This Phase' },
        { kind: 'p', text: 'Fingerboard shifts to **Min-Edge Hangs** — a protocol unique to The Siege. Keep load at bodyweight; make the EDGE smaller. Start at 15mm. If you can hang 7 seconds with good form, drop to 14mm next session. This phase trains the specific finger strength hard sport routes demand — small crimps, not heavy loads on big edges. Target: down to 10–12mm with clean form by Week 8.' },
        { kind: 'note', text: 'Min-Edge Hangs replace Max Hangs because above your hangboard ceiling, ADDING weight no longer translates cleanly to smaller holds. Shrinking the EDGE does.' },
        { kind: 'p', text: 'Power-Endurance shifts to **linked rope intervals** — doubles, then triples. Weeks 5–6: pick 2 routes at 80–90% redpoint. Climb first, lower, immediately climb second. Rest 4–6 min between sets, 3–4 sets. Weeks 7–8: upgrade to triples — 3 routes back-to-back, 5–7 min rest, 2–3 sets. Teaches forearms to recover between crux sections.' },
      ],
    },
    {
      title: 'Phase 3: Send (Wks 9–12)',
      content: [
        { kind: 'p', text: '**MISSION:** Execution. Volume drops. Intensity peaks. Conditions matter.' },
        { kind: 'h', text: 'Project Session Protocol' },
        { kind: 'p', text: 'Single-attempt mode. 2–3 full redpoint burns per session with 20–30 min rest between. Climb in the coolest, driest part of the session. Warm up thoroughly but conserve skin and fingers.' },
        {
          kind: 'table',
          head: [
            'Week',
            'Focus',
            'Target',
          ],
          rows: [
            [ '9', 'Full Burns', '2–3 redpoint attempts per session. Build familiarity with the full route under fatigue.'],
            [ '10', 'One-Hang or Better', 'By end of week: at least one attempt where you got to the chains with a single hang.'],
            [ '11', 'Refining, Not Rehearsing', 'You should know every move cold. Burns are about execution, not exploration.'],
            [ '12', 'Send Window', 'Taper volume. Maximize recovery between attempts. Climb in peak conditions.'],
          ],
        },
        { kind: 'h', text: 'Off-Wall This Phase' },
        { kind: 'p', text: 'Fingerboard shifts to **Maintenance**: 3 sets on the 20mm edge at 80% of training max. You\'re not building finger strength — you\'re preserving what you built. Skip this session entirely in Week 12 if you\'re deep in send attempts.' },
        { kind: 'p', text: 'Power-Endurance shifts to **Redpoint-Specificity Bursts**: single all-out attempt, 20 min full rest, 1–2 more attempts. Mimics the pattern of actual send-day projecting. Taper volume in Week 12.' },
      ],
    },
    {
      title: 'Fingerboard Protocol Deep Dive',
      content: [
        { kind: 'h', text: 'Why Three Different Protocols?' },
        { kind: 'p', text: 'Most hangboard programs use one protocol across all phases. The Siege uses three because the demands shift: Phase 1 rebuilds from deload, Phase 2 trains hold-size specificity, Phase 3 preserves while conserving for send attempts.' },
        {
          kind: 'table',
          head: [
            'Phase',
            'Protocol',
            'Load',
            'Edge',
            'Sets',
          ],
          rows: [
            [ '1: Decode', 'Max Hangs', '85–90% TM (+2–5 lbs/wk)', '20mm', '4×7–10s'],
            [ '2: Link ★', 'Min-Edge Hangs', 'Bodyweight only', 'Shrinking (15 → 12 → 10mm)', '4×7s'],
            [ '3: Send', 'Maintenance', '80% TM', '20mm', '3×7s'],
          ],
        },
        {
          kind: 'warn',
          title: 'MIN-EDGE HANG RULES',
          items: [
            'Bodyweight only. No added load, ever.',
            'Half Crimp grip. If half crimp breaks into open-hand drag, the set is a fail.',
            'Shrink the edge by 1mm only when you can hang the current edge for 7 seconds with clean form.',
            'If form breaks, bump BACK UP 1–2mm next session. Progress isn\'t linear.',
            'Target: 10–12mm by end of Week 8. Stop if pain enters the picture, regardless of week.',
          ],
        },
      ],
    },
    {
      title: 'The Projecting System',
      content: [
        { kind: 'h', text: 'The Attempt Loop' },
        {
          kind: 'table',
          head: [
            'Phase',
            'Action',
          ],
          rows: [
            [ 'Before', 'Visualize full sequence, eyes closed, 60 seconds minimum. Cue every clip, every rest, every crux move.'],
            [ 'During', 'Climb the sequence, not the grade. Execute what you rehearsed.'],
            [ 'After', 'Note EXACTLY where and why you fell. Be specific — \'cut feet because I didn\'t flag\' not \'fell on the crux.\''],
            [ 'Between Burns', 'Rest 5–8 min (Phase 2) or 20–30 min (Phase 3). Use a timer. Don\'t climb anything else during project rest.'],
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
            [ '1. Move Isolation (Phase 1)', 'Send every individual move. Isolated. One at a time.'],
            [ '2. Short Links (Phase 2, Wks 5–6)', 'String 2–3 moves from the crux outward.'],
            [ '3. Bottom-to-Crux & Crux-to-Top (Phase 2, Wks 7–8)', 'Commit to one major link per session.'],
            [ '4. Full Redpoints (Phase 3)', 'Only when steps 1–3 are consistent.'],
          ],
        },
        { kind: 'note', text: 'Skipping from Step 1 to Step 4 is the most common redpoint mistake. Steps 2 and 3 aren\'t optional — they are the training.' },
      ],
    },
    {
      title: 'Mental Game',
      content: [
        { kind: 'h', text: 'Decoupling Quality from Outcome' },
        { kind: 'p', text: 'Rate every attempt\'s EXECUTION QUALITY on a 0–10 scale, independent of whether you sent or fell. A perfect attempt that falls is better training than a sloppy send. Track both numbers — quality is what you have control over; outcome is the byproduct.' },
        { kind: 'h', text: 'Fear of the Move' },
        { kind: 'list', items: [
          '**Isolation Drill:** Do the scary move on a lower-stakes version (different route, easier grade) until automatic.',
          '**False Starts:** 2–3 attempts at full power where you intentionally do NOT grab the scary hold. Proves the fall is safe.',
          '**Shrink the Scary Section:** Do the move 10+ times at low consequence before full-route attempts.',
        ] },
        { kind: 'h', text: 'Flow States' },
        { kind: 'p', text: 'Flow = challenge–skill balance + clear goals + immediate feedback. Not luck — conditions. Engineer the conditions: warm up fully, pick your best time of day, remove distractions, commit to the sequence.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**48-Hour Rule:** 48 hours minimum between Project Sessions and Power-Endurance. Hard floor, not guideline.' },
        { kind: 'p', text: '**Sleep:** 8 hours non-negotiable. 7 acceptable. <6 actively counterproductive.' },
        { kind: 'p', text: '**Tendon Timeline:** Muscles adapt in days–weeks. Tendons adapt in weeks–months. Train to the tendons, not the muscles.' },
        {
          kind: 'warn',
          title: 'STOP AND REASSESS IF',
          items: [
            'Sharp finger pain — stop hangboard, climb jugs only 5–7 days.',
            'Elbow flare-up — skip Project Session, add Armor volume.',
            'You felt a pop — stop climbing, see a sports medicine doctor.',
            'Two consecutive sessions feeling significantly worse, not better — you\'re under-recovered.',
          ],
        },
        { kind: 'p', text: '**The Week-8 Deload Is Not Optional:** Every Siege graduate who skipped the Phase 2 deload either injured in Phase 3 or under-performed in the send window. This is data, not opinion.' },
      ],
    },
    {
      title: 'Graduation',
      content: [
        { kind: 'p', text: 'Complete the baseline retests via the Assess view.' },
        {
          kind: 'table',
          head: [
            'Metric',
            'Target vs Week 0',
          ],
          rows: [
            [ 'Max Hang 20mm 7s', 'Match or exceed Week 0'],
            [ 'Min Edge Achievable', 'Down from starting edge (Phase 2 progress)'],
            [ 'Redpoint Grade', 'Meet or exceed your project grade'],
            [ 'Project High Point %', '100% if sent; record HP if not'],
            [ 'Linked Laps Continuous', 'Match or exceed Week 0'],
            [ 'Max Pull-Ups', 'Match Week 0 (maintenance program)'],
          ],
        },
        { kind: 'p', text: '**Next Steps:** The Cruiser between cycles, or write your own — the builder will fork this program so you can aim the next twelve weeks at a specific project rather than a grade.' },
        { kind: 'note', text: 'Whether you sent the project or not, the engine you built over 12 weeks transfers to your next cycle. A failed send of a 5.13c teaches more than a flashed 5.12c ever could.' },
      ],
    },
  ],
};
