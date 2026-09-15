import { describe, expect, it } from 'vitest';
import { SPAWN } from './config';
import { NO_ENDINGS, recordEnding, type Endings } from './endings';
import {
  DANGEROUS,
  ENOUGH_ENDINGS,
  describeEndings,
  readEndings,
  spawnShares,
} from './endingsRead';

const fold = (runs: [Parameters<typeof recordEnding>[1], number][]): Endings =>
  runs.reduce((acc, [by, metres]) => recordEnding(acc, by, metres), NO_ENDINGS);

/** `n` runs of one kind, all the same length. */
const many = (by: Parameters<typeof recordEnding>[1], n: number, metres = 500): [typeof by, number][] =>
  Array.from({ length: n }, () => [by, metres] as [typeof by, number]);

describe('folding one ended run in', () => {
  it('counts the kind, the metres and the run', () => {
    const one = recordEnding(NO_ENDINGS, 'debris', 620);
    expect(one).toEqual({ rock: 0, boulder: 0, debris: 1, metres: 620, counted: 1 });
  });

  it('never takes a negative height into the average', () => {
    expect(recordEnding(NO_ENDINGS, 'rock', -50).metres).toBe(0);
  });

  it('leaves the tally it was given alone', () => {
    const before = { ...NO_ENDINGS };
    recordEnding(before, 'rock', 100);
    expect(before).toEqual(NO_ENDINGS);
  });
});

describe('the share of the wall each thing is', () => {
  it('comes from the one spawn table and sums to one', () => {
    const shares = spawnShares();
    const total = shares.rock + shares.boulder + shares.debris;
    expect(total).toBeCloseTo(1, 10);
    // 60 / 25 / 15 in `SPAWN.obstacles`.
    expect(shares.rock).toBeCloseTo(0.6, 10);
    expect(shares.debris).toBeCloseTo(0.15, 10);
    expect(SPAWN.obstacles.map(([kind]) => kind)).toEqual(['rock', 'boulder', 'debris']);
  });
});

describe('reading the tally', () => {
  it('says nothing until there are enough runs behind it', () => {
    // Three runs is a coincidence with a percentage sign on it, and the
    // rarest obstacle is 15% of the wall.
    expect(readEndings(fold(many('debris', ENOUGH_ENDINGS - 1)))).toBeNull();
    expect(readEndings(fold(many('debris', ENOUGH_ENDINGS)))).not.toBeNull();
  });

  it('ranks by share against the wall, not by body count', () => {
    // Rocks kill more here — and they are 60% of what spawns, so they are
    // doing no more than their share. Debris at 15% killing 30% is not.
    const reading = readEndings(fold([...many('rock', 14), ...many('debris', 6)]))!;
    expect(reading.kinds[0]!.kind).toBe('debris');
    expect(reading.worst?.kind).toBe('debris');
    expect(reading.kinds.find((k) => k.kind === 'rock')!.deaths).toBe(14);
  });

  it('names nothing when nothing is out of proportion', () => {
    // Deaths in the same proportion as the wall: 60/25/15 of twenty.
    const reading = readEndings(fold([...many('rock', 12), ...many('boulder', 5), ...many('debris', 3)]))!;
    expect(reading.worst).toBeNull();
    expect(describeEndings(reading)).toMatch(/Nothing is getting you more than its share\./);
  });

  it('holds its nerve just under the threshold and names it just over', () => {
    // Twenty runs each way, so a kind's share is its count in twentieths.
    // The other two kinds have to be spelled out: leaving one at zero pushes
    // the others' shares up and picks a different winner, which is how the
    // first draft of this test was wrong.
    const at = (rock: number, boulder: number, debris: number) =>
      readEndings(fold([...many('rock', rock), ...many('boulder', boulder), ...many('debris', debris)]))!;

    // 6 boulders of 20 is 30% against a 25% share — a ratio of 1.2, under
    // the line, and the highest of the three.
    expect(at(11, 6, 3).kinds[0]!.ratio).toBeCloseTo(1.2, 10);
    expect(at(11, 6, 3).worst).toBeNull();

    // 4 debris of 20 is 20% against 15% — 1.33, over it.
    expect(at(11, 5, 4).kinds[0]!.ratio).toBeGreaterThanOrEqual(DANGEROUS);
    expect(at(11, 5, 4).worst?.kind).toBe('debris');
  });

  it('averages the run length over the runs it counted', () => {
    const reading = readEndings(fold([...many('rock', 9, 400), ...many('debris', 1, 1_400)]))!;
    expect(reading.counted).toBe(10);
    expect(reading.averageMetres).toBe(500);
  });
});

describe('said out loud', () => {
  it('answers the instruction the page already gives', () => {
    // "Rocks end the run; the small fast ones are the ones that get you" is
    // a claim the app made and had never checked.
    const reading = readEndings(fold([...many('rock', 14), ...many('debris', 6)]))!;
    expect(describeEndings(reading)).toBe(
      'Falling debris are 15% of what spawns and end 30% of your runs.' +
        ' The small fast ones really are the ones that get you.',
    );
  });

  it('does not claim it when the boulders are the problem', () => {
    const reading = readEndings(fold([...many('boulder', 12), ...many('rock', 8)]))!;
    expect(describeEndings(reading)).toBe('Boulders are 25% of what spawns and end 60% of your runs.');
    expect(describeEndings(reading)).not.toMatch(/small fast/);
  });
});
