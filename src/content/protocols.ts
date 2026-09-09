/**
 * Protocol registry (PLAN.md §5.4).
 *
 * Named training methods with their interval structure, prescribed grip,
 * cues, and safety rules. An exercise referencing a protocol gets a working
 * timer in the logger, and the definition here is the single place the app
 * states what the method actually is.
 *
 * The definitions are pinned deliberately: the old app had to spend a block
 * of its AI prompt correcting fabricated protocol descriptions
 * (AUDIT.md §2 — "protocol term integrity"). Written down as content, that
 * failure mode disappears.
 */

import type { Protocol, ProtocolId } from './types';

export const PROTOCOLS: Record<ProtocolId, Protocol> = {
  repeaters_7_3: {
    id: 'repeaters_7_3',
    name: '7/3 Repeaters',
    description:
      'Six hangs of 7 seconds on, 3 seconds off, back to back, on a 20mm edge. One set is all six hangs. Builds finger-flexor endurance and connective-tissue capacity at submaximal load.',
    timer: { workSec: 7, restSec: 3, repsPerSet: 6, setRestSec: 180 },
    grip: 'Half crimp, 20mm edge',
    cues: [
      'RPE 7 — a deep burn by rep 4-5, fighting to hold the last one.',
      'Fail early? Drop 5 lbs next session. Too easy? Add 2.5 lbs.',
      'Full three minutes of rest between sets.',
    ],
    safety: ['Stop at sharp or localized finger pain. Dull forearm burn is expected; stabbing is not.'],
  },

  max_hangs_10s: {
    id: 'max_hangs_10s',
    name: 'Max Hangs',
    description:
      'Single 10-second hangs near maximal load with long rest between sets. Trains peak finger strength and recruitment rather than endurance.',
    timer: { workSec: 10, restSec: 0, repsPerSet: 1, setRestSec: 240 },
    grip: 'Half crimp, 20mm edge',
    cues: [
      'RPE 9 — no burn, just maximum tension.',
      'If the half crimp collapses into an open-hand drag, the set is a fail.',
      'Three to five minutes between sets is mandatory. Shorter rest trains endurance you already have.',
    ],
    safety: ['Warm up thoroughly: never load near-max fingers cold.'],
  },

  campus_ladder: {
    id: 'campus_ladder',
    name: 'Campus Laddering',
    description:
      'Ascending rung sequences on a campus board, matching hands on each rung. Trains contact strength and rate of force development.',
    grip: 'Open hand only — no crimping on rungs',
    cues: [
      'Start on the largest rungs with feet on the ground.',
      'Cap total board time at 15 minutes.',
      'CNS warm-up first: 3 sets of clap push-ups or box jumps.',
    ],
    safety: [
      'The highest injury-risk protocol in any program here.',
      'Miss a rung twice in a row and the session is over.',
      'Never campus with any existing finger or elbow symptom.',
    ],
  },

  arcing: {
    id: 'arcing',
    name: 'ARCing',
    description:
      'Aerobic Restoration and Capillarization: continuous easy climbing for 10-30 minutes at RPE 3-4, holding a mild pump that never builds. Trains capillary density in the forearms. The adaptation is vascular, not muscular — which is why it deliberately does not feel like hard training.',
    timer: { workSec: 600, restSec: 300, repsPerSet: 1, setRestSec: 300 },
    cues: [
      'RPE 3-4 — easy breathing, sustained mild pump, never pumping out.',
      'Terrain 3-4 grades below your on-sight.',
      'Straight arms, exhale on every move, shake out every 5-8 moves even when fresh.',
    ],
    safety: ['If you pump out, you went too hard — drop a grade rather than pushing through.'],
  },

  front_lever: {
    id: 'front_lever',
    name: 'Front Lever Progression',
    description:
      'Horizontal body hold from a bar, worked through tuck → advanced tuck → one-leg → full. Trains the straight-arm core tension that steep climbing demands.',
    timer: { workSec: 8, restSec: 0, repsPerSet: 1, setRestSec: 90 },
    cues: [
      'Straight line from shoulder to hip in every variation.',
      'Scapular depression — shoulders away from ears — is what makes the hold work.',
      'A five-second tuck lever is a real stimulus. Progress the shape, not just the clock.',
    ],
  },

  density_hangs: {
    id: 'density_hangs',
    name: 'Density Hangs',
    description:
      'Long, sub-maximal hangs — 30 to 40 seconds at or near bodyweight. Trains connective-tissue density and endurance in the half-crimp rather than peak strength. The target sensation is dull fatigue, never pump.',
    timer: { workSec: 30, restSec: 0, repsPerSet: 1, setRestSec: 180 },
    grip: 'Half crimp or open hand, 20mm edge',
    cues: [
      'RPE 6-7. Dull fatigue, not pump.',
      'Progress by time OR load, never both in the same week.',
      'If you start shaking, drop off — shaking recruits the wrong patterns.',
    ],
  },

  frenchies: {
    id: 'frenchies',
    name: 'Frenchies',
    description:
      'One cycle is: pull all the way up, hold at the top 5s, lower to 90° and hold 5s, lower to 120° and hold 5s, then dead hang. Trains the three critical lock-off angles in a single set.',
    timer: { workSec: 5, restSec: 0, repsPerSet: 3, setRestSec: 180 },
    cues: ['One to two cycles per set, 3 sets, 3 min rest.', 'RPE 7-8.'],
  },

  offset_lock_offs: {
    id: 'offset_lock_offs',
    name: 'Offset Lock-Offs',
    description:
      'One hand on the bar, the other on a towel hanging 6-12 inches below. Pull to the bar and hold 5 seconds at 90°. The uneven loading forces the working arm to hold far more than half bodyweight — the stepping stone to one-arm strength.',
    timer: { workSec: 5, restSec: 0, repsPerSet: 1, setRestSec: 180 },
    cues: ['Towel hangs 6-12 inches below the bar.', 'Hold at 90° on the bar-side arm.'],
  },

  one_arm_negatives: {
    id: 'one_arm_negatives',
    name: 'One-Arm Negatives',
    description:
      'Jump or step to a one-arm lock-off at the bar, then lower yourself on that arm for 5 seconds. The most powerful isometric progression in these programs — direct carryover to powerful pulls off single hands.',
    timer: { workSec: 5, restSec: 0, repsPerSet: 1, setRestSec: 180 },
    cues: ['Use a foot on a chair for assistance as needed.', 'Five seconds of controlled lowering is the work.'],
    safety: ['Skip entirely with any elbow symptom — this is the highest-load pulling exercise in the program.'],
  },
};

export function getProtocol(id: ProtocolId): Protocol | undefined {
  return PROTOCOLS[id];
}
