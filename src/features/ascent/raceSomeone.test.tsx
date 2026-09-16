// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, putAscent } from '@/db/game';
import { NO_MODIFIERS, createRun, metres, modifiersFrom, step } from '@/engine/ascent/game';
import { Recorder, type Tape } from '@/engine/ascent/replay';
import { runHeight } from '@/engine/ascent/scale';
import { encodeTape } from '@/engine/ascent/tapeFile';
import { FREE_SOLO_UNLOCK } from '@/engine/ascent/unlock';
import { useGame } from '@/store/game';
import { playableCanvas } from '@/test/canvas';
import { renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/** What `downloadFile` was handed, as text, for the reply test below. */
const saved: string[] = [];
vi.mock('@/lib/download', () => ({
  downloadFile: (blob: Blob) => {
    // Recorded rather than performed: jsdom has no downloads folder, and
    // the content is the assertion.
    void blob.text().then((text) => saved.push(text));
  },
}));

/**
 * The run that arrives as a file (PLAN.md M219).
 *
 * The engine tests hold the envelope and the replay. These hold the page,
 * because every fault M212's battery found was on this side of the line:
 * a decoder can be right about a forged tape and the card can still offer
 * it, and a rule that a race pays nothing is a rule about `recordRun`
 * being called, which only a page test can see.
 */

/**
 * A sender who has trained, which matters more than it looks.
 *
 * `modifiersFrom` with every stat at its base is *identical* to
 * `NO_MODIFIERS` — every `scale` term is zero — so a fixture using the
 * neutral climber cannot tell "played with your modifiers" from "played
 * with theirs". M219's battery found exactly that: the mutant swapping one
 * for the other survived against a fixture where they were equal.
 */
const SENDER = modifiersFrom({ end: 90, agi: 80, men: 70, tec: 60, str: 50, boons: [] });

function playedTape(seed: number, mode: 'ascent' | 'freesolo' = 'ascent'): { tape: Tape; climbed: number } {
  const recorder = new Recorder(seed, mode, SENDER);
  let run = createRun({ seed, mode, modifiers: SENDER });
  for (let i = 0; i < 700 && !run.over; i += 1) {
    const input = i % 80 === 0 ? 1 : 0;
    if (input !== 0) recorder.at(run.ticks, input);
    run = step(run, 16, input);
  }
  return { tape: recorder.take(run), climbed: metres(run) };
}

/** A File whose `.text()` resolves — jsdom's own does not, reliably. */
function runFile(text: string, name = 'run.json'): File {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

beforeEach(async () => {
  saved.length = 0;
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  useGame.setState({ ledger: [], bounties: [], wallet: { spent: 0 }, ascent: EMPTY_ASCENT, hydrated: false });
});

async function open(best = 0): Promise<void> {
  await putAscent({ ...EMPTY_ASCENT, best: { ...EMPTY_ASCENT.best, ascent: best } });
  await useGame.getState().load();
  renderAt('/ascent', <AscentPage />);
  await screen.findByText('Race someone');
}

async function pick(file: File): Promise<void> {
  const input = document.querySelector('input[type="file"][accept*="json"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('opening a run someone sent', () => {
  it('shows the height its inputs actually climb, and offers to race it', async () => {
    const { tape, climbed } = playedTape(4242);
    await open();
    await pick(runFile(encodeTape(tape, '2026-09-15', climbed)));
    expect(await screen.findByRole('button', { name: /Race it/ })).toBeTruthy();
    expect(screen.getByText(/on the wall from|on today's wall/)).toBeTruthy();
  });

  it('prices it by replaying, and says so when the file claimed otherwise', async () => {
    // The property the whole feature rests on, seen from the page.
    const { tape } = playedTape(4242);
    await open();
    await pick(runFile(encodeTape(tape, '2026-09-15', 99_999)));
    await screen.findByRole('button', { name: /Race it/ });
    // Both figures are on screen: the claim, and what the inputs actually
    // climb. In the climber's units, so the comparison is readable.
    const said = screen.getByText(/The file claimed/).textContent ?? '';
    expect(said).toContain(runHeight(99_999, 'imperial').label);
    expect(said).toContain('actually climb');
  });

  it('refuses a climber the game could not have produced', async () => {
    const { tape, climbed } = playedTape(4242);
    const cheated: Tape = {
      ...tape,
      modifiers: { ...tape.modifiers, rampReduction: 1, hitboxTrim: 1 },
    };
    await open();
    await pick(runFile(encodeTape(cheated, '2026-09-15', climbed)));
    expect(await screen.findByText(/damaged, or was edited/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Race it/ })).toBeNull();
  });

  it('says which kind of wrong a file that is not a run is', async () => {
    await open();
    await pick(runFile('{"hello":"world"}'));
    expect(await screen.findByText(/not an Ascent run file/)).toBeTruthy();
  });

  it('will not let a Free Solo tape open a mode this climber has not', async () => {
    // M218's gate is a proficiency check, and a friend's file is not a way
    // around the belay check.
    const solo = playedTape(4242, 'freesolo');
    await open(0);
    await pick(runFile(encodeTape(solo.tape, '2026-09-15', solo.climbed)));
    const race = await screen.findByRole('button', { name: /Race it/ });
    expect(race.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/That is a Free Solo run/)).toBeTruthy();
  });

  it('lets it through once the gate is passed', async () => {
    const solo = playedTape(4242, 'freesolo');
    await open(FREE_SOLO_UNLOCK);
    await pick(runFile(encodeTape(solo.tape, '2026-09-15', solo.climbed)));
    const race = await screen.findByRole('button', { name: /Race it/ });
    expect(race.hasAttribute('disabled')).toBe(false);
  });
});

describe('racing it', () => {
  it('counts for the race and for nothing else', async () => {
    // Recording it would set `best`, enter the day's history and re-price
    // the one `ascent:<date>` ledger entry — which would make picking an
    // easy wall a way to earn.
    const stop = playableCanvas();
    try {
      const { tape, climbed } = playedTape(4242);
      await open();
      const record = vi.spyOn(useGame.getState(), 'recordRun');
      await pick(runFile(encodeTape(tape, '2026-09-15', climbed)));
      fireEvent.click(await screen.findByRole('button', { name: /Race it/ }));

      // The run really runs, and the wall really ends it.
      const ended = await screen.findByText(/sets no record and pays nothing/, undefined, {
        timeout: 15_000,
      });
      expect(ended).toBeTruthy();
      expect(record).not.toHaveBeenCalled();
      expect(useGame.getState().ascent.best.ascent).toBe(0);
      expect(useGame.getState().ascent.days).toEqual([]);
      expect(useGame.getState().ledger).toEqual([]);
      record.mockRestore();
    } finally {
      stop();
    }
  }, 30_000);

  it('saves a reply on their wall, played by you', async () => {
    /**
     * Two rules at once, and neither was observable before M219's battery
     * said so: the race is run on the sender's seed, and the climber is the
     * one holding the device. Both land in the file the race writes, which
     * is the only place a test can read them back out.
     */
    const stop = playableCanvas();
    try {
      const { tape, climbed } = playedTape(4242);
      await open();
      await pick(runFile(encodeTape(tape, '2026-09-15', climbed)));
      fireEvent.click(await screen.findByRole('button', { name: /Race it/ }));
      await screen.findByText(/sets no record and pays nothing/, undefined, { timeout: 15_000 });

      fireEvent.click(screen.getByRole('button', { name: /Save this run to a file/ }));
      await waitFor(() => expect(saved).toHaveLength(1));
      const written = JSON.parse(saved[0]!) as { date: string; tape: Tape };
      expect(written.tape.seed).toBe(tape.seed);
      expect(written.date).toBe('2026-09-15');
      // This climber's own modifiers, not the sender's — and the two are
      // different, which is what makes the assertion mean anything.
      expect(written.tape.modifiers).toEqual(NO_MODIFIERS);
      expect(written.tape.modifiers).not.toEqual(SENDER);
      expect(tape.modifiers).toEqual(SENDER);
    } finally {
      stop();
    }
  }, 30_000);

  it('measures a race against the run it raced, and nothing else', async () => {
    // Two faults the browser found and no test would have. The header
    // compared a race to a lifetime record it never touches, reading "Best
    // is 0 ft"; and the daily-wall share card was offered for a run that
    // may be on any wall the sender's file carries.
    const stop = playableCanvas();
    try {
      const { tape, climbed } = playedTape(4242);
      await open();
      await pick(runFile(encodeTape(tape, '2026-09-15', climbed)));
      fireEvent.click(await screen.findByRole('button', { name: /Race it/ }));
      await screen.findByText(/sets no record and pays nothing/, undefined, { timeout: 15_000 });
      expect(screen.queryByText(/Best is /)).toBeNull();
      expect(screen.queryByText(/Share Daily Wall/)).toBeNull();
      // And the one share that does fit a race is there.
      expect(screen.getByRole('button', { name: /Save this run to a file/ })).toBeTruthy();
    } finally {
      stop();
    }
  }, 30_000);

  it('records an ordinary run, which is what makes the rule above a rule', async () => {
    // The control. Without it, "recordRun was not called" is also what a
    // run that never started looks like.
    const stop = playableCanvas();
    try {
      await open();
      const record = vi.spyOn(useGame.getState(), 'recordRun');
      fireEvent.click(await screen.findByRole('button', { name: /^Climb$/ }));
      await waitFor(() => expect(record).toHaveBeenCalled(), { timeout: 15_000 });
      // And the two things a race hides are both here on an ordinary run.
      // A first run beats a record of zero, so the line reads either way.
      const share = await screen.findByText(/Share Daily Wall/, undefined, { timeout: 15_000 });
      expect(share).toBeTruthy();
      expect(screen.getByText(/A new best\.|Best is /)).toBeTruthy();
      record.mockRestore();
    } finally {
      stop();
    }
  }, 30_000);
});
