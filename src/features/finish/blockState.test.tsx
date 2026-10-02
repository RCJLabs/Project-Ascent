// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { canLoadDemo } from '@/db/demo';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { getProgram, loadPrograms } from '@/content/programs';
import { addDays, formatDate, fromKey, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { testWeeks } from '@/engine/testWeeks';
import { planFromLayout } from '@/engine/weekLayouts';
import type { BlockRecord } from '@/engine/blocks';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { FinishPage } from './FinishPage';

/**
 * The block review says what is true of the block in front of it
 * (PLAN.md M366).
 *
 * M365a rendered *"The retests you owe … Taking them now is what turns the
 * block into a measurement"* on a block that had ended five weeks before —
 * a reading taken then falls outside it — and in week two of twelve,
 * directly under *"The block's test weeks are the ones to take them in"*.
 * And the sentence at the top promised three sections over a custom block
 * that had one, or none.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

const IG = () => getProgram('iron_grip')!;
const text = () => document.body.textContent ?? '';

/** Iron Grip, live, from a Sunday `weeksAgo` weeks back, with a baseline in its first week. */
async function ironGripFrom(weeksAgo: number) {
  const start = addDays(startOfWeek(today()), -weeksAgo * 7);
  await putMetricEntry({ metricId: 'dead_hang', date: addDays(start, 1), value: 40 } as never);
  await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: addDays(start, 1), value: 30 } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: start },
    plans: { iron_grip: planFromLayout(IG().recommendedLayout!) },
  });
  renderAt('/finish', <FinishPage />);
  await screen.findByRole('heading', { level: 1 });
  return start;
}

describe('the retests a block is owed', () => {
  it('are named as never retested once the block is over, without asking for them now', async () => {
    await ironGripFrom(IG().weeks + 2);
    expect(screen.getByRole('heading', { name: 'Never retested' })).toBeTruthy();
    expect(text()).toContain("The block is over, so a reading taken now would be the next block's rather than this one's.");
    expect(text()).not.toMatch(/now is what turns the block into a measurement/);
    expect(text()).toContain(
      'Nothing to compare: two of the 9 Iron Grip assessments have a baseline and no retest, and the block is over.',
    );
    expect(text(), 'pointed at test weeks already behind it').not.toMatch(/test weeks are the ones/);
  });

  it('wait for the next test week while it is still ahead', async () => {
    const start = await ironGripFrom(1); // week two
    const next = testWeeks(IG()).find((t) => t.why !== 'baseline')!.week;
    const from = formatDate(fromKey(addDays(start, (next - 1) * 7)), { weekday: 'long', month: 'short', day: 'numeric' });
    expect(screen.getByRole('heading', { name: 'The retests to come' })).toBeTruthy();
    expect(text()).toContain(`Week ${next} is the next test week, from ${from}. That is when to take them.`);
    expect(text()).not.toMatch(/now is what turns the block into a measurement/);
  });

  it('are asked for now in a test week', async () => {
    const next = testWeeks(IG()).find((t) => t.why !== 'baseline')!.week;
    await ironGripFrom(next - 1);
    expect(screen.getByRole('heading', { name: 'The retests you owe' })).toBeTruthy();
    expect(text()).toContain('This is a test week, so taking them now is what turns the block into a measurement.');
  });
});

describe('what comes next, while the block runs', () => {
  it('is the authored list with nothing said about what the block did so far (PLAN.md M367)', async () => {
    await ironGripFrom(5); // week six of twelve
    const card = screen.getByRole('heading', { name: 'What comes next' }).parentElement!;
    expect(card.textContent).toContain(
      'In the order the program wrote them, each with its author’s reason. Once the block is over, this list is ordered by what it moved.',
    );
    expect(card.textContent).not.toMatch(/left your|went the other way|which did move/);
  });
});

/**
 * The sentence at the top against the cards under it: each phrase is there
 * exactly when its section is.
 */
function promisesMatchSections() {
  const opening = [...document.querySelectorAll('p')]
    .map((p) => p.textContent ?? '')
    .find((t) => /ran out|You left|has no record of how it ended/.test(t))!;
  expect(opening, 'no opening sentence found').toBeTruthy();
  const has = (name: string) => screen.queryByRole('heading', { name }) !== null;
  expect(opening.includes('which of its sessions happened'), opening).toBe(has('Did you do the work?'));
  expect(opening.includes('which of the numbers moved'), opening).toBe(has('What moved') || has('What you were lifting'));
  expect(opening.includes('what it has written down about what comes next'), opening).toBe(has('What comes next'));
  return opening;
}

describe('the sentence at the top', () => {
  async function sample() {
    await waitFor(async () => {
      await reset();
      expect(await canLoadDemo()).toBe(true);
    });
    await hydrate();
    renderAt('/settings', <SettingsPage />);
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy(), { timeout: 10000 });
    cleanup();
    await hydrate();
    return useProfile.getState().blocks.find((b) => b.programId !== 'iron_grip')!;
  }
  async function open(row: BlockRecord) {
    const id = encodeURIComponent(row.id);
    renderAt(`/finish/${id}`, <FinishPage params={{ id }} />);
    await screen.findByRole('heading', { level: 1 });
  }

  it("promises nothing over the sample's custom block, which shows none of the three", async () => {
    const custom = await sample();
    await open(custom);
    expect(promisesMatchSections()).not.toMatch(/Below is/);
  });

  it('promises the sessions alone when they are all a custom block has', async () => {
    const custom = await sample();
    const program = getProgram(custom.programId)!;
    const type = program.sessionTypes.find((t) => !t.isRest)!.id;
    useProfile.setState({
      blocks: useProfile.getState().blocks.map((b) => (b.id === custom.id ? { ...b, plan: { 1: type, 3: type } } : b)),
    });
    await open(custom);
    expect(promisesMatchSections()).toMatch(/Below is which of its sessions happened\.$/);
  });

  it('promises the numbers when the lines lifted are all the numbers there are', async () => {
    const custom = await sample();
    // A custom block has no benchmarks, so its numbers are the lines lifted.
    // Index 5, so the sample's own sessions on these days are left alone.
    for (const [days, load] of [[7, 10], [14, 15]] as const) {
      await putSession({ ...newSession(addDays(custom.startDate, days), 5, { completed: true }), exercises: [{ name: 'Max Hangs', load }] } as never);
    }
    await hydrate();
    useProfile.setState({ blocks: useProfile.getState().blocks });
    await open(useProfile.getState().blocks.find((b) => b.id === custom.id)!);
    expect(screen.getByRole('heading', { name: 'What you were lifting' })).toBeTruthy();
    expect(promisesMatchSections()).toContain('which of the numbers moved');
  });

  it('promises all three over a block that has all three', async () => {
    const start = addDays(startOfWeek(today()), -(IG().weeks + 2) * 7);
    const plan = planFromLayout(IG().recommendedLayout!);
    for (let d = start; d < addDays(start, IG().weeks * 7); d = addDays(d, 1)) {
      const day = plannedDay(IG(), start, plan, d);
      if (day.sessionType && !day.isRest) await putSession({ ...newSession(d, 0, { completed: true }), programId: 'iron_grip', sessionTypeId: day.sessionType.id } as never);
    }
    await putMetricEntry({ metricId: 'dead_hang', date: addDays(start, 1), value: 40 } as never);
    await putMetricEntry({ metricId: 'dead_hang', date: addDays(start, IG().weeks * 7 - 3), value: 50 } as never);
    await hydrate();
    const row: BlockRecord = { id: `iron_grip#${start}`, programId: 'iron_grip', name: 'Iron Grip', startDate: start, weeks: 12, plan, endedAt: null };
    useProfile.setState({ activeProgramId: 'iron_grip', startDates: { iron_grip: start }, plans: { iron_grip: plan }, blocks: [row] });
    await open(row);
    expect(promisesMatchSections()).toMatch(
      /Below is which of its sessions happened, which of the numbers moved, and what it has written down about what comes next\.$/,
    );
  });
});
