import type { Guide } from './types';

export const THE_LONG_GAME: Guide = {
  id: 'the_long_game',
  name: 'THE LONG GAME',
  subtitle: '12-Week Route Climbing & Endurance',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'Bouldering tests what you can do. Route climbing tests how long you can do it.' },
        { kind: 'p', text: 'The Long Game builds the aerobic engine that lets you climb at 70% of your max for 30 minutes instead of 100% for 5.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: [
            'Profile',
            'Description',
          ],
          rows: [
            [ 'The Pumped (5.10–5.11)', 'You fall because your forearms give out, not because the move is hard.'],
            [ 'The Boulderer Convert', 'Hard boulders but struggle on anything >8 moves.'],
            [ 'The Outdoor Aspirant', 'Taking indoor fitness outside where routes are longer.'],
            [ 'The Lead Beginner', 'Structured entry into lead with fall practice and clipping strategy.'],
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
            [ 'Climbing Experience', '3–6+ months consistent'],
            [ 'Grade Range', '5.9+ on-sight or V2+'],
            [ 'Dead Hang', '45+ seconds, pain-free'],
            [ 'Core Plank', '90 seconds strict'],
            [ 'Max Push-Ups', '10+ strict'],
            [ 'Wrist Extensors', '3×15 pain-free'],
          ],
        },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: 'Record these in Week 1, then re-test at the Week 6 midpoint and Week 12 graduation. Endurance gains are invisible day to day — the numbers are how you prove the engine is growing.' },
        {
          kind: 'table',
          head: [
            'Metric',
            'How to Test',
          ],
          rows: [
            [ 'ARC Duration', 'Longest continuous climbing time at RPE 3–4 without coming off the wall.'],
            [ 'Pump Clock', 'Time from first pump onset to failure on a sustained route.'],
            [ '4×4 Route Sets', 'How many back-to-back 4-route sets you complete with clean form.'],
            [ 'Hardest On-Sight', 'Hardest route you send first try, no beta.'],
            [ 'Hardest Redpoint', 'Hardest route you send with multiple attempts.'],
            [ 'Your Project', 'Name + grade of the route you will work all cycle.'],
          ],
        },
        { kind: 'note', text: 'Pick your project early and commit. Phases 2 and 3 point straight at one route — a moving target builds nothing.' },
      ],
    },
    {
      title: 'Pump Science',
      content: [
        { kind: 'p', text: 'The pump = metabolic byproducts (hydrogen ions) in forearm muscles. Contracting muscles compress their own blood vessels, restricting fresh blood. More gripping → less blood → more waste → worse gripping. ✓' },
        {
          kind: 'table',
          head: [
            'Strategy',
            'Phase',
            'What It Does',
          ],
          rows: [
            [ 'ARC Training', 'Phase 1', 'Builds capillary density → more blood flow → less pump. ✓'],
            [ 'Power Endurance', 'Phase 2', 'Trains muscles to tolerate higher waste levels. ✓'],
            [ 'Redpoint Strategy', 'Phase 3', 'Reduces total energy cost through beta refinement. ✓'],
          ],
        },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: 'Four session types + recovery. **You choose which days.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'Mission',
          ],
          rows: [
            [ 'Endurance', 'ARC / Intervals / Linked Burns', '60–90 min', 'Phase-specific endurance protocol.'],
            [ 'Strength & Armor', 'Engine Room', '45–55 min', 'Push/pull maintenance + Core + Armor.'],
            [ 'Performance', 'On-sight / Redpoint / Falls', '60–90 min', 'On-sight attempts, redpoint burns, fall practice.'],
            [ 'Volume (Opt.)', 'Easy Flow Climbing', '60–90 min', 'Easy-to-moderate routes. No max grades.'],
            [ 'Recovery', 'Rest / Mobility Flow', '20–30 min', 'Prescribed Mobility Flow. No climbing.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            '4 sessions/week + at least 2 full rest days.',
            'Endurance and Performance not on consecutive days.',
            'Strength & Armor on a non-climbing day.',
            'Recovery day is NOT optional — endurance training is high-volume repetitive loading.',
          ],
        },
      ],
    },
    {
      title: 'Phase 1: The Base (Wks 1–4)',
      content: [
        { kind: 'p', text: '**MISSION:** Build the aerobic engine. Growing capillaries in your forearms. You should NEVER feel pumped in Phase 1. ✓' },
        { kind: 'h', text: 'Endurance: ARC Training' },
        { kind: 'p', text: 'Continuous climbing at RPE 3–4. Stay on the wall 10–40 minutes without coming off.' },
        {
          kind: 'table',
          head: [
            'Parameter',
            'Protocol',
          ],
          rows: [
            [ 'Intensity', 'RPE 3–4. Hold a conversation.'],
            [ 'Duration', 'Wk 1: 2×10 min → Wk 2: 2×15 → Wk 3–4: 2×20 min'],
            [ 'Terrain', '3–4 grades below on-sight. Auto-belay, top-rope, or traverse.'],
            [ 'Technique', 'Straight arms. Quiet feet. Read 2 moves ahead. Exhale every move.'],
            [ 'Shaking', 'Practice every 5–8 moves — even when fresh. It\'s a skill.'],
            [ 'Deload (Wk 4)', '2×12 min. Focus on perfect movement.'],
          ],
        },
        { kind: 'note', text: 'ARC doesn\'t feel like training. That\'s the point. The adaptation is vascular. If you pump out, you failed.' },
        { kind: 'h', text: 'Performance: On-Sight Practice' },
        { kind: 'p', text: '3–5 routes at on-sight level. Read the route 60s before each attempt. Note rest positions, crux, clip stances.' },
        { kind: 'h', text: 'Weekly Focus' },
        {
          kind: 'table',
          head: [
            'Week',
            'ARC',
            'Performance',
            'Skill Drill',
          ],
          rows: [
            [ '1', '2×10 min', 'On-sight 3–5 routes', 'Shakeout every 5 moves'],
            [ '2', '2×15 min', 'Route Reading: 60s preview', 'Breathing: exhale every move'],
            [ '3', '2×20 min', 'Clipping from 3 stances', 'Straight-Arm: no elbow bending'],
            [ '4 (Deload)', '2×12 min easy', '2–3 attempts only', 'Review notes. Find patterns.'],
          ],
        },
      ],
    },
    {
      title: 'Phase 2: The Engine (Wks 5–8)',
      content: [
        { kind: 'p', text: '**MISSION:** Power endurance. Tolerate the pump and keep functioning. This is where it gets uncomfortable. ✓' },
        { kind: 'h', text: 'Endurance: Power Endurance Intervals' },
        {
          kind: 'table',
          head: [
            'Protocol',
            'Weeks 5–7',
            'Week 8 (Deload)',
          ],
          rows: [
            [ 'Linked Laps', 'Climb route, lower, immediately climb second. Rest 4 min. 3–4 times.', 'Reduce to 2 sets.'],
            [ '4×4 Routes ★', '4 easy routes back-to-back, zero rest. Rest 4 min. 3–4 times.', 'Reduce to 2 sets.'],
            [ 'Pump Clock', 'Climb until pump onset. Note time. Shake 10s. Continue. Extend window 20–30%.', 'Easy ARC 2×10 min.'],
          ],
        },
        { kind: 'note', text: 'Phase 1: never feel pumped. Phase 2: feel pumped — and keep climbing.' },
        { kind: 'h', text: 'Performance: Working Your Project' },
        { kind: 'p', text: '1–2 routes at redpoint limit (~5.11–5.12). Attempt 1: full route, note every issue. Attempts 2–3: isolate crux. Attempt 4+: link crux→top, bottom→crux, then full send. Rest 5–8 min between burns.' },
      ],
    },
    {
      title: 'Phase 3: The Send (Wks 9–12)',
      content: [
        { kind: 'p', text: '**MISSION:** Execution. Volume drops. All energy toward your project. ✓' },
        { kind: 'h', text: 'Endurance: Maintenance' },
        { kind: 'p', text: 'Linked Laps: 2 sets. Shakeout Practice: time your shakeouts (10–15s per arm).' },
        { kind: 'h', text: 'Performance: Redpoint Day' },
        { kind: 'p', text: 'Warm up 25–30 min. **Pre-Climb Ritual:** Visualize every clip, rest, crux move. 60s minimum. ✓ Take 2–4 burns with 8–10 min rest. After each fall: strength, technique, or mental?' },
        { kind: 'h', text: 'Weekly Focus' },
        {
          kind: 'table',
          head: [
            'Week',
            'Endurance',
            'Redpoint',
          ],
          rows: [
            [ '9', 'Linked Laps 2 sets + shakeout drill', 'Full project burns. Visualize before every burn.'],
            [ '10', 'Linked Laps 2 sets', 'Film 2 attempts. Watch between burns.'],
            [ '11', 'ARC only: 1×15 min (taper)', 'Peak sends. 3 high-quality burns.'],
            [ '12', 'No endurance training', 'SEND WEEK. Trust the process.'],
          ],
        },
      ],
    },
    {
      title: 'Engine Room',
      content: [
        { kind: 'p', text: 'Perform on a non-climbing day. Maintenance, not building. ~45–55 min.' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Inverted Rows or Pull-Ups: 3×6–8. Don\'t chase PRs in this program.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PUSH',
          items: [
            'Max Push-Ups or DB Press: 3×10–12. ★ Prevents impingement.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'CORE — THE PILLAR',
          items: [
            'Pick 3: Plank / Hollow Body / Dead Bugs / Twists / Bird-Dogs / Knee Raises',
            '40–60s each, 2 rounds.',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'THE ARMOR ★',
          items: [
            'Band External Rotations: 2×12/arm',
            'Band Face Pulls: 2×15',
            'Wrist Extensor Curls: 3×15 ★',
            'Finger Extensions: 3×15 ★',
          ],
        },
      ],
    },
    {
      title: 'Lead Falls & Mental Game',
      content: [
        { kind: 'h', text: 'The Fall Ladder' },
        { kind: 'p', text: 'Practice during Performance warm-ups for 4 weeks, then as needed.' },
        {
          kind: 'table',
          head: [
            'Level',
            'Setup',
            'What You Do',
          ],
          rows: [
            [ '1. Clip Fall', 'Clip bolt. Climb 1 ft above. Let go.', 'Shortest possible fall. System catches you.'],
            [ '2. Half-Clip', 'Clip bolt. Climb 3–4 ft above. Let go.', 'Meaningful fall with slack.'],
            [ '3. Full-Bolt', 'Clip bolt. Climb to next bolt. Don\'t clip. Let go.', 'Standard bolt-to-bolt fall.'],
            [ '4. Commitment', 'Hard move above bolt. Climb until you fall naturally.', 'Falling as byproduct of trying.'],
          ],
        },
        { kind: 'h', text: 'Clipping Strategy' },
        { kind: 'list', items: [
          'Clip from a stance, not a pump. Find balance first.',
          'One hand, one motion. Fumble? Re-establish, try again.',
          'Clip below your face. If reaching overhead, back-clip from lower.',
          'Practice both sides — clip with either hand from either side.',
        ] },
        { kind: 'h', text: 'The Shakeout (A Skill, Not a Reaction)' },
        { kind: 'list', items: [
          'Drop arm completely. Straighten. Point fingers at floor.',
          'Shift weight fully over standing foot — arm truly unweighted.',
          'Open/close hand 5–10 times to pump blood through.',
          '10–15 seconds per arm. Longer wastes energy.',
          'Breathe. Slow, deep exhales.',
        ] },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'Endurance problems usually trace to one of these. Match the symptom, apply the fix, and give it two weeks before changing anything else.' },
        { kind: 'p', text: '**You pump out during ARC training (Phase 1):** You are climbing too hard. ARC is RPE 3–4 — a conversational pace, 3–4 grades below your on-sight. If your forearms tighten at all, ease off. Pumping out in Phase 1 means you failed the session, not that you need more of it; the adaptation is vascular and only happens at low intensity.' },
        { kind: 'p', text: '**You can do every move but fall halfway up the route:** This is the endurance gap the whole program targets. Near term, two fixes: rest 5–8 minutes between redpoint burns (incomplete recovery just rehearses failure), and build the Phase 2 power-endurance intervals before grinding full burns — you cannot redpoint your way to an engine you have not built.' },
        { kind: 'p', text: '**Your forearms blow up early and never recover:** Two culprits. Over-gripping — climb easy terrain with the lightest grip that keeps you on, until soft hands are your default. And a broken shakeout — most climbers dangle an arm and hope. The shakeout is a deliberate, timed skill: straight arm, weight fully over your feet, open/close the hand, 10–15 seconds, breathe.' },
        { kind: 'p', text: '**You over-grip and rush your clips above the bolt:** That is fear of falling — the single largest lead limiter. Work the Fall Ladder in order with a belayer who gives a soft catch. Separately, fix the clipping itself: clip from a balanced stance below your face, never from a pump or a lock-off.' },
        { kind: 'p', text: '**A persistent ache is getting worse across sessions, not just within one:** That is overuse, the signature risk of high-volume endurance work. Take 3–5 days fully off and reassess. A worsening cross-session ache is how tendinopathy starts — within-session fatigue that clears by the next day is normal; an ache that compounds week over week is not. ★' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**The Recovery Day Is the Program:** The no-climb mobility day is not filler. Endurance training is high-volume, repetitive loading, and your forearm capillaries and tendons only adapt during genuine rest. Skip it and you convert training into overuse.' },
        { kind: 'p', text: '**The Armor Is Non-Negotiable:** The Wrist Extensor Curls and Finger Extensions in the Engine Room are your defense against Golfer’s Elbow and pulley strain. High-volume route climbing creates more cumulative flexor loading than any other program in the series — extensor balance matters most here, so never skip that block. ★' },
        {
          kind: 'table',
          head: [
            'Movement',
            'Dose',
            'Purpose',
          ],
          rows: [
            [ 'World’s Greatest Stretch', '5 per side', 'Full-body opener: hips, T-spine, hip flexors.'],
            [ 'Pigeon Pose', '60s per side', 'Deep hip opener.'],
            [ 'Deep Squat Hold', '30–60s', 'Opens hips and ankles.'],
            [ 'Thoracic Rotations', '10 per side', 'Maintains climbing spine mobility.'],
          ],
        },
        { kind: 'p', text: '**Watch the Slow Build:** Overuse injuries creep in, and the early signs are subtle. The rule: a persistent ache that worsens across sessions means take 3–5 days off and reassess before it becomes a months-long setback.' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any finger pulley (A2 or A4).',
            'Sharp pain on the inside of the elbow (medial epicondyle / Golfer’s Elbow).',
            'Shoulder impingement pain when clipping or reaching overhead.',
            'Numbness or tingling in fingers, hands, or arms after shaking out.',
          ],
          footer: 'Within-session fatigue that clears by the next day is normal. A worsening cross-session ache is not — stop and reassess. Sharp or persistent pain means see a doctor or licensed physical therapist.',
        },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        { kind: 'p', text: 'Re-test your Week 0 baseline. You have completed The Long Game when you can meet these — pain-free.' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Target',
            'Why It Matters',
          ],
          rows: [
            [ 'ARC Endurance', '2×20 min continuous at RPE 3–4, no pump', 'The aerobic engine is built — you recover while moving.'],
            [ 'Pump Clock', 'Pump-to-failure window extended 20–30%+ vs. Week 1', 'You keep functioning deep into the pump, not just avoid it.'],
            [ 'Project Send', 'Send your cycle project, or link it cleanly to the anchors', 'Endurance, strategy, and head game converged on a real route.'],
            [ 'Lead Confidence', 'Comfortable taking a Level 3 full-bolt fall', 'Fear was the real ceiling on lead — you moved it.'],
            [ 'Pain Status ★', 'Zero forearm, elbow, or shoulder pain through both deloads and Week 12', 'High-volume loading without injury means you can keep building.'],
          ],
        },
        { kind: 'p', text: '**Next Steps:** Take it outside — Week 12 is the window. Repeat the cycle on a harder project (raise your on-sight and redpoint targets one grade), or rotate to a bouldering program like Gravity Defied or Iron Grip to round out power while you hold endurance with one weekly ARC session.' },
      ],
    },
  ],
};
