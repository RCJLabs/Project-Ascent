import { beforeAll, describe, expect, it } from 'vitest';
import { PROGRAMS, loadPrograms } from '@/content/programs';
import type { SetOutcome } from '@/db/sessions';
import {
  OUTCOME_MEANING,
  OUTCOME_WORD,
  SET_OUTCOMES,
  describeEntry,
  exerciseSeries,
  hasNumbers,
} from './exerciseLog';

/**
 * How the sets went (PLAN.md M238).
 *
 * The field exists to feed the conditional steps the catalogue already
 * authors, so the tests worth writing are the ones that hold the two ends of
 * that together — the vocabulary against the prose that asks for it, and the
 * new field against the rules that decide what counts as a reading.
 */

beforeAll(async () => {
  await loadPrograms();
});

/** Every `WeekStep` the catalogue ships, with the program it is in. */
function steps(): { program: string; step: string }[] {
  const out: { program: string; step: string }[] = [];
  for (const program of PROGRAMS) {
    // Blocks hang off a session type, not off the program.
    for (const type of program.sessionTypes) {
      for (const block of type.blocks ?? []) {
        for (const phase of Object.values(block.perPhase)) {
          for (const week of phase?.perWeek ?? []) {
            out.push({ program: program.name, step: week.step });
          }
        }
      }
    }
  }
  return out;
}

describe('the vocabulary', () => {
  it('has a word and a meaning for every state, and nothing spare', () => {
    // A state added without a label renders `undefined` on a chip and writes
    // an empty cell to the spreadsheet, neither of which fails anywhere else.
    expect([...SET_OUTCOMES].sort()).toEqual(Object.keys(OUTCOME_WORD).sort());
    expect([...SET_OUTCOMES].sort()).toEqual(Object.keys(OUTCOME_MEANING).sort());
    expect(new Set(Object.values(OUTCOME_WORD)).size).toBe(SET_OUTCOMES.length);
  });

  /** Hardest-held first, which is the order the catalogue's rules step down. */
  it('reads solid, hard, failed', () => {
    expect(SET_OUTCOMES).toEqual(['solid', 'hard', 'failed']);
  });
});

describe('the prose this field exists for', () => {
  /**
   * The seam the whole milestone rests on, pinned. The catalogue authors
   * nine `WeekStep`s across two programs, and the conditional ones are the
   * reason a per-set outcome is worth storing at all. If they were rewritten
   * away the field would be feeding nothing, and that should fail loudly
   * rather than quietly persisting an answer nobody reads.
   */
  it('is nine steps, in Iron Grip and The Siege and nowhere else', () => {
    const all = steps();
    expect(all).toHaveLength(9);
    expect([...new Set(all.map((s) => s.program))].sort()).toEqual(['Iron Grip', 'The Siege']);
  });

  it('asks how the last week went, in four of them', () => {
    const conditional = steps().filter((s) => /\bif\b|felt solid|failed early/i.test(s.step));
    expect(conditional).toHaveLength(4);
    // And the words the three chips are named after are the catalogue's own,
    // not a vocabulary this engine invented.
    const said = conditional.map((s) => s.step).join(' ');
    expect(said).toMatch(/felt solid/i);
    expect(said).toMatch(/failed early/i);
    expect(said).toMatch(/held to the last rep/i);
    // The Siege draws the distinction the third state exists for.
    expect(said).toMatch(/felt hard is not the same as felt solid/i);
  });
});

describe('an outcome is not a reading', () => {
  const HANG = 'Max Hangs';

  /**
   * The rule that keeps the series honest. `hasNumbers` decides what becomes
   * a point on a chart and what "Same again" will offer, and an entry
   * carrying nothing but a verdict is a climber's opinion of a session they
   * did not write down.
   */
  it('does not make a bare tick into one', () => {
    expect(hasNumbers({ name: HANG, outcome: 'solid' })).toBe(false);
    expect(hasNumbers({ name: HANG, sets: 5 })).toBe(true);
  });

  it('keeps an outcome-only entry off the series', () => {
    const log = [
      {
        id: '2026-01-05#0',
        date: '2026-01-05',
        completed: true,
        climbs: [],
        exercises: [{ name: HANG, outcome: 'hard' as SetOutcome }],
      },
      {
        id: '2026-01-08#0',
        date: '2026-01-08',
        completed: true,
        climbs: [],
        exercises: [{ name: HANG, sets: 5, hold: 10, outcome: 'solid' as SetOutcome }],
      },
    ] as never[];
    expect(exerciseSeries(log, HANG).map((p) => p.date)).toEqual(['2026-01-08']);
  });

  /**
   * And it stays out of the sentence. `describeEntry` returns empty when
   * there is nothing but a tick, and callers use that emptiness — a verdict
   * leaking into it would make an unwritten session read as a written one.
   */
  it('is not part of the numbers sentence', () => {
    expect(describeEntry({ name: HANG, outcome: 'solid' }, 'imperial')).toBe('');
    expect(describeEntry({ name: HANG, sets: 5, hold: 10, outcome: 'failed' }, 'imperial')).toBe(
      '5 × 10s',
    );
  });
});
