import type { Guide } from './types';

export const IRON_GRIP: Guide = {
  id: 'iron_grip',
  name: 'IRON GRIP',
  subtitle: '12-Week Finger Strength & Conditioning',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'Technique multiplies strength. But zero times anything is still zero.' },
        { kind: 'p', text: 'Iron Grip turns your tendons into steel. Ground Zero built the chassis. Base Camp applied it. Gravity Defied gave you wings. Now we forge the grip.' },
        { kind: 'h', text: 'Entry Requirements ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Climbing Experience', '1+ year consistent'],
            [ 'Grade Range', 'V5+ or 5.11+'],
            [ 'Dead Hang', '60+ seconds, pain-free'],
            [ 'Max Push-Ups', '15+ strict'],
            [ 'Wrist Extensors', '3×15 pain-free'],
            [ 'Pain Status', 'Zero active finger or elbow pain'],
          ],
        },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: 'Three session types. **You choose which days.** 2–3 hangboard sessions/week max.' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'Mission',
          ],
          rows: [
            [ 'Finger Protocol + Engine Room', 'Hangboard + Strength/Armor', '45–55 min', 'Finger loading + pulling, pushing, core, armor.'],
            [ 'Climbing Session', 'Tech, Volume, or Performance', '60–90 min', 'Apply finger strength to the wall.'],
            [ 'Recovery / Mobility', 'Mobility Flow + Rest', '20–30 min', 'Prescribed Mobility Flow, or full rest.'],
          ],
        },
        { kind: 'h', text: 'Week by Week' },
        {
          kind: 'table',
          head: ['Week', 'Phase', 'Finger Protocol'],
          rows: [
            [ '1', 'The Anvil', '7/3 Repeaters, 3–5 sets at 60–70% of max added weight. Half crimp, 20mm.'],
            [ '2', 'The Anvil', 'Same protocol. Easy last rep? Add a little load next session.'],
            [ '3', 'The Anvil', 'Same protocol. Deep burn by rep 4–5 is the target.'],
            [ '4 (Deload)', 'The Anvil', 'Cut the sets by a third to a half. Keep the load — a deload is less volume, not lighter hangs.'],
            [ '5', 'The Hammer', 'Max Hangs: 5 × 10s at 85–90%, 3–5 min rest. No burn, just tension.'],
            [ '6', 'The Hammer', 'Same protocol. Half crimp breaking into a drag is a failed set.'],
            [ '7', 'The Hammer', 'Same protocol. Progress the added load only when every set is clean.'],
            [ '8 (Deload)', 'The Hammer', 'Cut the sets by a third to a half. Keep the load.'],
            [ '9', 'The Spark', 'Contact strength on your track. Open hand only, 15 min cap.'],
            [ '10', 'The Spark', 'Same. Miss the same move twice and the session is over.'],
            [ '11', 'The Spark', 'Same. CNS warm-up before the first hard pull, every session.'],
            [ '12', 'The Spark', 'Retest the graduation benchmarks.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            '48 hours minimum between Finger Protocol sessions. ✓',
            'Never hangboard after a hard climbing session.',
            'If combining: hangboard FIRST, rest 15–20 min, then climb.',
            'At least 2 full rest days per week.',
          ],
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
            [ 'Specialist', 'Finger + Engine', 'Recovery', 'Climbing', 'Finger + Engine', 'Rest', 'Hard Climbing', 'Rest'],
            [ 'Hybrid', 'Finger(30m) + Climb(45m)', 'Recovery', 'Climbing', 'Finger(30m) + Climb(45m)', 'Rest', 'Hard Climbing', 'Rest'],
          ],
        },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: '**Test 1 — Max Hang:** Half Crimp, 20mm edge. Start BW, add 5–10 lbs until failure at 7 seconds. Record: BW + added = Total Max Weight.' },
        { kind: 'p', text: '**Test 2 — Weighted Pull-Ups 3RM:** Add weight until you can\'t complete 3 clean reps.' },
        { kind: 'p', text: '**Test 3 — Lock-Off at 90°:** Hold until angle breaks. Record time.' },
        { kind: 'p', text: '**Test 4 — Core Lever:** Tuck → Advanced Tuck → One-Leg → Full Front Lever. Record highest 5s hold.' },
        { kind: 'h', text: 'Training Max Calculation' },
        { kind: 'p', text: '**Phase 1 (Wks 1–4):** 60–70% of Total Max Weight\n**Phase 2 (Wks 5–8):** 85–90% of Total Max Weight' },
        { kind: 'note', text: 'If working weight < bodyweight, you MUST remove weight. Use a pulley, band, or feet on chair. The percentages matter. ✓' },
      ],
    },
    {
      title: 'Phase 1: The Anvil (Wks 1–4)',
      content: [
        { kind: 'p', text: '**MISSION:** Hypertrophy & Capacity. Higher volume, lower intensity. Build structural thickness.' },
        { kind: 'h', text: '7/3 Repeaters' },
        { kind: 'p', text: 'Working Weight: 60–70% of Total Max Weight.' },
        {
          kind: 'table',
          head: [
            'Step',
            'Action',
            'Detail',
          ],
          rows: [
            [ '1', 'Hang', '7 seconds. Half Crimp. 20mm edge.'],
            [ '2', 'Rest', '3 seconds (hands off edge).'],
            [ '3', 'Repeat', '6 cycles = 1 Set (60s work).'],
            [ '4', 'Full Rest', '3 minutes between sets.'],
            [ '5', 'Volume', '3 to 5 sets total.'],
          ],
        },
        { kind: 'p', text: '**RPE 7:** Deep burn by rep 4–5. Fight to hold the last rep. If you fail early: −5 lbs. If easy: +2.5 lbs next session.' },
        { kind: 'h', text: 'Engine Room' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Weighted Pull-Ups: 3×8–10. Full ROM.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PUSH',
          items: [
            'Wide Push-Ups: 3×12–15. ★ Protects elbows. Non-negotiable.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE ARMOR',
          items: [
            'Wrist Extensor Curls: 3×20 (or 1 min rice bucket). ✓',
            'Finger Extensions: 3×15. ★',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'SHOULDER MAINTENANCE ★',
          items: [
            'Band External Rotations: 2×12/arm',
            'Band Face Pulls: 2×15',
          ],
        },
      ],
    },
    {
      title: 'Phase 2: The Hammer (Wks 5–8)',
      content: [
        { kind: 'p', text: '**MISSION:** Max Recruitment. Drop volume, spike intensity. Train your CNS to fire 100%.' },
        { kind: 'note', text: 'You should NOT feel a burn. If you feel wrecked, you rested too little. Phase 2 is about quality.' },
        { kind: 'h', text: 'Max Hangs' },
        { kind: 'p', text: 'Working Weight: 85–90% of Total Max Weight. 10 seconds, 5 sets, 3–5 min rest. RPE 9.' },
        { kind: 'p', text: '**Grip Check:** If Half Crimp breaks into Open Hand drag, the set is a fail.' },
        { kind: 'h', text: 'Engine Room' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'STATIC POWER',
          items: [
            '1-Arm Lock-Off (Assisted): 3 sets × 5–7s per arm. Shoulder DOWN.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'CORE — FRONT LEVER',
          items: [
            '5 sets × 5–10s holds. Straight line shoulder to hip.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE ARMOR',
          items: [
            'Hammer Curls: 3×10',
            'Wrist Extensor Curls: 3×15',
            'Finger Extensions: 3×15',
          ],
        },
      ],
    },
    {
      title: 'Phase 3: The Spark (Wks 9–12)',
      content: [
        { kind: 'p', text: '**MISSION:** Contact Strength & Power. We take the brakes off. ✓' },
        {
          kind: 'warn',
          title: 'CAMPUS BOARD SAFETY',
          items: [
            'Open Hand Only — no crimping on campus rungs.',
            'Start on LARGEST rungs, feet on ground.',
            'Cap at 15 minutes total board time.',
            'If you miss a rung twice in a row, session is over.',
            'Add CNS warm-up: 3 sets Clap Push-Ups or Box Jumps first. ★',
          ],
        },
        { kind: 'h', text: 'Campus Drills' },
        {
          kind: 'table',
          head: [
            'Level',
            'Movement',
            'Focus',
          ],
          rows: [
            [ '1: Laddering', '1–2–3–4–5 matched', 'Smoothness. Core tight. 3–5 sets.'],
            [ '2: Skips', '1–3–5', 'Pull through the rung. 3–5 sets.'],
            [ '3: Double Dynos', '1→3 both hands simultaneous', 'Speed and coordination. 3–5 sets of 3.'],
          ],
        },
        { kind: 'h', text: 'Engine Room — Maintenance' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Explosive Pull-Ups: 3×5. Chest to bar, fast.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE ARMOR',
          items: [
            'Wrist Extensor Curls: 3×15',
            'Finger Extensions: 3×20 (volume increased) ★',
            'Hammer Curls: 2×10',
          ],
        },
      ],
    },
    {
      title: 'Graduation & Maintenance',
      content: [
        { kind: 'p', text: 'Rest 3 full days, then retest Week 0 exactly.' },
        {
          kind: 'table',
          head: [
            'Phase',
            'Protocol',
            'Duration',
          ],
          rows: [
            [ 'Deload', 'Easy climbing, no hangboarding.', '1–2 weeks'],
            [ 'Maintenance', '1–2 hangboard sessions/week at 80% TM.', 'Ongoing'],
            [ 'Recycle', 'Repeat full program after 3+ month break. Retest first.', 'After 3+ months'],
          ],
        },
        { kind: 'p', text: '**Next options:** Return to volume climbing, recycle Iron Grip, specialize further, or periodize (12 wks strength → 12 wks volume → repeat). ✓' },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: '**"Numbers not going up"** — Check sleep and protein. Tendon adaptation is slower than muscle. Progress comes in jumps, not steady weekly gains.' },
        { kind: 'p', text: '**"Sharp finger pain"** — STOP. Rest 5–7 days minimum. Don\'t return until you can crimp a jug pain-free.' },
        { kind: 'p', text: '**"Elbow pain (Golfer\'s Elbow)"** — Stop weighted pull-ups. Focus on Wrist Extensor Curls and Rice Bucket. Add Hammer Curls and Eccentric Wrist Flexor Curls. ★ Most common hangboard injury.' },
        { kind: 'p', text: '**"Strong on hangboard but doesn\'t transfer"** — Are you still climbing 2–3 days/week? Hangboard is isometric; climbing is dynamic. Both are needed. ✓' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**Tendons Recover Slower Than Muscle:** Collagen synthesis needs roughly 48 hours after a Max Hang or Repeater session — that is why finger work is capped at 2–3 sessions/week with a hard 48-hour floor between them. Muscle can take more; your pulleys cannot.' },
        { kind: 'p', text: '**Warm Up Longer Than You Think:** Fingers have no major blood vessels — they rely on synovial fluid that takes time to circulate, so the 20–30 minute warm-up and Recruitment Ladder are not optional. Cold tendons under a weighted edge is how pulleys tear.' },
        { kind: 'p', text: '**The Form Failure Rule:** The set ends the moment your form breaks. If your Half Crimp drags open into Open Hand on a Max Hang, or you kip to finish a pull-up, the rep does not count — lower the load. Grinding broken reps loads the pulley wrong.' },
        { kind: 'p', text: '**The Armor Prevents Climber\'s Elbow:** Heavy pulling without extensor work is the fast track to medial elbow pain. Wrist extensor curls (or rice bucket) and finger extensions every session keep the extensor/flexor balance — they are prevention, not accessories. ★' },
        { kind: 'p', text: '**The Skin Game:** Raw or weeping skin means rest or tape — you cannot pull hard on painful skin without altering your grip and risking a slip. Sand thick calluses so they do not catch and rip.' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any finger pulley (A2 or A4 — base or middle of the finger).',
            'A \'pop\' sensation in a finger or tendon.',
            'Sharp pain inside the elbow (medial epicondyle — Golfer\'s Elbow).',
            'Numbness or tingling in fingers, hands, or arms.',
          ],
          footer: 'Dull muscular ache in the forearms is normal training fatigue. Joint or tendon pain is not. Pain persisting beyond 48 hours = see a doctor or PT before continuing.',
        },
      ],
    },
  ],
};
