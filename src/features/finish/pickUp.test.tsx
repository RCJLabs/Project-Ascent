// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { getProgram, loadPrograms } from '@/content/programs';
import { blockDay } from '@/engine/blockEnd';
import { blockId, pickUp, type BlockRecord } from '@/engine/blocks';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { planFromLayout } from '@/engine/weekLayouts';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from './FinishPage';

/**
 * The review of a block stopped and resumed (PLAN.md M369).
 *
 * Measured from the moved start, it lost its week-one baseline and read six
 * perfect weeks and a pause as a fraction of the plan. It is one run, and
 * the pause between the stop and the resume is nobody's.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

const text = () => document.body.textContent ?? '';

it('reads the whole run, names the pause, and keeps the baseline', async () => {
  const IG = getProgram('iron_grip')!;
  const plan = planFromLayout(IG.recommendedLayout!);
  const S = addDays(startOfWeek(today()), -14 * 7);
  const D = addDays(S, 41); // the end of week six
  const R = addDays(startOfWeek(today()), -14); // back, two weeks ago
  const stopped: BlockRecord = { id: blockId('iron_grip', S), programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan, endedAt: D, reason: 'stopped' };
  const picked = pickUp(stopped, R)!;

  let done = 0;
  const log = async (start: string, from: string, to: string) => {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const day = plannedDay(IG, start, plan, d);
      if (!day.sessionType || day.isRest) continue;
      await putSession({ ...newSession(d, 0, { completed: true }), programId: 'iron_grip', sessionTypeId: day.sessionType.id } as never);
      done++;
    }
  };
  await log(S, S, D);
  await log(picked.startDate, R, today());
  // Climbing in the pause, which is not this block's.
  await putSession({ ...newSession(addDays(D, 10), 0, { completed: true }), sessionTypeId: 'perf' } as never);
  await putMetricEntry({ metricId: 'dead_hang', date: addDays(S, 2), value: 60 } as never);
  await putMetricEntry({ metricId: 'dead_hang', date: addDays(R, 3), value: 70 } as never);
  await hydrate();
  useProfile.setState({ activeProgramId: 'iron_grip', startDates: { iron_grip: picked.startDate }, plans: { iron_grip: plan }, blocks: [picked] });

  const id = encodeURIComponent(picked.id);
  renderAt(`/finish/${id}`, <FinishPage params={{ id }} />);
  await screen.findByRole('heading', { level: 1 });

  // From the end of week six, fourteen weeks back, to two weeks ago.
  expect(text()).toContain(`It was paused for 6 weeks from ${blockDay(D)}, and those weeks are not counted.`);
  expect(text()).toContain(`You did every session the plan placed — all ${done} of them.`);
  expect(text(), 'the pause was counted as this block').not.toMatch(/the plan did not place/);
  expect(text()).toMatch(/One of the 1 retested number improved/);
  expect(text()).not.toMatch(/Dead Hang\s*not taken/);
});

describe('the block history', () => {
  it('dates a run that was picked up from its first week', async () => {
    const IG = getProgram('iron_grip')!;
    const plan = planFromLayout(IG.recommendedLayout!);
    const S = addDays(startOfWeek(today()), -30 * 7);
    const stopped: BlockRecord = { id: blockId('iron_grip', S), programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan, endedAt: addDays(S, 41), reason: 'stopped' };
    const picked = { ...pickUp(stopped, addDays(S, 12 * 7))!, endedAt: addDays(S, 19 * 7), reason: 'ran-out' as const };
    const other: BlockRecord = { id: blockId('the_cruiser', addDays(S, 20 * 7)), programId: 'the_cruiser', name: 'The Cruiser', startDate: addDays(S, 20 * 7), weeks: 12, endedAt: null };
    await hydrate();
    useProfile.setState({ activeProgramId: 'the_cruiser', startDates: { the_cruiser: other.startDate, iron_grip: picked.startDate }, blocks: [picked, other] });
    renderAt('/finish', <FinishPage />);
    await screen.findByRole('heading', { name: 'Blocks you have run' });
    const month = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const card = screen.getByRole('heading', { name: 'Blocks you have run' }).parentElement!;
    const row = [...card.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Iron Grip'))!;
    expect(row.textContent).toContain(month(S));
    expect(row.textContent, 'dated from where its start was moved to').not.toContain(month(picked.startDate));
  });
});
