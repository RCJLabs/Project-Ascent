import { describe, expect, it } from 'vitest';
import { BOON_IDS } from './boons';
import { NO_MODIFIERS, createRun, metres, modifiersFrom, step } from './game';
import { Recorder, isTape, replayRun, type Tape } from './replay';
import {
  TAPE_FORMAT,
  TAPE_VERSION,
  decodeTape,
  describeTape,
  encodeTape,
  raceSetup,
  tapeFilename,
} from './tapeFile';

/**
 * A run that travels (PLAN.md M219).
 *
 * The property under test is the one the whole feature rests on: **a tape
 * cannot lie about its height**, because the height is recomputed from the
 * inputs rather than read from the file.
 */

/** Plays a real run, steering, so the tape has moves in it. */
function played(seed = 7, mode: 'ascent' | 'freesolo' = 'ascent'): { tape: Tape; climbed: number } {
  const recorder = new Recorder(seed, mode, NO_MODIFIERS);
  let run = createRun({ seed, mode, modifiers: NO_MODIFIERS });
  for (let i = 0; i < 900 && !run.over; i += 1) {
    const input = i % 90 === 0 ? 1 : i % 137 === 0 ? -1 : 0;
    if (input !== 0) recorder.at(run.ticks, input);
    run = step(run, 16, input);
  }
  return { tape: recorder.take(run), climbed: metres(run) };
}

const file = (tape: Tape, date = '2026-09-15', climbed = 0) => encodeTape(tape, date, climbed);

describe('a run written to a file', () => {
  it('round-trips to the same height it was played at', () => {
    const { tape, climbed } = played();
    const loaded = decodeTape(file(tape, '2026-09-15', climbed));
    expect(typeof loaded).not.toBe('string');
    if (typeof loaded === 'string') return;
    expect(loaded.metres).toBe(climbed);
    expect(loaded.claimed).toBeNull();
    expect(loaded.date).toBe('2026-09-15');
    expect(loaded.tape.moves).toEqual(tape.moves);
  });

  it('is readable by a person, because someone will check before sending it', () => {
    const { tape, climbed } = played();
    const text = file(tape, '2026-09-15', climbed);
    expect(text).toContain('\n');
    expect(text).toContain(TAPE_FORMAT);
    expect(JSON.parse(text).version).toBe(TAPE_VERSION);
  });

  it('names itself something a downloads folder can tell apart', () => {
    expect(tapeFilename('2026-09-15', 1240.6)).toBe('ascent-2026-09-15-1241m.json');
  });
});

describe('a run read from a file someone else wrote', () => {
  it('takes the replayed height, not the claimed one', () => {
    // The whole feature. A file claiming twelve thousand metres is worth
    // whatever its inputs actually survive.
    const { tape, climbed } = played();
    const loaded = decodeTape(file(tape, '2026-09-15', 12_000));
    if (typeof loaded === 'string') throw new Error(loaded);
    expect(loaded.metres).toBe(climbed);
    expect(loaded.metres).toBeLessThan(12_000);
  });

  it('says when the claim and the replay disagree, rather than hiding it', () => {
    const { tape } = played();
    const loaded = decodeTape(file(tape, '2026-09-15', 12_000));
    if (typeof loaded === 'string') throw new Error(loaded);
    // Reported beside the real height: a disagreement is the signature of a
    // file that was edited, and the climber is told rather than protected.
    expect(loaded.claimed).toBe(12_000);
  });

  it('refuses a climber the game could not have produced', () => {
    // The one thing a forger could reach for: a wall that never speeds up
    // and a hitbox nothing can touch.
    const { tape, climbed } = played();
    const cheated: Tape = {
      ...tape,
      modifiers: { ...tape.modifiers, rampReduction: 1, hitboxTrim: 1 },
    };
    expect(isTape(cheated)).toBe(false);
    expect(decodeTape(file(cheated, '2026-09-15', climbed))).toBe('damaged');
  });

  it('refuses each forged modifier on its own, not only a pair of them', () => {
    // M219's battery found this: the forged tape above sets two fields, so
    // dropping the bound on *either* one still failed the test. Each is its
    // own lock and each is picked separately.
    const { tape } = played();
    const forged: Partial<Record<keyof typeof tape.modifiers, number | boolean>>[] = [
      { rampReduction: 1 },
      { hitboxTrim: 1 },
      { chalkSaves: 9 },
      { laneTrim: 0.9 },
      { coinMultiplier: 50 },
      { coinMultiplier: 0 },
      { rampReduction: -1 },
    ];
    for (const patch of forged) {
      expect(isTape({ ...tape, modifiers: { ...tape.modifiers, ...patch } }), JSON.stringify(patch)).toBe(
        false,
      );
    }
  });

  it('refuses the three modifiers M211 added and M219 found unchecked', () => {
    const { tape } = played();
    for (const patch of [{ extraLives: 99 }, { slowmoScale: 40 }, { invulnScale: 40 }]) {
      expect(isTape({ ...tape, modifiers: { ...tape.modifiers, ...patch } }), JSON.stringify(patch)).toBe(
        false,
      );
    }
  });

  it('accepts the strongest climber the game can actually produce', () => {
    // The bound is a ceiling, not a ban: a maxed climber holding every boon
    // has to be able to send a tape.
    const { tape } = played();
    const best = modifiersFrom({ end: 100, agi: 100, men: 100, tec: 100, str: 100, boons: BOON_IDS });
    expect(isTape({ ...tape, modifiers: best })).toBe(true);
  });

  it('accepts a tape written before M211, which has three fields missing', () => {
    const { tape } = played();
    const { extraLives: _a, slowmoScale: _b, invulnScale: _c, ...older } = tape.modifiers;
    expect(isTape({ ...tape, modifiers: older })).toBe(true);
  });
});

describe('what it says about a file that is not one', () => {
  const { tape, climbed } = played();

  it('tells the climber which kind of wrong it is', () => {
    expect(decodeTape('not json at all')).toBe('unreadable');
    expect(decodeTape('[]')).toBe('not-a-run');
    expect(decodeTape(JSON.stringify({ hello: 'world' }))).toBe('not-a-run');
    expect(
      decodeTape(JSON.stringify({ format: TAPE_FORMAT, version: TAPE_VERSION + 1 })),
    ).toBe('too-new');
    expect(
      decodeTape(JSON.stringify({ format: TAPE_FORMAT, version: TAPE_VERSION, date: 'x' })),
    ).toBe('damaged');
  });

  it('reads a file from an older version rather than refusing it', () => {
    // Only *newer* is refused. A run saved by version 1 has to stay
    // playable by version 5, or the format is a promise for one release.
    const text = file(tape, '2026-09-15', climbed).replace(
      `"version": ${TAPE_VERSION}`,
      `"version": ${TAPE_VERSION - 1}`,
    );
    expect(typeof decodeTape(text)).not.toBe('string');
  });

  it('refuses a tape whose moves were emptied out', () => {
    // A truncated file replays to a climber standing still, which is not a
    // run anyone played and should not be offered as one to race.
    const empty: Tape = { ...tape, ticks: 0, moves: [] };
    expect(decodeTape(file(empty, '2026-09-15', climbed))).toBe('damaged');
  });
});

describe('the run a challenge starts', () => {
  it('is their wall and their mode', () => {
    const { tape } = played(4242, 'freesolo');
    const loaded = decodeTape(file(tape, '2026-09-15', 1));
    // A Free Solo tape replayed with no steering can still be short; take
    // the tape directly rather than depending on the height.
    const against = typeof loaded === 'string' ? null : loaded;
    expect(raceSetup(against, { seed: 1, mode: 'ascent' })).toEqual({
      seed: tape.seed,
      mode: 'freesolo',
    });
  });

  it("is today's wall when there is nothing to race", () => {
    expect(raceSetup(null, { seed: 77, mode: 'ascent' })).toEqual({ seed: 77, mode: 'ascent' });
  });

  it('hands back no modifiers, because the climber is always you', () => {
    const { tape, climbed } = played();
    const loaded = decodeTape(file(tape, '2026-09-15', climbed));
    if (typeof loaded === 'string') throw new Error(loaded);
    // Racing with the sender's stats would be racing a copy of them.
    expect(Object.keys(raceSetup(loaded, { seed: 1, mode: 'ascent' })).sort()).toEqual([
      'mode',
      'seed',
    ]);
  });
});

describe('what the sheet says before you race it', () => {
  it('names the wall by its date, which is the thing two climbers share', () => {
    const { tape, climbed } = played();
    const loaded = decodeTape(file(tape, '2026-09-15', climbed));
    if (typeof loaded === 'string') throw new Error(loaded);
    expect(describeTape(loaded, '2026-09-15')).toBe('the Ascent, on today’s wall.'.replace('’', "'"));
    expect(describeTape(loaded, '2026-09-20')).toContain('the wall from ');
  });

  it('names the mode, because the two are not the same race', () => {
    const solo = played(11, 'freesolo');
    const loaded = decodeTape(file(solo.tape, '2026-09-15', solo.climbed));
    if (typeof loaded === 'string') throw new Error(loaded);
    expect(describeTape(loaded, '2026-09-15')).toContain('Free Solo');
  });
});

describe('the replay is the authority', () => {
  it('reaches the same height as the run that was recorded', () => {
    // `replay.test.ts` holds this for the engine; it is restated here
    // because it is what `decodeTape` leans on to be able to ignore a claim.
    const { tape, climbed } = played();
    expect(metres(replayRun(tape))).toBe(climbed);
  });
});
