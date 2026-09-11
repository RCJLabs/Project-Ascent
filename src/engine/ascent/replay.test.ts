import { describe, expect, it } from 'vitest';
import { TICK_MS } from './config';
import { NO_MODIFIERS, createRun, metres, step, type Input, type RunState } from './game';
import {
  MAX_MOVES,
  MAX_TICKS,
  Recorder,
  advanceGhost,
  createGhost,
  ghostGap,
  ghostY,
  inputAt,
  isTape,
  replayRun,
  tapeToRace,
  type Tape,
} from './replay';
import { CLIMBER } from './config';

/**
 * A run, replayed from its inputs (PLAN.md M81).
 *
 * `game.test.ts` already held the engine to reproducing a run from a seed
 * and a script. What these check is the *tape*: that a run played at one
 * frame rate, recorded, and replayed at another comes out identical to the
 * unit — which is the claim the whole feature rests on.
 */

/** Play a run at a given frame length, recording every input as it goes. */
function playAndRecord(
  seed: number,
  frameMs: number,
  script: (tick: number) => Input,
  maxMs = 40_000,
  modifiers = NO_MODIFIERS,
): { state: RunState; tape: Tape } {
  const state = createRun({ seed, modifiers });
  const recorder = new Recorder(seed, 'ascent', modifiers);
  for (let t = 0; t < maxMs && !state.over; t += frameMs) {
    const input = script(state.ticks);
    recorder.at(state.ticks, input);
    step(state, frameMs, input);
  }
  return { state, tape: recorder.take(state) };
}

/** A player who weaves: one way, then the other, on a rhythm. */
const weave = (tick: number): Input => (tick % 97 === 0 ? 1 : tick % 151 === 0 ? -1 : 0);

describe('a tape replays its run', () => {
  it('to the metre, the coin and the entity', () => {
    const { state, tape } = playAndRecord(4242, 16, weave);
    const again = replayRun(tape);

    expect(again.ticks).toBe(state.ticks);
    expect(metres(again)).toBe(metres(state));
    expect(again.coins).toBe(state.coins);
    expect(again.over).toBe(state.over);
    expect(again.lane).toBe(state.lane);
    expect(again.entities.map((e) => `${e.id}:${e.kind}:${e.lane}`)).toEqual(
      state.entities.map((e) => `${e.id}:${e.kind}:${e.lane}`),
    );
  });

  it('whatever frame rate recorded it', () => {
    // Not the same *tape* at every frame rate, which is what I first wrote
    // down and it is not true: a 30 Hz device simulates four ticks in a
    // frame and never observes the three in between, so it cannot put an
    // input on one of them. What does hold everywhere is the part the
    // feature needs — the tape replays the run that was recorded, to the
    // metre, whether the recording ran at 30 Hz or 144.
    for (const frameMs of [33, 16, 7]) {
      const { state, tape } = playAndRecord(777, frameMs, weave);
      const again = replayRun(tape);
      expect(again.ticks, `${frameMs}ms`).toBe(state.ticks);
      expect(metres(again), `${frameMs}ms`).toBe(metres(state));
      expect(again.coins, `${frameMs}ms`).toBe(state.coins);
    }
  });

  it('reproduces a run that ended in a crash', () => {
    // A player who never moves hits something; the tape has to end where
    // the run did rather than run on into a wall that is no longer there.
    const { state, tape } = playAndRecord(99, 16, () => 0);
    expect(state.over, 'the fixture never crashed').toBe(true);
    const again = replayRun(tape);
    expect(again.over).toBe(true);
    expect(metres(again)).toBe(metres(state));
  });

  it('is played by the climber who played it, not by today’s', () => {
    // An afternoon session moves END, END trims the speed ramp. A ghost
    // replayed against tonight’s stats would drift off the height it is
    // meant to be showing, so the tape carries its own modifiers.
    const strong = { ...NO_MODIFIERS, rampReduction: 0.5, chalkSaves: 3 };
    const { state, tape } = playAndRecord(2024, 16, weave, 40_000, strong);
    expect(tape.modifiers).toEqual(strong);
    expect(metres(replayRun(tape))).toBe(metres(state));
    // Same seed, same inputs, a weaker climber: a different run.
    const plain = replayRun({ ...tape, modifiers: NO_MODIFIERS });
    expect(metres(plain)).not.toBe(metres(state));
  });

  it('is not the same run on another seed', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const elsewhere = replayRun({ ...tape, seed: 1 });
    expect(metres(elsewhere)).not.toBe(metres(replayRun(tape)));
  });
});

describe('the tape is small', () => {
  it('stores the changes, not a value per tick', () => {
    const { state, tape } = playAndRecord(4242, 16, weave);
    expect(state.ticks).toBeGreaterThan(500);
    // Two numbers per lane change, against one per tick if it stored silence.
    expect(tape.moves.length).toBeLessThan(state.ticks / 4);
  });

  it('is no bigger for having been recorded on a fast screen', () => {
    // At 7 ms frames several of them fall inside one 8.33 ms tick and hand
    // over the same input again. One entry per tick, or a 144 Hz player
    // stores twice the tape a 60 Hz one does for the same run.
    const { tape } = playAndRecord(777, 7, weave);
    const ticks = tape.moves.filter((_, i) => i % 2 === 0);
    expect(ticks.length).toBeGreaterThan(0);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('keeps the last input of a tick, which is the one the engine sees', () => {
    const recorder = new Recorder(1, 'ascent');
    recorder.at(4, 1);
    recorder.at(4, -1);
    expect(recorder.take(createRun({ seed: 1 })).moves).toEqual([4, -1]);
  });

  it('records nothing for a player who never moves', () => {
    expect(playAndRecord(99, 16, () => 0).tape.moves).toEqual([]);
  });

  it('stops at a cap rather than growing without bound', () => {
    // A stuck key should cost a bounded number of bytes.
    const recorder = new Recorder(1, 'ascent');
    for (let i = 0; i < MAX_MOVES * 3; i += 1) recorder.at(i, 1);
    expect(recorder.take(createRun({ seed: 1 })).moves.length).toBe(MAX_MOVES * 2);
  });
});

describe('reading a tape back', () => {
  const good: Tape = { seed: 1, mode: 'ascent', ticks: 10, moves: [2, 1, 5, -1], modifiers: NO_MODIFIERS };

  it('accepts one the app wrote', () => {
    expect(isTape(good)).toBe(true);
  });

  it('refuses whatever else a backup file holds', () => {
    for (const bad of [
      null,
      42,
      { ...good, mode: 'nonsense' },
      { ...good, moves: [1] },
      { ...good, moves: [1, 'left'] },
      { ...good, ticks: '10' },
      { seed: 1 },
      { ...good, modifiers: undefined },
      // A tape that would spin the tab: `replayRun` walks one tick at a time.
      { ...good, ticks: MAX_TICKS + 1 },
      { ...good, ticks: -1 },
      { ...good, ticks: 10.5 },
      { ...good, modifiers: { ...NO_MODIFIERS, startWithSlowmo: 'yes' } },
      { ...good, modifiers: { ...NO_MODIFIERS, laneTrim: null } },
    ]) {
      expect(isTape(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('survives a round trip through JSON, which is how it is stored', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const back = JSON.parse(JSON.stringify(tape)) as unknown;
    expect(isTape(back)).toBe(true);
    expect(metres(replayRun(back as Tape))).toBe(metres(replayRun(tape)));
  });
});

describe('the cursor', () => {
  const tape: Tape = {
    seed: 1,
    mode: 'ascent',
    ticks: 100,
    moves: [3, 1, 8, -1, 20, 1],
    modifiers: NO_MODIFIERS,
  };

  it('hands over an input only at its tick', () => {
    expect(inputAt(tape, 2, 0)).toEqual({ input: 0, cursor: 0 });
    expect(inputAt(tape, 3, 0)).toEqual({ input: 1, cursor: 2 });
  });

  it('moves forward rather than searching from the start', () => {
    const first = inputAt(tape, 3, 0);
    const second = inputAt(tape, 8, first.cursor);
    expect(second).toEqual({ input: -1, cursor: 4 });
  });

  it('does not drop an input when asked at a later tick', () => {
    // A replay driven coarsely must not skip past a move; it takes the last
    // one due rather than losing both.
    expect(inputAt(tape, 9, 0).input).toBe(-1);
    expect(inputAt(tape, 9, 0).cursor).toBe(4);
  });

  it('runs out cleanly', () => {
    expect(inputAt(tape, 999, 6)).toEqual({ input: 0, cursor: 6 });
  });
});

describe('a ghost beside a live run', () => {
  it('ends up where replaying the whole tape would', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const ghost = createGhost(tape);
    // Advanced in ragged chunks, as a real frame loop would.
    for (let t = 0; t < tape.ticks + 50; t += 7) advanceGhost(ghost, t);
    advanceGhost(ghost, tape.ticks);
    expect(metres(ghost.state)).toBe(metres(replayRun(tape)));
  });

  it('is wherever the tape had reached at that tick', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const half = Math.floor(tape.ticks / 2);
    const ghost = createGhost(tape);
    advanceGhost(ghost, half);
    expect(ghost.state.ticks).toBe(half);
    expect(metres(ghost.state)).toBe(metres(replayRun(tape, { untilTick: half })));
  });

  it('stops at the end of the tape rather than climbing on', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const ghost = createGhost(tape);
    advanceGhost(ghost, tape.ticks * 4);
    expect(ghost.state.ticks).toBeLessThanOrEqual(tape.ticks);
  });

  it('costs one tick of work per tick, not a whole replay', () => {
    // The shape of the thing rather than a timing: advancing to the same
    // tick twice must simulate nothing the second time.
    const { tape } = playAndRecord(4242, 16, weave);
    const ghost = createGhost(tape);
    advanceGhost(ghost, 500);
    const at = ghost.state.ticks;
    advanceGhost(ghost, 500);
    expect(ghost.state.ticks).toBe(at);
  });
});

describe('one tick per step', () => {
  it('is what the replay relies on', () => {
    // If a single TICK_MS step ever simulated two ticks, every tape in
    // storage would replay a different run.
    const state = createRun({ seed: 3 });
    step(state, TICK_MS);
    expect(state.ticks).toBe(1);
    step(state, TICK_MS);
    expect(state.ticks).toBe(2);
  });
});

describe('a tape that disagrees with its own run', () => {
  // Only a restored backup produces one — `Recorder.take` reads the ticks
  // off the state it is handed — but a ghost must not climb a wall it has
  // no inputs for, or spin the tab trying to reach a tick it cannot.

  it('stops the ghost at the end of the tape, not at the live run', () => {
    const { tape } = playAndRecord(4242, 16, weave);
    const short = { ...tape, ticks: Math.floor(tape.ticks / 2) };
    const ghost = createGhost(short);
    advanceGhost(ghost, tape.ticks * 3);
    expect(ghost.state.ticks).toBe(short.ticks);
    expect(ghost.state.over).toBe(false);
  });

  it('stops the ghost when its run ends early, rather than looping forever', () => {
    // A crash at tick N and a tape claiming 5N: `step` on a finished run
    // simulates nothing, so without the `over` bound the loop never ends.
    const { state, tape } = playAndRecord(99, 16, () => 0);
    expect(state.over, 'the fixture never crashed').toBe(true);
    const ghost = createGhost({ ...tape, ticks: tape.ticks * 5 });
    advanceGhost(ghost, tape.ticks * 5);
    expect(ghost.state.over).toBe(true);
    expect(ghost.state.ticks).toBe(state.ticks);
  });
});

describe('where the ghost is drawn', () => {
  it('sits on the climber when the two are level', () => {
    const live = createRun({ seed: 1 });
    const ghost = createRun({ seed: 1 });
    expect(ghostY(live, ghost)).toBe(CLIMBER.y);
    expect(ghostGap(live, ghost)).toBe(0);
  });

  it('is further up the screen when it is further up the climb', () => {
    const live = createRun({ seed: 1 });
    const ghost = createRun({ seed: 1 });
    ghost.distance = live.distance + 120;
    // Smaller y is higher: the wall scrolls down past a fixed climber.
    expect(ghostY(live, ghost)).toBe(CLIMBER.y - 120);
    expect(ghostGap(live, ghost)).toBeGreaterThan(0);
  });

  it('is below when it is behind', () => {
    const live = createRun({ seed: 1 });
    const ghost = createRun({ seed: 1 });
    live.distance = ghost.distance + 90;
    expect(ghostY(live, ghost)).toBe(CLIMBER.y + 90);
    expect(ghostGap(live, ghost)).toBeLessThan(0);
  });
});

describe('choosing a tape to race', () => {
  const { tape } = playAndRecord(555, 16, weave);
  const now = { date: '2026-09-11', mode: 'ascent' as const, seed: tape.seed };
  const daily = { date: now.date, tape };

  it('races the day\u2019s best', () => {
    expect(tapeToRace(daily, now)).toBe(tape);
  });

  it('refuses yesterday\u2019s, which was a different wall', () => {
    expect(tapeToRace({ ...daily, date: '2026-09-10' }, now)).toBeNull();
  });

  it('refuses one seeded on another wall', () => {
    // The tab left open past midnight: the date has turned over, the wall
    // memoised at mount has not.
    expect(tapeToRace(daily, { ...now, seed: tape.seed + 1 })).toBeNull();
  });

  it('refuses the other mode, which is not a pace you can hold', () => {
    expect(tapeToRace(daily, { ...now, mode: 'freesolo' })).toBeNull();
    const solo = { ...tape, mode: 'freesolo' as const };
    expect(tapeToRace({ date: now.date, tape: solo }, now)).toBeNull();
    expect(tapeToRace({ date: now.date, tape: solo }, { ...now, mode: 'freesolo' })).toBe(solo);
  });

  it('refuses a record with no tape, which is every one written before M81', () => {
    expect(tapeToRace({ date: now.date }, now)).toBeNull();
    expect(tapeToRace(null, now)).toBeNull();
    expect(tapeToRace(undefined, now)).toBeNull();
  });

  it('refuses whatever a restored backup put there', () => {
    const junk = { moves: 'left left right' } as unknown as Tape;
    expect(tapeToRace({ ...daily, tape: junk }, now)).toBeNull();
  });
});
