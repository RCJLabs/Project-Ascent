import type { Guide } from './types';

export const THE_CRUISER: Guide = {
  id: 'the_cruiser',
  name: 'THE CRUISER',
  subtitle: 'Perpetual Climbing Maintenance System',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'You built the machine. This is how you run it.' },
        { kind: 'p', text: 'The Cruiser is not a 12-week program with a graduation. It is a perpetual maintenance system designed to keep you climbing at your current level, injury-free, for as long as you want. Maximum choice, minimum dogma.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: [
            'Profile',
            'Description',
          ],
          rows: [
            [ 'The Graduate', 'Completed any RCJ program. Looking for what comes next.'],
            [ 'The Experienced Climber', 'Climbing consistently for 6+ months with a stable routine.'],
            [ 'The Returner', 'Coming back from a training cycle or break. Maintaining, not peaking.'],
            [ 'The Lifer', 'Climbing is part of your identity. You want decades on the wall.'],
          ],
        },
        { kind: 'h', text: 'Prerequisites' },
        {
          kind: 'table',
          head: [
            'Standard',
            'Minimum',
            'Why',
          ],
          rows: [
            [ 'Dead Hang', '30+ seconds, pain-free', 'Tendon load tolerance.'],
            [ 'Max Push-Ups', '10+ strict', 'Antagonist capacity.'],
            [ 'Core Plank', '60+ seconds strict', 'Core tension for climbing.'],
            [ 'Wrist Extensors', '3x15 pain-free', 'Flexor/extensor balance.'],
            [ 'Pain Status', 'Zero active pain', 'Maintenance assumes healthy baseline.'],
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
          footer: 'The Cruiser is maintenance, not rehabilitation. Active pain = see a professional.',
        },
      ],
    },
    {
      title: 'The Block Cycle',
      content: [
        { kind: 'p', text: 'The Cruiser runs in repeating **4-week blocks**: 3 weeks work + 1 week deload. No end date. Every 3 blocks (12 weeks), run a Self-Assessment Checkpoint. ✓' },
        {
          kind: 'table',
          head: [
            'Week',
            'Type',
            'Volume',
            'Intensity',
            'Notes',
          ],
          rows: [
            [ '1', 'Work', '100%', 'RPE 5-8', 'Full session menu. Normal training.'],
            [ '2', 'Work', '100%', 'RPE 5-8', 'Maintain or slightly increase load.'],
            [ '3', 'Work', '100%', 'RPE 6-8', 'Push the top end. Highest effort of the block.'],
            [ '4', 'Deload', '60%', 'RPE 4-6', 'Reduced volume. No limit climbing. Tendons recover. ✓'],
          ],
        },
        { kind: 'note', text: 'The deload is not optional. Tendons adapt 5-10x slower than muscles. Your muscles will always feel ready before your connective tissue is. The deload is where adaptation happens. ✓' },
      ],
    },
    {
      title: 'Session Menu',
      content: [
        { kind: 'p', text: 'Six session types. **You build your week from this menu.** No two weeks need to look the same.' },
        {
          kind: 'table',
          head: [
            'Session',
            'Type',
            'Duration',
            'RPE',
            'Mission',
          ],
          rows: [
            [ 'Volume & Flow', 'Climbing', '60-90 min', '4-6', 'Easy climbing. Technique. Movement quality. High mileage, low stress.'],
            [ 'Performance', 'Climbing', '60-90 min', '8-9', 'Limit bouldering or hard routes. Projecting. Max effort.'],
            [ 'Endurance', 'Climbing', '60-90 min', '6-8', 'ARC, 4x4s, linked laps, circuit climbing. Pump engine.'],
            [ 'Strength & Armor', 'Off-Wall', '45-60 min', '6-8', 'Pull/Push/Legs/Core/Armor. Track A or Track B.'],
            [ 'Hangboard Module', 'Off-Wall', '20-30 min', '7-8', 'Optional. Maintenance hangs at 80% TM. 1-2x/week.'],
            [ 'Recovery & Mobility', 'Rest', '20-30 min', '1-3', 'Mobility flow, light cardio, foam rolling.'],
          ],
        },
        {
          kind: 'warn',
          title: 'SCHEDULING RULES',
          items: [
            'Up to 5 training days per week. No more.',
            '3-4 climbing days (any mix of Volume, Performance, Endurance).',
            '1-2 Strength & Armor days on non-climbing days.',
            'Minimum 2 full rest days per week. Non-negotiable. ★',
            'Performance and Endurance not on consecutive days.',
            'Strength & Armor always on a non-climbing day.',
            'Hangboard Module: 48 hours before next hard climbing day. ★',
            'Deload week: no Performance sessions. Volume and easy Endurance only.',
          ],
          footer: 'Move days freely. A Monday Strength session is identical to a Thursday Strength session.',
        },
        { kind: 'h', text: 'Recommended Mixes' },
        {
          kind: 'table',
          head: [
            'Goal',
            'Mix',
          ],
          rows: [
            [ 'Maintain current grade', '2 Volume + 1 Performance + (opt. Endurance)'],
            [ 'Push harder grades', '1 Volume + 2 Performance + (opt. Endurance)'],
            [ 'Build route endurance', '1 Volume + 1 Performance + 2 Endurance'],
            [ 'General fitness / fun', '2-3 Volume + 1 Performance'],
            [ 'Coming back from break', '3 Volume + 0 Performance (first 2 blocks)'],
          ],
        },
      ],
    },
    {
      title: 'Climbing Sessions',
      content: [
        { kind: 'h', text: 'Volume & Flow' },
        { kind: 'p', text: 'RPE 4-6. Climb 2-4 grades below max. 60-90 minutes. Pick one technique focus per session: Quiet Feet, Straight Arms, Hip Positioning, Reading Sequences, Breathing, or Flagging. Bouldering: 15-25 problems. Routes: 6-10 routes. Downclimb everything. ★' },
        { kind: 'h', text: 'Performance' },
        { kind: 'p', text: 'RPE 8-9. At or near your limit. Extended warm-up (20-30 min easy climbing) then 3-8 quality attempts. Rest 3-5 min between burns. 3 consecutive failed attempts at RPE 9+ = session over.' },
        { kind: 'h', text: 'Endurance' },
        { kind: 'p', text: 'Choose one protocol per session:' },
        {
          kind: 'table',
          head: [
            'Protocol',
            'What',
            'RPE',
            'When',
          ],
          rows: [
            [ 'ARC Training', 'Continuous climbing 15-30 min, RPE 3-4, never get pumped.', '3-4', 'Building base. Early blocks or deload.'],
            [ '4x4 Intervals', '4 boulders back-to-back, no rest. Rest 4 min. 3-4 sets.', '6-7', 'Power endurance maintenance.'],
            [ 'Linked Laps', 'Climb route, lower, immediately re-climb. Rest 4 min. 3-4 sets.', '6-8', 'Route-specific endurance.'],
            [ 'Circuit Climbing', '6-10 problems with minimal rest. Repeat.', '5-7', 'Fun, varied, general endurance.'],
          ],
        },
      ],
    },
    {
      title: 'Strength & Armor',
      content: [
        { kind: 'p', text: '1-2 times per week on non-climbing days. Choose Track A or Track B. Switch tracks as needed.' },
        { kind: 'h', text: 'Track A — Maintenance' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Pull-Ups 3x8-10 or Inverted Rows 3x10',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PUSH (Antagonist)',
          items: [
            'Push-Ups 3x10-15 or DB Press 3x10-12',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'LEGS',
          items: [
            'Pick one: Lunges 2x10/side, Step-Ups 2x10/side, or Goblet Squats 2x12',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'CORE — THE PILLAR',
          items: [
            'Pick 4-5 from Core Menu. 45-60s each. 20s rest. 2-3 rounds.',
          ],
        },
        {
          kind: 'exercises',
          group: 'E',
          name: 'THE ARMOR — NON-NEGOTIABLE ★',
          items: [
            'Wrist Extensor Curls: 3x15',
            'Finger Extensions: 3x15',
            'Every Armor line steps to three sets from Block 2 and holds there — Armor never deloads.',
            'Band External Rotations: 2x12/arm → 3x12 from Block 2',
            'Band Face Pulls: 2x15 → 3x15 from Block 2',
          ],
        },
        { kind: 'h', text: 'Track B — Progressive' },
        {
          kind: 'exercises',
          group: 'A',
          name: 'PULL',
          items: [
            'Weighted Pull-Ups 3x5 or Heavy Rows 3x8',
          ],
        },
        {
          kind: 'exercises',
          group: 'B',
          name: 'PUSH (Antagonist)',
          items: [
            'Dips 3x8-10 or Overhead Press 3x8',
          ],
        },
        {
          kind: 'exercises',
          group: 'C',
          name: 'LEGS',
          items: [
            'RDLs 3x8 or Bulgarian Split Squats 3x8/side',
          ],
        },
        {
          kind: 'exercises',
          group: 'D',
          name: 'CORE — THE PILLAR',
          items: [
            'Pick 4-5 harder variations. 45-60s each. 15s rest. 3 rounds.',
          ],
        },
        {
          kind: 'exercises',
          group: 'E',
          name: 'THE ARMOR ★ + EXTRAS',
          items: [
            'Same Armor as Track A PLUS:',
            'Hammer Curls: 2x12 → 3x12 from Block 2',
            'Pronation/Supination: 2x15 each direction → 3x15 from Block 2',
          ],
        },
        { kind: 'h', text: 'Core Menu — Pick 4-5 Per Session' },
        {
          kind: 'table',
          head: [
            'Category',
            'Exercises',
          ],
          rows: [
            [ 'Anti-Extension', 'Hollow Body Hold · Dead Bugs · RKC Plank · Ab Wheel Rollouts'],
            [ 'Anti-Rotation', 'Pallof Press · Plank Hip Dips · Bird-Dogs'],
            [ 'Flexion', 'Hanging Knee Raises · Leg Raises · Toes-to-Bar · V-Ups'],
            [ 'Isometric', 'L-Sit · Front Lever Progressions · Side Plank'],
            [ 'Extension', 'Supermans · Reverse Hypers'],
          ],
        },
        { kind: 'note', text: 'Anti-extension and anti-rotation transfer directly to wall tension. Prioritize them. ✓' },
      ],
    },
    {
      title: 'Hangboard Module (Optional)',
      content: [
        { kind: 'quote', text: 'Optional means you choose to add it. Once added, follow the protocol precisely.' },
        { kind: 'p', text: 'For climbers who completed Iron Grip or have 6+ months hangboard experience. Maintains finger strength without full program volume.' },
        {
          kind: 'table',
          head: [
            'Parameter',
            'Standard',
          ],
          rows: [
            [ 'Edge', '18-20mm'],
            [ 'Duration', '7-10 second dead hangs'],
            [ 'Sets', '4-5 per grip position'],
            [ 'Load', '80% of Training Max. If unsure, start at bodyweight.'],
            [ 'Rest', '3 minutes between sets. Full recovery. ✓'],
            [ 'Grips', 'Half Crimp (primary). Open Hand (secondary). Alternate sessions.'],
            [ 'Frequency', '1-2 sessions per week. Never more.'],
            [ 'Scheduling', 'Before Strength work or standalone. 48hrs before hard climbing. ★'],
          ],
        },
        {
          kind: 'warn',
          title: 'HANGBOARD SAFETY',
          items: [
            'Open Hand or strict Half Crimp only. Never full crimp. ★',
            'Sharp pain = stop immediately.',
            'Do NOT hangboard the day before Performance climbing.',
            'If stagnant 3+ blocks: recycle full Iron Grip program.',
          ],
        },
      ],
    },
    {
      title: 'Deload & Assessment',
      content: [
        { kind: 'h', text: 'Deload Protocol (Every 4th Week)' },
        {
          kind: 'table',
          head: [
            'Component',
            'Normal',
            'Deload',
          ],
          rows: [
            [ 'Climbing', '3-4 sessions', '2-3 Volume/easy Endurance only'],
            [ 'Intensity', 'RPE 4-9', 'RPE 4-6 max. No limit climbing.'],
            [ 'Strength Sets', '3 per exercise', '2 per exercise'],
            [ 'Core Rounds', '2-3', '2'],
            [ 'Armor', 'Full protocol', 'Full — Armor never deloads. ★'],
            [ 'Hangboard', 'Normal', '3x7s at 70% TM or skip'],
            [ 'Sleep', '7-8 hours', '8+ hours. Non-negotiable.'],
          ],
        },
        { kind: 'h', text: 'Self-Assessment Checkpoint (Every 12 Weeks)' },
        { kind: 'p', text: 'Rest 2-3 days, then test: Dead Hang, Max Push-Ups, Max Pull-Ups, Core Plank, Flash Grade, Redpoint Grade, 4x4 completion quality. Check for pain in fingers, elbows, shoulders, wrists, lower back.' },
        {
          kind: 'table',
          head: [
            'Result',
            'Action',
          ],
          rows: [
            [ 'Numbers stable, zero pain', 'Continue The Cruiser.'],
            [ 'Numbers declining, no pain', 'Check sleep/nutrition. 2-week deload. If persistent: targeted program.'],
            [ 'Active pain', 'Reduce volume. Increase Armor. If >2 weeks: sports medicine. ★'],
            [ 'Want to peak', 'Run a targeted program. Return to Cruiser after.'],
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting',
      content: [
        { kind: 'p', text: '**Grades dropping:** Check sleep and nutrition first. If persistent 2+ blocks, run a targeted program (Iron Grip, Long Game, Lockdown, etc.) and return.' },
        { kind: 'p', text: '**Elbow pain:** Increase Armor: add Hammer Curls 3x12, Eccentric Wrist Flexor Curls 3x10, Rice Bucket daily. Drop weighted pull-ups. If >2 weeks: see PT. ★' },
        { kind: 'p', text: '**Finger pain:** Stop Hangboard Module. Volume climbing only 1-2 weeks. Sharp pain >7 days = professional evaluation. ★' },
        { kind: 'p', text: '**Shoulder issues:** Increase Ext Rotations to 3x15/arm. Add I-Y-T raises. Drop dips if aggravating.' },
        { kind: 'p', text: '**Bored/unmotivated:** Rotate session types. Try new discipline. Set micro-goals. Climb with different people. Go outside.' },
        { kind: 'p', text: '**Only 3 days available:** 2 climbing (1 Volume + 1 Performance) + 1 Strength & Armor. Armor is the last thing to drop.' },
      ],
    },
  ],
};
