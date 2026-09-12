// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { newSession, putSession, type Session } from '@/db/sessions';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { CareerPage } from '@/features/career/CareerPage';

/**
 * The hardest sent at each place (PLAN.md M112f).
 *
 * "Where you climb" listed a name and a day count. Grades vary enormously by
 * crag, which is exactly why an outdoor climber wants the number per place
 * rather than one overall best — and the card had nowhere to read it from,
 * because `Venue` carried no grade at all.
 */

let n = 0;
const at = (place: string, date: string, grades: string[]): Session =>
  newSession(date, n++, {
    completed: true,
    mode: 'outdoor',
    fields: { location: place },
    climbs: grades.map((grade) => ({
      id: `c${n++}`,
      grade,
      scale: grade.startsWith('V') ? ('V' as const) : ('YDS' as const),
      count: 1,
      result: 'send' as const,
    })),
  });

async function career(
  sessions: Session[],
  display?: { boulder: 'V' | 'Font'; route: 'YDS' | 'French' },
): Promise<void> {
  await reset();
  for (const s of sessions) await putSession(s);
  await hydrate();
  // After `hydrate`, never before: it reloads the stores from the database.
  if (display) useSettings.setState({ display } as never);
  renderAt('/career', <CareerPage />);
}

const row = (name: string) => {
  const dt = screen.getByText((_, el) => el?.tagName === 'DT' && (el.textContent ?? '').startsWith(name));
  return within(dt);
};

describe('the venue rows', () => {
  it('shows the hardest sent there', async () => {
    await career([at('Stanage', '2026-09-01', ['V3', 'V6'])]);
    expect(row('Stanage').getByText('V6')).toBeTruthy();
  });

  it('shows both ladders where a place has both', async () => {
    await career([at('Malham', '2026-09-01', ['V4', '5.12a'])]);
    const r = row('Malham');
    expect(r.getByText(/V4/)).toBeTruthy();
    expect(r.getByText(/5\.12a/)).toBeTruthy();
  });

  it('labels a route grade as a route when there is no boulder', async () => {
    // The bug an index-after-filter produces: one grade left, taken as the
    // first, and rendered on the boulder ladder.
    //
    // Asserted in **Font/French**, because the default V/YDS display hides
    // it completely: `displayGrade('V', '5.12a')` returns '5.12a' unchanged,
    // so the wrong scale and the right one print the same string. In
    // Font/French the right call gives 7b and the wrong one still gives
    // 5.12a — a bug only a climber reading French notation would ever see,
    // which is exactly the kind that ships.
    await career([at('Malham', '2026-09-01', ['5.12a'])], { boulder: 'Font', route: 'French' });
    expect(row('Malham').getByText('7b')).toBeTruthy();
  });

  it('keeps the day count', async () => {
    // The grade is added beside the name, not in place of what was there.
    // Scoped to the row: "1 day" also appears in the career milestones above.
    await career([at('Stanage', '2026-09-01', ['V3'])]);
    const dt = screen.getByText(
      (_, el) => el?.tagName === 'DT' && (el.textContent ?? '').startsWith('Stanage'),
    );
    expect(dt.parentElement?.textContent ?? '').toMatch(/1 day/);
  });

  it('says nothing for a place with no sends', async () => {
    const session = at('Stanage', '2026-09-01', ['V8']);
    session.climbs[0]!.result = 'attempt';
    await career([session]);
    expect(row('Stanage').queryByText(/V8/)).toBeNull();
  });
});
