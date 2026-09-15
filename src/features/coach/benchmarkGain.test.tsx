// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { HomePage } from '@/features/home/HomePage';
import { CoachPage } from './CoachPage';

/**
 * The good news, on a screen (PLAN.md M178).
 *
 * The engine test proves the rule. This proves the climber sees it, which is
 * a different question and the one the last four milestones kept finding
 * bugs in: `useTips` reads the stores itself, and a rule can be right and
 * invisible because the hook never handed it an input (M174) or because a
 * heavier card took the one slot Home gives the board (M173).
 *
 * So nothing is constructed here. Two readings go in the database, the page
 * is mounted at its route, and the question is whether the sentence arrives.
 */

const DAY = today();

/**
 * A month of training and one benchmark measured twice — 30 lbs eight weeks
 * ago, 33 last week.
 *
 * Fixed strides from today rather than named weekdays: `useTips` reads the
 * clock itself so this cannot take a date, and a weekday filter changes the
 * fixture's shape at midnight (PLAN.md M179b).
 */
async function withAGain(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let d = 29; d >= 0; d -= 2) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  for (const [daysAgo, value] of [
    [56, 30],
    [7, 33],
  ] as [number, number][]) {
    const date = addDays(DAY, -daysAgo);
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date, value });
  }
  await hydrate();
  // After `hydrate`, which reloads the profile and would overwrite it.
  // No start date, deliberately — see `benchmarkAsk.test.tsx`: four weeks
  // into Iron Grip reaches its deload week and fires a heavier card.
  useProfile.setState({
    activeProgramId: null,
    startDates: {},
    injuries: [],
    dismissedTips: {},
    dismissedCards: ['safety', 'setup', 'programs'],
  });
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a benchmark that went up', () => {
  it('reaches the front door', async () => {
    await withAGain();
    renderAt('/', <HomePage />);
    await screen.findByText("Coach's Corner");
    expect(body(), 'the only card Home shows was still a fault').toMatch(
      /Max Hang 20mm 7s improved: \+3 BW\+lbs \(10%\)/,
    );
  });

  it('carries the window and somewhere to look on the board', async () => {
    await withAGain();
    renderAt('/coach', <CoachPage />);
    await screen.findByText(/Max Hang 20mm 7s improved/);
    expect(body(), 'over how long').toMatch(/over 7 weeks/);
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/assessments');
    expect(link, 'no way to go and look at the curve').toBeTruthy();
    expect((link!.textContent ?? '').trim()).toBe('See the curve');
  });

  /**
   * And it arrives coloured as good news. Both screens tone by `tip.tone`,
   * so a sentence that is right and grey reads as one more thing to attend
   * to — which is the problem this milestone is about. Asserted against a
   * card on the same board that is *not* good news, so the check cannot
   * pass by the whole page being green.
   */
  it('is coloured as good news, where the nag beside it is not', async () => {
    await withAGain();
    renderAt('/coach', <CoachPage />);
    const headline = await screen.findByText(/Max Hang 20mm 7s improved/);
    const icon = headline.parentElement?.querySelector('svg');
    expect(icon?.getAttribute('class'), 'the good news is not toned good').toMatch(/text-positive/);

    const nag = screen.getByText(/sessions logged and never exported/);
    const nagIcon = nag.parentElement?.querySelector('svg');
    expect(nagIcon, 'no second card, so the contrast proves nothing').toBeTruthy();
    expect(nagIcon!.getAttribute('class')).not.toMatch(/text-positive/);
  });

  /** Home tones its one card the same way, from the same field. */
  it('is coloured as good news on the front door too', async () => {
    await withAGain();
    renderAt('/', <HomePage />);
    const label = await screen.findByText("Coach's Corner");
    const icon = label.parentElement?.querySelector('svg');
    expect(icon?.getAttribute('class')).toMatch(/text-positive/);
  });

  /** One reading is not a change, and the board says nothing about it. */
  it('says nothing about a number measured once', async () => {
    await withAGain();
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {}, dismissedTips: {} });
    renderAt('/coach', <CoachPage />);
    await screen.findByText('How this works');
    expect(body()).not.toMatch(/improved:/);
  });
});
