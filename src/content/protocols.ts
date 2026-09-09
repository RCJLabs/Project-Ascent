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
};

export function getProtocol(id: ProtocolId): Protocol | undefined {
  return PROTOCOLS[id];
}
