// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { HomePage } from '@/features/home/HomePage';
import { CoachPage } from './CoachPage';

/**
 * On the screen, not merely in the rule (PLAN.md M173).
 *
 * The defect this milestone fixes was never in `buildTips` — it was that
 * `CoachCard` returns `null` on an empty list, so an engine with nothing to
 * say became a front door with no Coach's Corner on it. A rule that is right
 * and unrendered would leave that exactly as it was, which is the lesson
 * M152 named and M161, M164, M165 and M168 each shipped a battery survivor
 * for.
 *
 * So both halves are asserted here: the card is back on Home in the window
 * it used to vanish in, and the page's *"which is the good outcome"* is not
 * shown to a climber no rule can read yet.
 */

const DAY = today();

/** A week in, three sessions, effort scored. Nothing here can be modelled. */
async function aWeekIn(scored = true): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  // Every other day rather than named weekdays (PLAN.md M179b). A filter on
  // Mondays, Wednesdays and Fridays inside a window ending *today* puts a
  // different number of sessions in the fixture depending on which weekday
  // today is, and the suite changed shape at midnight. `useTips` reads the
  // clock itself, so this cannot take a date — a fixed stride from today is
  // deterministic instead, and the density is the same three a week.
  for (const d of [6, 4, 2]) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      durationMin: 60,
      warmup: true,
      drillDone: false,
      ...(scored ? { rpe: 7 } : {}),
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  useProfile.setState({ injuries: [], dismissedTips: {}, dismissedCards: [] });
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Coach's Corner, one week in", () => {
  it('is on the front door at all, which is the whole defect', async () => {
    await aWeekIn();
    renderAt('/', <HomePage />);
    expect(await screen.findByText("Coach's Corner")).toBeTruthy();
  });

  it('carries the countdown rather than a heading over nothing', async () => {
    await aWeekIn();
    renderAt('/', <HomePage />);
    await screen.findByText("Coach's Corner");
    expect(body()).toMatch(/\d+ more days? before the load ratio can say anything/);
  });

  it('says what does work while the ratio does not', async () => {
    await aWeekIn();
    renderAt('/coach', <CoachPage />);
    await screen.findByText(/more days? before the load ratio/);
    expect(body()).toMatch(/the grades, the pyramid, the projects and the log itself do not wait/);
  });

  /**
   * The sentence that made this a correctness bug rather than an empty
   * screen. *"Every rule here has looked at your log and found nothing worth
   * interrupting you about, which is the good outcome"* is a clean bill of
   * health, and no rule had read anything.
   *
   * It is not reworded — it is made true, by there always being something to
   * show while the model cannot run.
   */
  it('never issues a clean bill of health it has not earned', async () => {
    await aWeekIn();
    renderAt('/coach', <CoachPage />);
    await screen.findByText(/more days? before the load ratio/);
    expect(body()).not.toMatch(/which is the good outcome/);
  });

  it('tells the unscored climber the same week that nothing is counting', async () => {
    await aWeekIn(false);
    renderAt('/', <HomePage />);
    await screen.findByText("Coach's Corner");
    expect(body()).toMatch(/None of what you have logged is counting yet/);
  });

  /**
   * And it is dismissible like any other card, against this week's fact.
   *
   * Set aside through the button rather than by writing a signature into the
   * store (PLAN.md M179b). The first version wrote `'history:0'`, which is
   * the signature only for a fixture whose earliest scored day lands in the
   * same week — so it pinned the rule's signature *format* and the fixture's
   * arithmetic at once, and broke on a change to neither.
   */
  it('can be set aside, and the board says so rather than going blank', async () => {
    await aWeekIn();
    renderAt('/coach', <CoachPage />);
    const aside = await screen.findByRole('button', { name: /^Set aside: \d+ more days? before/ });
    fireEvent.click(aside);
    expect(await screen.findByText(/Bring back 1 set aside/)).toBeTruthy();
    expect(body()).not.toMatch(/which is the good outcome/);
  });
});
