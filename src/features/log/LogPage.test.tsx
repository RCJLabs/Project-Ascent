// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { newSession } from '@/db/sessions';
import { putSession } from '@/db/sessions';
import { LogPage } from './LogPage';
import { hydrate, renderAt } from '@/test/render';

/**
 * The day the URL names is the day you get (PLAN.md M42, M43).
 *
 * `/log/2026-13-45` rendered "Sunday, February 14" and `/log/nope` rendered
 * "Invalid Date" as its heading, because the parameter went to
 * `new Date(y, m - 1, d)` unchecked. `dates.test.ts` proves `isDateKey`
 * rejects those strings; only mounting the page proves the page asks it.
 */
describe('the log page', () => {
  const heading = async (date: string) => {
    await hydrate();
    const view = renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    return (await view.findByRole('heading', { level: 1 })).textContent;
  };

  it('refuses a parameter that is not a date', async () => {
    expect(await heading('nope')).toBe('Not a valid link');
  });

  it('refuses an overflow rather than rolling it into another month', async () => {
    // The dangerous one: this rendered a real, wrong day with nothing to
    // say the URL had been reinterpreted.
    expect(await heading('2026-13-45')).toBe('Not a valid link');
    expect(await heading('2026-02-30')).toBe('Not a valid link');
  });

  it('refuses a second spelling of a real day', async () => {
    // `2026-9-1` is a real day and still wrong: logging from it wrote a row
    // keyed `2026-9-1` that `/log/2026-09-01` could never find.
    expect(await heading('2026-9-1')).toBe('Not a valid link');
  });

  it('shows the day the URL names', async () => {
    expect(await heading('2026-09-10')).toMatch(/September 10/);
  });

  it('shows a session logged on that day', async () => {
    // The whole point of the screen, and nothing asserted it end to end.
    await putSession({
      ...newSession('2026-03-04', 0),
      completed: true,
      climbs: [{ id: 'c1', grade: 'V5', scale: 'V', count: 2, result: 'send' }],
    });
    await hydrate();
    const view = renderAt('/log/2026-03-04', <LogPage params={{ date: '2026-03-04' }} />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').toMatch(/V5/);
  });
});
