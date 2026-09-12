// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { newSession, putSession, type Climb, type Session } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from '@/features/progress/ProgressPage';

/**
 * Two ladders, on the page that draws grades (PLAN.md M106).
 *
 * `progress.ts` never mentioned `mode`, so the pyramid on this page has
 * always mixed plastic and rock into one shape.
 */

const climb = (grade: string): Climb => ({
  id: `c-${grade}-${Math.random()}`,
  grade,
  scale: 'V',
  count: 1,
  result: 'send',
});

const run = (grade: string, n: number, mode: 'indoor' | 'outdoor', from: number): Session[] =>
  Array.from({ length: n }, (_, i) =>
    newSession(`2026-01-${String(from + i).padStart(2, '0')}`, 0, {
      completed: true,
      mode,
      rpe: 7,
      durationMin: 60,
      climbs: [climb(grade)],
    }),
  );

async function page(sessions: Session[]) {
  await reset();
  for (const s of sessions) await putSession(s as never);
  await hydrate();
  renderAt('/progress', <ProgressPage />);
  await screen.findByText('Grade pyramid');
}

const card = () => screen.getByText('Grade pyramid').closest('section')!;

describe('the pyramid knows which ladder it is drawing', () => {
  // Three buttons where two do the same thing is not a choice.
  it('offers no toggle to a climber who has never been outside', async () => {
    await page(run('V4', 6, 'indoor', 1));
    expect(within(card()).queryByText('On rock')).toBeNull();
  });

  it('offers it once there is something on rock', async () => {
    await page([...run('V6', 6, 'indoor', 1), ...run('V4', 6, 'outdoor', 10)]);
    expect(within(card()).getByText('On rock')).toBeTruthy();
    expect(within(card()).getByText('Indoors')).toBeTruthy();
    expect(within(card()).getByText('Everything')).toBeTruthy();
  });

  it('states both bests and what each rests on', async () => {
    await page([...run('V6', 6, 'indoor', 1), ...run('V4', 6, 'outdoor', 10)]);
    expect(card().textContent).toMatch(/V6 indoors from 6 sends/);
    expect(card().textContent).toMatch(/V4 on rock from 6 sends/);
    expect(card().textContent).toMatch(/2 rungs apart, harder indoors/);
  });

  /** The milestone's "Never", on the screen rather than in the engine. */
  it('never converts one into the other, and never calls it a problem', async () => {
    await page([...run('V8', 6, 'indoor', 1), ...run('V3', 6, 'outdoor', 10)]);
    expect(card().textContent).not.toMatch(/equivalent|worth|weak|soft|sandbag|should|problem/i);
  });

  it('draws a different pyramid for each ladder', async () => {
    await page([...run('V6', 6, 'indoor', 1), ...run('V4', 6, 'outdoor', 10)]);
    const all = card().textContent!;
    expect(all).toMatch(/V6/);

    fireEvent.click(within(card()).getByText('On rock'));
    await waitFor(() => expect(within(card()).getByText('On rock').getAttribute('aria-pressed')).toBe('true'));
    // The hardest rock send is V4, so V6 is no longer in the shape.
    const bars = card().querySelector('figure, svg')?.textContent ?? card().textContent!;
    expect(bars).not.toMatch(/V6/);
  });

  it('says which ladder is empty rather than that nothing was logged', async () => {
    await page(run('V4', 6, 'outdoor', 1));
    fireEvent.click(within(card()).getByText('Indoors'));
    await waitFor(() =>
      expect(within(card()).getByText('Nothing logged indoors on this scale yet.')).toBeTruthy(),
    );
  });

  /**
   * The toggle appears only where there is rock on the scale being drawn,
   * so changing scale can take it away while a choice is still in effect —
   * which left the climber looking at an empty pyramid with no control on
   * screen to get out of it. What is not offered is not applied.
   */
  it('stops applying a choice it has stopped offering', async () => {
    // Boulders both ways; ropes indoors only. So the toggle belongs on the
    // V ladder and not on the YDS one, and the YDS ladder has something to
    // draw — which is what makes the two behaviours tell apart.
    const ropes = run('V4', 3, 'indoor', 20).map((s) => ({
      ...s,
      climbs: [{ id: `r${s.date}`, grade: '5.11a', scale: 'YDS' as const, count: 1, result: 'send' as const }],
    }));
    await page([...run('V6', 6, 'indoor', 1), ...run('V4', 6, 'outdoor', 10), ...ropes]);

    fireEvent.click(within(card()).getByText('On rock'));
    await waitFor(() => expect(within(card()).getByText('On rock').getAttribute('aria-pressed')).toBe('true'));

    // Over to the rope ladder, where this climber has nothing on rock.
    fireEvent.click(screen.getByRole('button', { name: 'Routes' }));
    await waitFor(() => expect(within(card()).queryByText('On rock')).toBeNull());
    // Everything, not the outdoor choice that is no longer on screen.
    expect(card().textContent).not.toMatch(/Nothing logged/);
    expect(card().textContent).toMatch(/5\.11a/);
  });
});
