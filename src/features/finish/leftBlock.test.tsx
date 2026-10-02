// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession, type Session } from '@/db/sessions';
import { getProgram, loadPrograms } from '@/content/programs';
import { addDays, formatDate, fromKey, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { planFromLayout } from '@/engine/weekLayouts';
import type { BlockRecord } from '@/engine/blocks';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from './FinishPage';

/**
 * The review of a block the climber left (PLAN.md M365).
 *
 * M365a rendered this page for a climber who ran Iron Grip to the letter
 * for six weeks and then left, and it said *"36 of 48 sessions the plan
 * placed"*, counted Peak Performance's sessions as Iron Grip's, and
 * reported Peak Performance's baselines as Iron Grip's retests — *"while
 * you were on it"*. These render the same climbers and read the page.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

const IG = () => getProgram('iron_grip')!;

/** Every session a plan placed between two days, logged as placed. */
async function logAsPlanned(programId: string, start: string, from: string, to: string, patch: (date: string) => Partial<Session> = () => ({})) {
  const program = getProgram(programId)!;
  const plan = planFromLayout(program.recommendedLayout!);
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = plannedDay(program, start, plan, d);
    if (!day.sessionType || day.isRest) continue;
    await putSession({ ...newSession(d, 0, { completed: true, rpe: 7 }), programId, sessionTypeId: day.sessionType.id, ...patch(d) } as never);
    n++;
  }
  return n;
}

/**
 * Iron Grip from a Sunday `weeksAgo` weeks back, run as planned for six
 * weeks and left — for `next`, or stopped when there is none.
 */
async function leftInWeekSix(weeksAgo: number, next: string | null, patch?: (date: string) => Partial<Session>) {
  const start = addDays(startOfWeek(today()), -weeksAgo * 7);
  const left = addDays(start, 41);
  const done = await logAsPlanned('iron_grip', start, start, left, patch);
  const igPlan = planFromLayout(IG().recommendedLayout!);
  const blocks: BlockRecord[] = [
    { id: `iron_grip#${start}`, programId: 'iron_grip', name: 'Iron Grip', startDate: start, weeks: 12, plan: igPlan, endedAt: left, reason: next ? 'switched' : 'stopped' },
  ];
  await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: addDays(start, 2), value: 40 } as never);
  await putMetricEntry({ metricId: 'weighted_pullup_3rm', date: addDays(start, 2), value: 30 } as never);
  if (next) {
    const nextStart = addDays(left, 1);
    const program = getProgram(next)!;
    const plan = planFromLayout(program.recommendedLayout!);
    await logAsPlanned(next, nextStart, nextStart, today(), patch);
    // The next block's baselines, in its first week.
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: addDays(nextStart, 2), value: 48 } as never);
    await putMetricEntry({ metricId: 'weighted_pullup_3rm', date: addDays(nextStart, 2), value: 25 } as never);
    blocks.push({ id: `${next}#${nextStart}`, programId: next, name: program.name, startDate: nextStart, weeks: 12, plan, endedAt: null });
    useProfile.setState({ activeProgramId: next, startDates: { iron_grip: start, [next]: nextStart }, plans: { iron_grip: igPlan, [next]: plan } });
  } else {
    useProfile.setState({ activeProgramId: null, startDates: { iron_grip: start }, plans: { iron_grip: igPlan } });
  }
  await hydrate();
  useProfile.setState({ blocks });
  const id = encodeURIComponent(blocks[0]!.id);
  renderAt(`/finish/${id}`, <FinishPage params={{ id }} />);
  await screen.findByRole('heading', { level: 1 });
  return { start, left, done };
}

const text = () => document.body.textContent ?? '';

describe('the review of a block left in week six', () => {
  it('counts the sessions of the weeks the climber was on it', async () => {
    const { done } = await leftInWeekSix(20, 'peak_performance');
    expect(done).toBe(24);
    expect(text()).toContain(`You did every session the plan placed — all ${done} of them.`);
    expect(text(), "the next block's sessions were counted here").not.toMatch(/the plan did not place/);
  });

  it("does not report the next block's baselines as its retests", async () => {
    await leftInWeekSix(20, 'peak_performance');
    expect(text()).not.toMatch(/retested numbers? improved|went the other way/);
    // Owed, and over: the card says so rather than asking for them now
    // (PLAN.md M366).
    expect(screen.getByRole('heading', { name: 'Never retested' })).toBeTruthy();
  });

  it('counts the same for a climber who stopped rather than switched', async () => {
    await leftInWeekSix(20, null);
    expect(text()).toContain('You did every session the plan placed — all 24 of them.');
  });

  it("reads the lines lifted in its own weeks, not the next block's", async () => {
    const week = (date: string, start: string) => Math.floor((Date.parse(date) - Date.parse(start)) / 604_800_000) + 1;
    let start = '';
    const loadOn = (date: string) => {
      start ||= date;
      const w = week(date, start);
      // 20 and 25 under Iron Grip; 40 under the next program, after leaving.
      const load = w <= 3 ? 20 : w <= 6 ? 25 : 40;
      return { exercises: [{ name: 'Max Hangs', load }] } as Partial<Session>;
    };
    await leftInWeekSix(20, 'peak_performance', loadOn);
    const lifting = screen.getByRole('heading', { name: 'What you were lifting' }).closest('section, div')!.parentElement!;
    expect(lifting.textContent).toMatch(/\+25 lbs/);
    expect(lifting.textContent, "the next block's load was read as this block's").not.toMatch(/\+40 lbs/);
  });

  it("reads where it drifted from its own weeks, not the next block's", async () => {
    // Sessions with a length and an effort, so each week has a load and the
    // deload weeks can be read. Iron Grip deloads in weeks 4 and 8, and the
    // card names the worst. The climber left after week 6, so week 8 was the
    // next program's — made far heavier here, so that read as this block's
    // it would be the worst by a distance.
    let start = '';
    const heavierAfterSix = (date: string) => {
      start ||= date;
      const after = Date.parse(date) - Date.parse(start) > 42 * 86_400_000;
      return { durationMin: after ? 400 : 90, rpe: 8 } as Partial<Session>;
    };
    await leftInWeekSix(20, 'peak_performance', heavierAfterSix);
    const drift = screen.getByRole('heading', { name: 'Where it drifted from the plan' }).parentElement!;
    expect(drift.textContent).toMatch(/Week 4/);
    expect(drift.textContent, 'a week after the climber left was read as this block').not.toMatch(/Week 8/);
  });

  it('is headed by the day it was left, and says so, while its weeks are still on the calendar', async () => {
    // Left two weeks ago, in week six of twelve: by the calendar alone the
    // block still has four weeks to run.
    const { left } = await leftInWeekSix(8, 'peak_performance');
    const when = formatDate(fromKey(left), { day: 'numeric', month: 'short', year: 'numeric' });
    expect(text()).toContain(`Ran to ${when}`);
    expect(text()).toContain('You left Iron Grip after 6 of its 12 weeks.');
    expect(text(), 'a block left was described as still running').not.toMatch(/[Rr]uns to/);
  });
});
