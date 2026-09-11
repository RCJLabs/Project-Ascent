// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import { putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { loadTrend } from '@/engine/loadTrend';
import { MAX_RUNWAY_WEEKS, peakPlan } from '@/engine/peak';
import { newObjectiveId, type Objective } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { LoadTrendLine } from '@/ui/charts/LoadTrendLine';
import { hydrate, renderAt, reset } from '@/test/render';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';

/**
 * The runway to a trip (PLAN.md M73).
 *
 * The arithmetic is tested in engine/peak.test.ts. This is about the two
 * things a reader has to be able to tell: which line is what happened and
 * which is what was suggested, and that the app says nothing at all when it
 * has nothing to say it from.
 */

const TODAY = today();

function steady(weeks = 12): Session[] {
  const out: Session[] = [];
  for (let w = 0; w < weeks; w += 1) {
    for (const d of [0, 2, 4]) {
      const date = addDays(TODAY, -(weeks - w) * 7 + d);
      out.push({
        id: `${date}#0`, date, planned: false, completed: true, rewarded: true,
        mode: 'indoor', rpe: 7, durationMin: 90, climbs: [],
        createdAt: date, updatedAt: date,
      } as Session);
    }
  }
  return out;
}

const trip = (weeksOut: number, over: Partial<Objective> = {}): Objective => ({
  id: newObjectiveId(),
  name: 'Font in October',
  kind: 'trip',
  status: 'training',
  targetDate: addDays(TODAY, weeksOut * 7),
  requirements: [],
  createdAt: TODAY,
  updatedAt: TODAY,
  ...over,
});

async function page(objective: Objective, sessions = steady()): Promise<void> {
  await reset();
  for (const session of sessions) await putSession(session);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  useObjectives.setState({ objectives: [objective], hydrated: true });
  renderAt(`/objectives/${objective.id}`, <ObjectiveDetailPage params={{ id: objective.id }} />);
}

describe('the chart tells the two lines apart', () => {
  const sessions = steady();
  const trend = loadTrend({ sessions, to: TODAY, days: 42 });

  it('draws nothing extra when there is no plan', () => {
    const { container } = render(<LoadTrendLine trend={trend} />);
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(0);
  });

  it('draws the plan dashed, and says in the legend that it is a plan', () => {
    const plan = peakPlan({ sessions, target: addDays(TODAY, 28), from: TODAY });
    const { container } = render(<LoadTrendLine trend={trend} plan={plan} />);
    // A reader who cannot tell them apart has been handed a forecast.
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(1);
    expect(screen.getByText(/not what happened/)).toBeTruthy();
  });

  it('marks the weeks that sit under the band on purpose', () => {
    const plan = peakPlan({ sessions, target: addDays(TODAY, 56), from: TODAY });
    const easy = plan.weeks.filter((w) => w.kind === 'taper' || w.kind === 'deload');
    expect(easy.length).toBeGreaterThan(0);
    const { container } = render(<LoadTrendLine trend={trend} plan={plan} />);
    // Hollow rings, so a dip that was the whole point does not read as the
    // plan falling apart at the end.
    expect(container.querySelectorAll('circle.fill-surface')).toHaveLength(easy.length);
  });

  it('names each planned week and its shape for a screen reader', () => {
    const plan = peakPlan({ sessions, target: addDays(TODAY, 28), from: TODAY });
    render(<LoadTrendLine trend={trend} plan={plan} />);
    const rows = screen.getAllByRole('row');
    const text = rows.map((r) => r.textContent ?? '').join('|');
    expect(text).toMatch(/planned, taper/);
    expect(text).toMatch(/planned, build/);
  });

  it('divides the two, so the join is a place and not a guess', () => {
    const plan = peakPlan({ sessions, target: addDays(TODAY, 28), from: TODAY });
    const { container } = render(<LoadTrendLine trend={trend} plan={plan} />);
    const divider = [...container.querySelectorAll('line[stroke-dasharray]')].filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2'),
    );
    expect(divider).toHaveLength(1);
    // And the plan starts from it, not from the left edge.
    const dashed = container.querySelector('path[stroke-dasharray]')!;
    const startsAt = Number(dashed.getAttribute('d')!.match(/^M([\d.]+),/)![1]);
    expect(startsAt).toBeCloseTo(Number(divider[0]!.getAttribute('x1')), 1);
  });
});

describe('the card', () => {
  it('lays the weeks out with what each one asks for', async () => {
    await page(trip(4));
    const table = await screen.findByRole('table', { name: /Target load for each week/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[rows.length - 1]!.textContent).toMatch(/Taper/);
    expect(rows[0]!.textContent).toMatch(/%/);
  });

  it('leads with what the plan asks for, and claims nothing about the trip', async () => {
    await page(trip(6));
    const text = (await screen.findByText(/weeks of work/)).textContent!;
    expect(text).toMatch(/taper into the trip/);
    expect(text).not.toMatch(/ready|send|succeed/i);
  });

  it('withholds the whole thing when the log cannot support a baseline', async () => {
    await page(trip(4), steady(2));
    expect(await screen.findByText(/Three weeks of logged sessions/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: /Target load/ })).toBeNull();
  });

  it('hands a long runway to the finder instead of calling it a peak', async () => {
    await page(trip(MAX_RUNWAY_WEEKS + 2));
    expect(await screen.findByText(/training block, not a peak/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find a program/ })).toBeTruthy();
  });

  it('says nothing at all without a date to plan to', async () => {
    const { targetDate: _dropped, ...dateless } = trip(4);
    await page(dateless as Objective);
    await screen.findByText('What has to be true');
    expect(screen.queryByText('The runway')).toBeNull();
  });

  it('says nothing for an objective already put away', async () => {
    await page(trip(4, { status: 'shelved' }));
    await screen.findByText('What has to be true');
    expect(screen.queryByText('The runway')).toBeNull();
  });

  it('owns up when the runway is too short to hold the fitness', async () => {
    await page(trip(1));
    expect(await screen.findByText(/no time to build/)).toBeTruthy();
    expect(screen.getByText(/cost of a late start/)).toBeTruthy();
  });
});
