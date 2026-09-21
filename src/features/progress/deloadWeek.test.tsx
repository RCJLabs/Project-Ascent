// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import type { BlockRecord } from '@/engine/blocks';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { ProgressPage } from './ProgressPage';

/**
 * A light week is light on purpose (PLAN.md M306).
 *
 * `deriveClimberState` has taken a `deloadDates` set since M67 and no
 * production code ever passed one — its only caller in the repository was a
 * test. So the correction the load model was built to make never ran, and a
 * climber doing exactly what the program asked was told their load was
 * dropping. Measured over one twelve-week Iron Grip block: fifteen such days.
 *
 * This is the wiring, on the screen that says it. `engine/deload.test.ts`
 * holds which days are in a deload week; `oneDerivation.test.tsx` holds that
 * every card on this page asks the same question.
 */

const DAY = today();
/** Week four of Iron Grip is the week we are in. */
const START = addDays(startOfWeek(DAY), -21);
/**
 * And a block far enough along that week four is entirely behind us
 * (PLAN.md M306b).
 *
 * The two cannot be one fixture, and the reason is the M299 shape. A program
 * week is Sunday-aligned and `inPlannedDeload` reads the last **seven days**,
 * so: with today inside week four there is a deload day in that window on
 * every weekday of the year — but on a Sunday today is the *first* day of it,
 * and every other day of that week is still ahead. A test needing an elapsed
 * deload day nobody logged had nothing to find, and CI said so on the
 * 2026-09-27 runner.
 *
 * Pushing the start back to put week four fully behind us fixes that one and
 * breaks the others, because by Saturday the acute window has left the deload
 * week entirely. Two blocks, each answering the question it is for.
 */
const OLDER_START = addDays(startOfWeek(DAY), -35);

const block = (startDate: string): BlockRecord => ({
  id: `iron_grip#${startDate}`,
  programId: 'iron_grip',
  name: 'Iron Grip',
  startDate,
  weeks: 12,
  endedAt: null,
});

const BLOCK = block(START);

/** Ten weeks of steady training, and a light last week — the deload. */
async function inADeloadWeek(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let ago = 70; ago >= 0; ago -= 2) {
    const light = ago < 7;
    const session: Session = {
      ...newSession(addDays(DAY, -ago), 0),
      completed: true,
      rpe: light ? 4 : 7,
      durationMin: light ? 45 : 75,
    };
    await putSession(session);
  }
  await hydrate();
  useSettings.setState({ progressView: 'all' });
}

const body = () => document.body.textContent ?? '';
/** What each cell of the consistency grid says, which is an SVG `<title>`. */
const titles = () => [...document.querySelectorAll('title')].map((t) => t.textContent ?? '');

async function open(): Promise<void> {
  renderAt('/progress', <ProgressPage />);
  await screen.findByText('Where the ratio has been');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a climber in a planned deload week', () => {
  it('is told their load is dropping when nothing says it was planned', async () => {
    await inADeloadWeek();
    // No block on record, so nothing can know the week was in the plan.
    useProfile.setState({ blocks: [] });
    await open();
    expect(body()).toContain('Load dropping');
    expect(body()).not.toContain('planned deload week');
  });

  it('is not, once the block they are running says so', async () => {
    await inADeloadWeek();
    useProfile.setState({
      blocks: [BLOCK],
      startDates: { iron_grip: START },
      activeProgramId: 'iron_grip',
    });
    await open();
    expect(body()).toContain('This is a planned deload week');
    expect(body()).not.toContain('Load dropping');
  });

  /**
   * The grid beside it read `session.deload` and nothing else, so it drew
   * the same seven days as an ordinary quiet week while the card above it
   * called them a planned deload. One question, one answer.
   */
  it('has the consistency grid saying the same thing as the load card', async () => {
    await inADeloadWeek();
    useProfile.setState({
      blocks: [BLOCK],
      startDates: { iron_grip: START },
      activeProgramId: 'iron_grip',
    });
    await open();
    const marked = titles().filter((t) => /deload/.test(t));
    expect(marked.length, 'the grid marks none of the deload days').toBeGreaterThan(0);
  });

  it('says so on a deload day nobody logged', async () => {
    await inADeloadWeek();
    // The older block, so week four is elapsed whatever day of the week
    // this runs on — see `OLDER_START`.
    useProfile.setState({
      blocks: [block(OLDER_START)],
      startDates: { iron_grip: OLDER_START },
      activeProgramId: 'iron_grip',
    });
    await open();
    const quiet = titles().filter((t) => /nothing logged, deload week/.test(t));
    expect(quiet.length, 'a rested deload day still reads as an unexplained gap').toBeGreaterThan(0);
  });

  it('goes back to reading the log once the block is over', async () => {
    await inADeloadWeek();
    // Left the block a fortnight ago: this week is nobody's plan.
    useProfile.setState({
      blocks: [{ ...BLOCK, endedAt: addDays(DAY, -14) }],
      startDates: {},
      activeProgramId: null,
    });
    await open();
    expect(body()).toContain('Load dropping');
  });
});
