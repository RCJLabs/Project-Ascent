import type { Guide } from './types';

export const LOCKDOWN: Guide = {
  id: 'lockdown',
  name: 'LOCKDOWN',
  subtitle: '12-Week Static Power & Body Tension',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'You learned to fly in Gravity Defied. Now you must learn to freeze.' },
        { kind: 'p', text: 'Lockdown is the discipline of static power. Full-body tension to glue your hips to the wall and lock-off strength to hold any position, anywhere, for as long as you want.' },
        { kind: 'h', text: 'Entry Requirements ★' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
          ],
          rows: [
            [ 'Climbing Experience', '6+ months consistent'],
            [ 'Grade Range', 'V3+ or 5.10+'],
            [ 'Dead Hang', '45+ seconds, pain-free'],
            [ 'Max Push-Ups', '10+ strict'],
            [ 'Core Plank', '90 seconds strict'],
            [ 'Wrist Extensors', '3×15 pain-free'],
            [ 'Pain Status', 'Zero active pain'],
          ],
        },
      ],
    },
    {
      title: 'The Safety Brief',
      content: [
        { kind: 'p', text: 'Static training is safer than dynamic training, but the intensity is high and it loads tendons hard. Read this before your first session.' },
        { kind: 'p', text: '**The Elbow Rule:** Lock-off training places immense stress on the elbow tendons. A sharp burn on the inside (Golfer’s) or outside (Tennis) of the elbow means terminate the set immediately — do not push through it. ★' },
        { kind: 'p', text: '**The Tremble:** In static holds, shaking is normal. Form breaking is not. The moment your shoulders shrug up to your ears or your back arches, the set is over regardless of the timer. Quality over duration.' },
        { kind: 'p', text: '**Tendon Density, Not Max Strength:** The Density Phase uses long-duration isometric holds (30–40s) to thicken the tendon matrix without the risk of heavy weighted hangs. Do not add weight until the program instructs you to. ✓' },
        { kind: 'h', text: 'Defining Failure — The Quality Standard' },
        { kind: 'p', text: 'You can “cheat” a static hold by compromising your joints. We do not. The set ends the moment form breaks.' },
        {
          kind: 'table',
          head: [
            'Test',
            'The Sign',
            'The Verdict',
          ],
          rows: [
            [ 'Shrug (upper body)', 'Shoulders rise toward ears', 'Scapular engagement lost, rotator cuff vulnerable. Terminate.'],
            [ 'Arch (core)', 'Lower back leaves floor, or hips sag below shoulders', 'Lumbar spine is taking the load. Terminate.'],
            [ 'Shake (CNS)', 'Violent, uncontrollable shaking, body position changing', 'Training survival, not strength. Terminate.'],
          ],
        },
        { kind: 'note', text: 'A 60-second plank with a sagging back is not 60 seconds of core training — it is 60 seconds of training a spinal injury.' },
      ],
    },
    {
      title: 'Baseline — Week 0',
      content: [
        { kind: 'p', text: '**Test 1 — Density Test:** 20mm edge or pull-up bar. Half Crimp. Hang at bodyweight to max time. If >40s, add 10 lbs and re-test.' },
        { kind: 'p', text: '**Test 2 — Lock-Off Test:** Pull to 90°. Hold static. Record time until angle breaks.' },
        { kind: 'p', text: '**Test 3 — Tension Test:** Hollow Body Hold. Record time until lower back arches off floor.' },
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
            [ 'Session A: Static Power', 'Lock-Off, Density, Pull', '45–55 min', 'Lock-Offs, Pulling, Finger Density, and Armor.'],
            [ 'Session B: Body Tension', 'Core, Push, Hip Mobility', '45–55 min', 'Core Circuit, Antagonist, Hip Mobility, and Armor.'],
            [ 'Climbing: Technique', 'Technique Drills', '60–90 min', 'Quiet Feet and 3-Second Hover Hands. No projecting.'],
            [ 'Recovery / Mobility', 'Rest / Mobility Flow', '20–30 min', 'Prescribed Mobility Flow, Zone 1 cardio.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            'Session A and B should not be on consecutive days.',
            'Session A (heavy pulling/hangs) needs 24 hours before a climbing day.',
            'If combining: Lockdown FIRST, always. Rest 15–20 min, then climb.',
            'Never do Lockdown after hard limit bouldering.',
            'At least 1–2 full recovery days per week.',
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
            [ 'Standard', 'Session A', 'Technique', 'Recovery', 'Session B', 'Recovery', 'Rest/Outdoor', 'Rest'],
            [ 'Hybrid', 'A + Vol Climb', 'Rest', 'Limit Boulder', 'B + Tech Drills', 'Recovery', 'Performance', 'Rest'],
          ],
        },
      ],
    },
    {
      title: 'Session A: Static Power',
      content: [
        {
          kind: 'exercises',
          group: 'A',
          name: 'THE DENSITY PHASE — Finger Health',
          items: [
            'Grip: Open Hand or strict Half Crimp. Edge: 20mm or jug/bar.',
            'Hang 30 seconds. Rest 3 min. 3–5 sets. RPE 6–7.',
            'You should feel dull fatigue, NOT pumped.',
            '★ Sharp pain in a finger/joint = end the set immediately.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE LOCK-OFF — Isometric Power',
          items: [
            'Frenchies: Top hold 5s → 90° hold 5s → 120° hold 5s → dead hang.',
            '3 sets. 1 set = 1–2 cycles. Rest 3 min. RPE 7–8.',
            'Progression: Offset Lock-Offs (towel) → One-Arm Assisted.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'THE PULL — Back Strength',
          items: [
            'Wide-Grip Pull-Ups: 3×6–8. Explosive up, 3s eccentric down. ✓',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'THE ARMOR ★',
          items: [
            'Wrist Extensor Curls: 3×15',
            'Finger Extensions: 3×15 ★',
            'Band External Rotations: 2×12/arm → 3×12 from Phase 2',
            'Band Face Pulls: 2×15 → 3×15 from Phase 2',
          ],
        },
      ],
    },
    {
      title: 'Session B: Body Tension',
      content: [
        {
          kind: 'exercises',
          group: 'A',
          name: 'CORE CIRCUIT — THE PILLAR',
          items: [
            'Compression Planks: 3×20s. Squeeze object between hands.',
            'Hanging Windshield Wipers: 3×10 total. Rotate slowly.',
            'RKC Plank: 3×15s MAX EFFORT. Clench everything. ★ 15s max tension > 60s lazy plank.',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'THE ANTAGONIST — Pushing',
          items: [
            'Dips or Overhead Press: 3×10–12. Full ROM. ★ Non-negotiable.',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'HIP MOBILITY',
          items: [
            'Deep Box Step-Ups: 2×10. Knee higher than hip. → 2×12 offset-loaded from Phase 2',
            'Frog Stretch: 2×30s. → 2×45s from Phase 2',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'THE ARMOR ★',
          items: [
            'Wrist Extensor Curls: 2×15',
            'Finger Extensions: 2×15',
            'Hammer Curls: 2×12',
          ],
        },
      ],
    },
    {
      title: 'Progressive Overload',
      content: [
        { kind: 'p', text: '**Golden Rule:** Do not increase weight until you can do the time.' },
        {
          kind: 'table',
          head: [
            'Exercise',
            'Month 1',
            'Month 2',
            'Month 3',
          ],
          rows: [
            [ 'Density Hang', 'BW (30s)', 'BW (40s) or +5–10 lbs', '+5–10 lbs (30s)'],
            [ 'Lock-Off', 'Frenchies (2 arms)', 'Offset (Towel)', 'Negatives (5s down)'],
            [ 'Core Plank', 'Standard', 'Long Lever', 'Weighted Vest'],
            [ 'Wipers', 'Bent Knees', 'Straight Legs', 'Weighted Ankles'],
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: 'The most common Lockdown problems and their fixes. If you are stuck, start here before changing the program.' },
        { kind: 'p', text: '**You shake violently within 15 seconds of a hang:** The edge is too small for a density hold. Size up to a larger edge (25–30mm), or split the set (15s hang, 5s rest, 15s hang). Density work should feel like dull forearm fatigue, never a violent failure.' },
        { kind: 'p', text: '**Your skin rips before your fingers fatigue:** Skin is the limiter, not your tendons. Use a larger, more comfortable edge or switch to a jug/bar. The goal is time under tension, not a skin contest — sand thick calluses so they do not catch and tear.' },
        { kind: 'p', text: '**You feel stuck — no progress for weeks:** This is the Slow Burn. Static strength does not climb linearly; it moves in steps. You will feel flat for ~3 weeks and then the hold suddenly feels easy. Hold the line, keep the form perfect, and do not add weight until you can do the full prescribed time. Patience is the program.' },
        { kind: 'p', text: '**Your feet keep cutting loose on steep ground:** This is exactly what Session B exists to fix. Prioritize Compression Planks, the RKC Plank, and Windshield Wipers — the anti-rotation ‘clamp.’ On the wall, push straight down through your feet before you reach, rather than reaching first and letting the hips swing out.' },
        { kind: 'p', text: '**Your lock-off collapses at 90°:** 90° is the weakest angle for most climbers — expected. Regress with a band or pulley assist so you can hit the full 5-second holds with clean form, then remove the assistance as you get stronger. Building the weak angle is the whole point.' },
        { kind: 'p', text: '**Sharp elbow burn during lock-offs:** Terminate the set — you are loading the elbow tendon, not building it. Recheck your Armor volume (Wrist Extensor Curls, Finger Extensions, Hammer Curls) and never skip the Elbow Shield warm-up. Lock-off training without extensor balance is the fast track to Climber’s Elbow.' },
      ],
    },
    {
      title: 'Recovery & Injury Prevention',
      content: [
        { kind: 'p', text: '**The Armor Is Non-Negotiable:** Finger Extensions (rubber band) and Wrist Extensor Curls are your primary defense against A2 pulley injury and Climber’s Elbow. They are built into both sessions for a reason — lock-off and hang work loads the flexors hard, and unopposed flexor strength is what tears tissue. Do them every session, even non-hang days. ★' },
        { kind: 'p', text: '**Static Work Creates Stiffness:** Stiffness is good for power and bad for movement. The Prescribed Mobility Flow restores range of motion without adding fatigue. Run it on Fridays or any rest day at RPE 2–3.' },
        {
          kind: 'table',
          head: [
            'Movement',
            'Dose',
            'Purpose',
          ],
          rows: [
            [ 'World’s Greatest Stretch', '5 per side', 'Full-body opener: hips, T-spine, hip flexors.'],
            [ 'Pigeon Pose', '60s per side', 'Deep hip opener. Use Supine Figure-4 if too intense.'],
            [ 'Deep Squat Hold', '60s', 'Opens hips and ankles. Counterweight if needed.'],
            [ 'Thoracic Rotations', '10 per side', 'Mobilizes the upper back after lock-off stiffness.'],
          ],
        },
        { kind: 'p', text: '**The Open Book Flow:** Scapular Wall Slides (10 reps), Doorframe Chest Stretch (30s per side), and a 60-second Frog Stretch open the shoulders and hips that lock-off work tightens.' },
        { kind: 'p', text: '**The Buffers Matter:** Leave 24 hours between Density Hangs and a limit bouldering day — fingers need time to stiffen back up. The Week 4 and Week 8 deloads are not optional; tendons consolidate the adaptation your muscles already made, and skipping them borrows against the next phase as injury.' },
        { kind: 'p', text: '**Zone 1 Cardio (optional):** 20 minutes of light walking or cycling flushes metabolic waste. Easy enough to breathe through your nose and speak in full sentences (RPE 2–3).' },
        {
          kind: 'warn',
          title: 'STOP IMMEDIATELY IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in any finger pulley (A2 or A4).',
            'Sharp burn on the inside or outside of the elbow (Golfer’s / Tennis Elbow).',
            'Shoulders shrugging to your ears with no ability to pull them down (scapular failure).',
            'Violent, uncontrollable shaking where your body position changes (CNS failure).',
          ],
          footer: 'Mild muscular trembling during isometric holds is normal. Joint or tendon pain is not. Pain persisting beyond 48 hours = see a doctor or licensed physical therapist.',
        },
      ],
    },
    {
      title: 'Graduation Standards',
      content: [
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
            'Why for Iron Grip',
          ],
          rows: [
            [ 'Density', '30+ sec with +10 lbs (or 60s BW) on 20mm', 'Tendon thickness for weighted hangboard.'],
            [ 'Lock-Off', '20+ sec at 90° (2 arms) OR 5+ sec 1-Arm Negative', 'Isometric strength for Max Hangs.'],
            [ 'Tension', '60s Hollow Body, perfect form', 'Core stability for campus board (Iron Grip Phase 3).'],
            [ 'Forearm ★', 'Wrist Ext Curls 3×15 pain-free', 'Extensor balance for heavy flexor loading.'],
            [ 'Pain Status ★', 'Zero finger, elbow, or shoulder pain', 'Iron Grip places extreme load on all three.'],
          ],
        },
      ],
    },
  ],
};
