// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { YearPage } from '@/features/career/YearPage';

/**
 * Who the year was climbed with (PLAN.md M237).
 *
 * The year page is where the field is read back, next to the trips — a fact
 * about the year and never a score. The last year that finished, so the page
 * is a complete year whatever today happens to be: a fixture dated inside the
 * running year passes or fails depending on the date it is run, which is the
 * bug M229 and M235 both shipped.
 */

const YEAR = Number(today().slice(0, 4)) - 1;

async function year(...days: { date: string; partners?: string[] }[]): Promise<void> {
  await reset();
  for (const [i, day] of days.entries()) {
    await putSession({
      ...newSession(day.date, 0, { completed: true }),
      ...(day.partners === undefined ? {} : { partners: day.partners }),
      climbs: [{ id: `c${i}`, grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    } as never);
  }
  await hydrate();
  renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
  // By role, because once two years are logged the year reads three times on
  // the page — the heading, the picker and the comparison row.
  await screen.findByRole('heading', { level: 1, name: String(YEAR) });
}

const card = () => screen.getByText('Who you climbed with').closest('section')!;

describe('the year’s partners', () => {
  it('counts the sessions each person is on, most first', async () => {
    await year(
      { date: `${YEAR}-03-01`, partners: ['Sam'] },
      { date: `${YEAR}-03-03`, partners: ['Sam', 'Alex'] },
      { date: `${YEAR}-03-05`, partners: ['Sam'] },
    );
    const rows = [...card().querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Sam');
    expect(rows[0]).toContain('3 sessions');
    expect(rows[1]).toContain('Alex');
    expect(rows[1]).toContain('1 session');
    expect(rows[1]).not.toContain('1 sessions');
  });

  /**
   * Coverage, said before anything else is read into the counts above. Three
   * of six named is a partner list for half a year, and a climber who cannot
   * see that would read the other three as sessions climbed alone.
   */
  it('says how much of the year named anybody', async () => {
    await year(
      { date: `${YEAR}-03-01`, partners: ['Sam'] },
      { date: `${YEAR}-03-03`, partners: ['Sam'] },
      { date: `${YEAR}-03-05`, partners: ['Sam'] },
      { date: `${YEAR}-03-07` },
      { date: `${YEAR}-03-09` },
      { date: `${YEAR}-03-11` },
    );
    expect(card().textContent).toContain('Named on 3 of 6 sessions.');
    expect(card().textContent).toContain('not a session climbed alone');
  });

  /** Scoped to the year, the way the trips are. */
  it('leaves last year’s partner in last year', async () => {
    await year(
      { date: `${YEAR}-03-01`, partners: ['Sam'] },
      { date: `${YEAR - 1}-06-01`, partners: ['Alex'] },
    );
    expect(card().textContent).toContain('Sam');
    expect(card().textContent).not.toContain('Alex');
    // "1 of 1 sessions" is not English, and a first-ever partner on a
    // first-ever session is exactly when a climber reads this line.
    expect(card().textContent).toContain('Named on 1 of 1 session.');

    cleanup();
    renderAt(`/year/${YEAR - 1}`, <YearPage params={{ year: String(YEAR - 1) }} />);
    await screen.findByRole('heading', { level: 1, name: String(YEAR - 1) });
    expect(card().textContent).toContain('Alex');
    expect(card().textContent).not.toContain('Sam');
  });

  /**
   * And nothing at all from a year that named nobody, which is every year
   * logged before this milestone existed.
   */
  it('shows no card when the year named nobody', async () => {
    await year({ date: `${YEAR}-03-01` }, { date: `${YEAR}-03-03` });
    expect(screen.queryByText('Who you climbed with')).toBeNull();
    // And the page is otherwise the page, so this is an absent card rather
    // than an absent year.
    expect(screen.getByText('Sessions').parentElement!.textContent).toBe('Sessions2');
  });
});

/**
 * The coverage line, against the number it divides by (PLAN.md M260).
 *
 * `totals.sessions` has excluded rest days since M246; `unsaid` counted
 * them. Forty sessions and twenty rest days read **"Named on −10 of 40
 * sessions"** — a negative, directly under a line whose whole job is to say
 * how much of the log this card can see.
 */
describe('a year with rest days in it', () => {
  async function withRest(): Promise<void> {
    await reset();
    let n = 0;
    for (let i = 0; i < 6; i += 1) {
      const date = `${YEAR}-03-${String(i + 1).padStart(2, '0')}`;
      await putSession({
        ...newSession(date, n++, { completed: true }),
        ...(i < 2 ? { partners: ['Sam'] } : {}),
        climbs: [{ id: `c${i}`, grade: 'V3', scale: 'V', count: 1, result: 'send' }],
      } as never);
    }
    for (let i = 0; i < 9; i += 1) {
      const date = `${YEAR}-04-${String(i + 1).padStart(2, '0')}`;
      await putSession({
        ...newSession(date, n++, { completed: true }),
        restChecklist: {},
      } as never);
    }
    await hydrate();
    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    await screen.findByRole('heading', { level: 1, name: String(YEAR) });
  }

  it('is a fixture with more rest days than named sessions', async () => {
    // Without that, the count cannot go negative and nothing here bites.
    await withRest();
    expect(card().textContent).toContain('of 6 sessions');
  });

  it('counts named and unnamed out of the sessions it says', async () => {
    await withRest();
    // Six climbed, two of them named. Nine rest days belong to neither.
    expect(card().textContent).toContain('Named on 2 of 6 sessions');
    cleanup();
  });

  it('never prints a negative', async () => {
    await withRest();
    expect(card().textContent).not.toMatch(/Named on -/);
    cleanup();
  });

  it('leaves a rest day off the list of people you climbed with', async () => {
    await reset();
    await putSession({
      ...newSession(`${YEAR}-03-01`, 0, { completed: true }),
      partners: ['Alex'],
      climbs: [{ id: 'c0', grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    } as never);
    await putSession({
      ...newSession(`${YEAR}-03-02`, 1, { completed: true }),
      partners: ['Sam'],
      restChecklist: {},
    } as never);
    await hydrate();
    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    await screen.findByRole('heading', { level: 1, name: String(YEAR) });
    expect(card().textContent).toContain('Alex');
    expect(card().textContent).not.toContain('Sam');
  });
});
