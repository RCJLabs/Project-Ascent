import type { Guide } from './types';

export const GRAVITY_DEFIED: Guide = {
  id: 'gravity_defied',
  name: 'GRAVITY DEFIED',
  subtitle: '12-Week Dynamic Climbing Program',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'p', text: 'This program is designed for climbers who can consistently climb V2–V3 indoors, have been climbing 3–6 months, and are comfortable falling on padded floors.' },
        { kind: 'h', text: 'Entry Requirements ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Dead Hang', '45+ seconds, pain-free'],
            [ 'Flash Grade', 'V1–V2 or 5.8–5.9'],
            [ 'Max Push-Ups', '10 strict'],
            [ 'Core Plank', '90 seconds'],
            [ 'Wrist Extensors', '3×15 pain-free'],
          ],
        },
        { kind: 'h', text: 'Why 3+1, Not 4–5' },
        { kind: 'p', text: 'Dynamic climbing generates significantly higher peak forces per session. Each explosive attempt taxes the CNS more than moderate climbing. Fewer sessions with higher recovery = more adaptation, less injury. ✓' },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: 'Before Week 1, record these numbers. You cannot prove progress you never measured. Re-test at Week 6 (midpoint) and Week 12 (graduation) — data does not lie.' },
        { kind: 'h', text: 'Power & Strength' },
        {
          kind: 'table',
          head: [
            'Metric',
            'How to Test',
          ],
          rows: [
            [ 'Box Jump Height', 'Max height you can land softly and step down from.'],
            [ 'Explosive Pull-Ups', 'Reps pulled fast to chest — note band or no band.'],
            [ 'Recruitment Hang', 'Edge size + max hang time, shoulders engaged.'],
            [ 'Toes-to-Bar / Knee Raises', 'Max controlled reps, no swinging.'],
          ],
        },
        { kind: 'h', text: 'Dynamic Climbing' },
        {
          kind: 'table',
          head: [
            'Metric',
            'How to Test',
          ],
          rows: [
            [ 'Hardest Dyno Sent', 'Grade of the hardest boulder with a dynamic move you can send.'],
            [ 'Max Deadpoint Distance', 'Approximate reach you can latch beyond your static max.'],
            [ 'Commitment Confidence', 'Self-score 1–10: how willing are you to fully commit on a scary dyno?'],
            [ 'Landing Quality', 'Self-score 1–10: how controlled are your falls and landings?'],
          ],
        },
        { kind: 'note', text: 'Re-running these numbers at Week 6 and Week 12 is how you separate real adaptation from a good day on the wall.' },
      ],
    },
    {
      title: 'Physics of Flight',
      content: [
        { kind: 'h', text: '1. The Coil (Potential Energy)' },
        { kind: 'p', text: 'Your legs and hips are the spring. **The Error:** Beginners pull with arms first. **The Fix:** Sink hips low to maximize leg push.' },
        { kind: 'h', text: '2. The Vector (Direction)' },
        { kind: 'p', text: 'Most dynos are arcs, not straight lines. Pull out from the wall slightly so hips swing in toward the target.' },
        { kind: 'h', text: '3. The Deadpoint (Zero Gravity)' },
        { kind: 'p', text: 'The split-second at the top of your jump where you are weightless. Latch the hold at this exact moment.' },
      ],
    },
    {
      title: 'Weekly Template',
      content: [
        { kind: 'p', text: '3+1 structure: three committed sessions + one optional volume session. **You choose which days.**' },
        {
          kind: 'table',
          head: [
            'Session',
            'Focus',
            'Duration',
            'What You Do',
          ],
          rows: [
            [ 'Technical Flight', 'Dyno Drill', '45–60 min', 'Drill of the week + easy volume. RPE 6–7.'],
            [ 'Engine Room', 'Strength & Power', '45–55 min', 'Lower/upper body, core, shoulder & forearm maintenance.'],
            [ 'Performance & Limit', 'Hard Climbing', '45–65 min', 'Limit bouldering / projecting dynos. RPE 8–9.'],
            [ 'Volume & Flow (Opt.)', 'Easy Climbing', '45–75 min', 'Easy-to-moderate bouldering. RPE 4–6.'],
            [ 'Recovery', 'Rest / Mobility', '20–30 min', 'Mobility flow, walking, stretching.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            'Technical Flight before Performance — fresh CNS for drilling.',
            'Engine Room on a non-climbing day.',
            'At least 1 full rest day before Performance sessions.',
            'Do not add extra dyno-only days on top of this plan.',
          ],
        },
      ],
    },
    {
      title: 'Engine Room',
      content: [
        { kind: 'p', text: 'Goal is speed and explosiveness, not bodybuilding.' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'LOWER BODY POWER — THE LAUNCH',
          items: [
            'Box Jumps: 4×4. Land softly. Step down.',
            'Bulgarian Split Squats: 3×8. Single-leg power.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'UPPER BODY — THE LATCH',
          items: [
            'Explosive Pull-Ups: 4×3. Pull fast — chest to bar. Band OK.',
            'Recruitment Hangs: 3×10–15s. Shoulders engaged.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'CORE — THE PILLAR',
          items: [
            'Toes-to-Bar: 3×8. Control descent. (Mod: Hanging Knee Raises)',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'SHOULDER & FOREARM MAINTENANCE ★',
          items: [
            'Band External Rotations: 2×12/arm → 3×12 from Phase 2',
            'Wrist Extensor Curls: 2×15 → 3×15 from Phase 2',
            'Finger Extensions: 2×15 → 3×15 from Phase 2',
          ],
        },
        { kind: 'h', text: 'Progression Table' },
        {
          kind: 'table',
          head: [
            'Phase',
            'Box Jumps',
            'Pull-Ups',
            'Hangs',
            'Core',
          ],
          rows: [
            [ 'Wks 1–4', 'Moderate ht 4×4', '4×3 Band OK', '3×10–15s Jug/20mm', 'Knee Raise or T2B 3×8'],
            [ 'Wks 5–8', 'Increase ht 4×4', '4×3 Less/no band', '3×10–15s Smaller edge', 'T2B 3×8–10'],
            [ 'Wk 8 Deload', 'Sub-max 3×3', '3×3 Band OK', '2×10s Comfy edge', 'Knee Raise 2×8'],
            [ 'Wks 9–12', 'Same as 5–8', '3–4×3 Explosive', '3×10–15s Maintain', 'T2B 3×8'],
          ],
        },
      ],
    },
    {
      title: 'Phase 1: Mechanics (Wks 1–4)',
      content: [
        { kind: 'p', text: '**GOAL:** Overwriting static habits with dynamic movement patterns.' },
        {
          kind: 'table',
          head: [
            'Week',
            'Drill',
            'Key Detail',
          ],
          rows: [
            [ '1', 'The Hips-In Hover (Vertical Deadpoint)', 'Sink hips, explode up using legs. Do NOT grab — slap or hover at deadpoint. 3–5 problems, RPE 6–7.'],
            [ '2', 'The Side-Step Swing (Lateral Momentum)', 'Traverse using trailing leg to push sideways. Hips lead. Cue: \'Push with the foot.\''],
            [ '3', 'The Clap (Double Clutch)', 'Launch and clap hands mid-air before latching. Forces full commitment.'],
            [ '4', 'The One-Leg Swing (Pogo/Moon-Kick)', 'Swing free leg back then kick forward/up. The kick happens BEFORE the pull.'],
          ],
        },
        { kind: 'note', text: 'Phase 1 key insight: the arms are ropes, not motors. If your elbows bend before your hips leave the wall, restart.' },
      ],
    },
    {
      title: 'Phase 2: Advanced Techniques (Wks 5–8)',
      content: [
        { kind: 'p', text: '**GOAL:** Complex kinetic chains and specialized moves. Implement the Commitment Switch.' },
        {
          kind: 'table',
          head: [
            'Week',
            'Drill',
            'Key Detail',
          ],
          rows: [
            [ '5', 'The High-Box Drive (Step-Up Dyno)', 'Weight over high foot. Press through heel. Uses the glute.'],
            [ '6', 'The Hot Potato (Paddle/Bumping)', 'Catch intermediate hold → bump to finish in <0.5 seconds.'],
            [ '7', 'The Volume Run (Run-and-Jumps)', 'Running alongside wall, step on volumes, catch high hold.'],
            [ '8', 'Target Practice — DELOAD', 'Touch tape with index finger specifically. Reduce attempts 30%.'],
          ],
        },
        { kind: 'note', text: 'Deload weeks are not optional. They are a tool for the intelligent. Skipping Week 8 means borrowing against Phase 3.' },
      ],
    },
    {
      title: 'Phase 3: Mastery & Risk (Wks 9–12)',
      content: [
        { kind: 'p', text: '**GOAL:** Managing fear, dangerous angles, and limit performance.' },
        {
          kind: 'warn',
          title: 'FALLING REMINDER',
          items: [
            'Higher commitment moves — steeper walls, longer reaches, chained dynamics.',
            'Stay off your hands on impact. Bent arms.',
            'Absorb with knees and hips.',
            'Push slightly away from wall on overhang falls.',
          ],
        },
        {
          kind: 'table',
          head: [
            'Week',
            'Drill',
            'Key Detail',
          ],
          rows: [
            [ '9', 'The Multi-Move Cascade (Link-Ups)', 'Chain 2+ dynamic moves from previous weeks. Sequence momentum.'],
            [ '10', 'The Toe-Stab (Simultaneous Catch)', 'Hand and foot contact at exact same moment. Arrests swing.'],
            [ '11', 'The Rooted Launch (Overhangs)', 'Toes as talons. Pull wall toward you with feet. Maintain toe-tension.'],
            [ '12', 'Graduation Project', 'Limit boulder requiring 2+ dynamic skills. Dedicate the week to sending.'],
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'These are the most common dyno errors and their fixes. If you are stuck, start here before changing your training.' },
        { kind: 'p', text: '**Falling short of the target:** You are not sinking your hips. Maximize the range of The Coil — the most common error is not going low enough before the jump. Technique fixes this before extra strength does.' },
        { kind: 'p', text: '**Feet cut loose and you swing:** Push straight down before you move out (The Vector) — pushing out too early rips your feet off instantly. Weak core tension also causes foot cuts; add Toes-to-Bar or Knee Raises to the Engine Room.' },
        { kind: 'p', text: '**Catch jars your shoulder:** You are grabbing too early or too late, or the shoulder is not engaged. Drill the Hips-In Hover (Wk 1) to find the weightless deadpoint, and shrug your scapula down-and-back before the catch.' },
        { kind: 'p', text: '**Barn-dooring off the catch:** Your body is still swinging when your hand lands. Fix 1: Toe-Stab (Wk 10) — catching hand and foot together arrests the swing. Fix 2: check your arc (The Vector); film from the side and watch your hip path.' },
        { kind: 'p', text: '**Scared to commit on overhangs:** Extremely common — and the fear reflex makes the fall worse, not the commitment. Use the Commitment Switch: 2–3 full-power false starts where you do not grab, then flip the switch on attempt 4. Start on lower-commitment versions and build up.' },
        { kind: 'p', text: '**Over-gripping / early forearm pump:** This is a tension issue, not a strength issue. Shake out between every attempt even when you do not feel pumped, and think \'relaxed hands in the air\' — grip should only fire at the moment of contact, not during the jump.' },
        { kind: 'p', text: '**Heavy, jarring landings:** You are landing stiff-legged. Bend your knees deeply the instant your feet touch — squat into the pads, do not just touch them. Re-read Falling & Rolling and practice soft landings from standing first.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**The Shoulder Rule:** Dynamic climbing is high-impact. Band External Rotations and Face Pulls before every session are non-negotiable — they are built into the warm-up and the Engine Room. Sharp pain in the front or top of the shoulder means stop immediately. ★' },
        { kind: 'p', text: '**Tendon Timeline:** Muscles adapt in days; tendons and pulleys adapt in weeks to months. This is why the schedule is 3+1, not 4–5, and why you never add extra dyno-only days. Catching forces load connective tissue far harder than static climbing.' },
        { kind: 'p', text: '**Landing Mechanics:** Land on two feet and roll onto your back or side. Sticking a stiff-legged landing from a dynamic fall is a primary cause of ankle and ACL injuries. Bend knees and arms, tuck your chin, roll if possible.' },
        { kind: 'p', text: '**The Down-Climb:** Do not drop from the top of every boulder. Cumulative impact on knees and lower back adds up over 12 weeks — down-climb to a safe height first.' },
        { kind: 'p', text: '**The Skin Game:** Sand thick calluses so they do not catch and rip. Get a flapper? Tape it immediately or end the session.' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any finger pulley, elbow, or shoulder joint.',
            'A \'pop\' sensation in a finger or tendon — stop climbing, see a sports medicine doctor.',
            'Numbness or tingling in fingers, hands, or arms during or after climbing.',
          ],
          footer: 'Mild muscle soreness is normal. Joint pain is not. Pain persisting beyond 24–48 hours = see a doctor or PT before continuing.',
        },
        { kind: 'p', text: '**Week 8 Deload Is Not Optional:** Connective tissue needs time to consolidate the adaptation your muscles already made. Skipping the Week 8 deload means borrowing against Phase 3 — and that bill comes due as injury.' },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        { kind: 'p', text: 'Re-test your Week 0 baseline. You graduate Gravity Defied when you can meet these standards pain-free.' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Graduation Target',
            'Why It Matters',
          ],
          rows: [
            [ 'Graduation Project', 'Send a limit boulder with 2+ dynamic moves', 'Integrates the full skill set — coil, vector, deadpoint, and a specialized move.'],
            [ 'Hardest Dyno Sent', 'Up 1–2 grades from Week 0', 'Proof the power and timing transferred to the wall, not just the gym.'],
            [ 'Commitment Confidence', '7+/10 on scary dynos', 'Fear management is the real ceiling on dynamic climbing — not raw strength.'],
            [ 'Landing Quality', '8+/10, controlled every fall', 'Safe falling is what lets you keep training. Sloppy landings end seasons.'],
            [ 'Pain Status ★', 'Zero shoulder, finger, or elbow pain', 'You loaded these tissues hard for 12 weeks — pain-free means ready for the next program.'],
          ],
        },
        { kind: 'p', text: '**Next Steps:** Repeat the phases on harder boulders, weave these drills into your regular climbing, or move to Lockdown to build the static power and body tension that complements dynamic movement.' },
        { kind: 'note', text: 'The physics of flight do not change. Only the moves get harder.' },
      ],
    },
    {
      title: 'Tactics & Mentality',
      content: [
        { kind: 'h', text: 'The Commitment Switch' },
        {
          kind: 'table',
          head: [
            'Attempt',
            'Instruction',
            'Goal',
          ],
          rows: [
            [ '1–3', 'Explode 100% but do NOT latch. Tap the hold and control landing.', 'Proves to your brain that falling is safe.'],
            [ '4+', 'Same power — open hand and latch.', 'Execute with confidence from attempts 1–3.'],
          ],
        },
        { kind: 'h', text: 'Video Analysis (T-Rex Check)' },
        { kind: 'p', text: 'Film yourself from the side. Check: Arms straight at start? Elbows bending immediately (T-Rex Error)? Hip path smooth toward target?' },
      ],
    },
    {
      title: 'Progressive Overload Modifiers',
      content: [
        { kind: 'p', text: 'Apply ONE modifier at a time once a drill feels comfortable.' },
        { kind: 'list', items: [
          '**Accuracy Modifier:** Use smaller holds. If you readjust fingers, it\'s a miss.',
          '**Pause Modifier:** Hover hand 2 seconds before grabbing. Forces excess power.',
          '**Limb-Deletion:** One-hand catch, or no-hand launch (legs only).',
          '**Fatigue Simulator:** Dynamic move after 5–10 push-ups. NOT on projecting days.',
          '**Overshoot Modifier:** Aim 6 inches above target hold.',
        ] },
      ],
    },
  ],
};
