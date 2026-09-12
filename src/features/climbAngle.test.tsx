// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getSession, newSession, putSession, type Session } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { ProgressPage } from '@/features/progress/ProgressPage';

/**
 * Style on a climb (PLAN.md M108).
 *
 * The milestone set its own condition: chip creep in the logger, and a test
 * that the default path costs exactly the taps it costs today. That test is
 * `the default path is untouched` below, and it is the one that matters.
 */

const DATE = '2026-01-09';

async function logger() {
  await reset();
  await putSession(newSession(DATE, 0, { completed: false }) as never);
  await hydrate();
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
  await screen.findByText('Climbs');
}

const stored = async () => (await getSession(`${DATE}#0`))?.climbs ?? [];
const entry = () => screen.getByText('Climbs').closest('section')!;

describe('the logger asks, and does not insist', () => {
  /**
   * The caveat, held as a test. Scale and grade are already chosen, so a
   * send is **one tap**: Add. Angle and lead add rows, not taps.
   */
  it('logs a climb in one tap, exactly as before', async () => {
    await logger();
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    const [climb] = await stored();
    expect(climb!.grade).toBe('V3');
    expect(climb!.result).toBe('send');
    // Nothing said is nothing stored.
    expect(climb!.angle).toBeUndefined();
    expect(climb!.ropeStyle).toBeUndefined();
  });

  it('stores the angle when one is tapped', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Steep'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored())[0]?.angle).toBe('overhang'));
  });

  // "I did not say" has to be reachable after "I did", without a fifth
  // chip that exists only to mean nothing.
  it('clears the angle when the same chip is tapped again', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Slab'));
    fireEvent.click(within(entry()).getByText('Slab'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    expect((await stored())[0]!.angle).toBeUndefined();
  });

  // A climber on a spray wall is on it for an hour.
  it('keeps the angle for the next climb', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Roof'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored())[0]!.count).toBe(2));
    expect((await stored())[0]!.angle).toBe('roof');
  });

  // Two V3s on different walls are two rows, or the angle stored is
  // whichever was tapped first.
  it('does not merge two climbs of different angles', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Slab'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    fireEvent.click(within(entry()).getByText('Roof'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(2));
    expect((await stored()).map((c) => c.angle)).toEqual(['slab', 'roof']);
  });
});

describe('lead or top rope, only where there is a rope', () => {
  it('is not asked about a boulder', async () => {
    await logger();
    expect(within(entry()).queryByText('Top rope')).toBeNull();
  });

  it('is asked once the scale is a rope', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Route'));
    await waitFor(() => expect(within(entry()).getByText('Top rope')).toBeTruthy());
  });

  it('stores it', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Route'));
    await waitFor(() => expect(within(entry()).getByText('Lead')).toBeTruthy());
    fireEvent.click(within(entry()).getByText('Lead'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored())[0]?.ropeStyle).toBe('lead'));
  });

  // The same route led and top-roped are two climbs, or the one stored is
  // whichever style was tapped first.
  it('does not merge a lead into a top rope', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Route'));
    await waitFor(() => expect(within(entry()).getByText('Lead')).toBeTruthy());
    fireEvent.click(within(entry()).getByText('Lead'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    fireEvent.click(within(entry()).getByText('Top rope'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(2));
    expect((await stored()).map((c) => c.ropeStyle)).toEqual(['lead', 'toprope']);
  });

  // Picked on a rope, then switched to boulders: a boulder has no lead.
  it('never lands on a boulder', async () => {
    await logger();
    fireEvent.click(within(entry()).getByText('Route'));
    await waitFor(() => expect(within(entry()).getByText('Lead')).toBeTruthy());
    fireEvent.click(within(entry()).getByText('Lead'));
    fireEvent.click(within(entry()).getByText('Boulder'));
    fireEvent.click(within(entry()).getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => expect((await stored()).length).toBe(1));
    expect((await stored())[0]!.ropeStyle).toBeUndefined();
  });
});

describe('what the progress page makes of it', () => {
  const tagged = (grade: string, angle: 'slab' | 'roof', count: number, i: number): Session =>
    newSession(`2026-02-${String(i).padStart(2, '0')}`, 0, {
      completed: true,
      rpe: 7,
      durationMin: 60,
      climbs: [{ id: `c${i}`, grade, scale: 'V', count, result: 'send', angle }],
    });

  async function progress(sessions: Session[]) {
    await reset();
    for (const s of sessions) await putSession(s as never);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('Grade pyramid');
  }

  // The question is new, so most logs answer it nowhere — and a card that
  // says nothing is better than a card that says nothing with a heading.
  it('says nothing at all until climbs carry an angle', async () => {
    await progress([
      newSession('2026-02-01', 0, {
        completed: true,
        rpe: 7,
        durationMin: 60,
        climbs: [{ id: 'x', grade: 'V4', scale: 'V', count: 8, result: 'send' }],
      }),
    ]);
    expect(screen.queryByText('The walls you climb on')).toBeNull();
  });

  it('reads the shape once enough climbs carry one', async () => {
    await progress([tagged('V6', 'roof', 6, 1), tagged('V4', 'slab', 6, 2)]);
    const card = screen.getByText('The walls you climb on').closest('section')!;
    expect(card.textContent).toMatch(/12 of your 12 climbs/);
    expect(card.textContent).toMatch(/2 rungs between them/);
    expect(card.textContent).toMatch(/Roof/);
    expect(card.textContent).toMatch(/Slab/);
  });

  it('calls neither end a weakness', async () => {
    await progress([tagged('V8', 'roof', 8, 1), tagged('V2', 'slab', 8, 2)]);
    const card = screen.getByText('The walls you climb on').closest('section')!;
    expect(card.textContent).not.toMatch(/weak|avoid|should|work on|problem|worst/i);
  });
});
