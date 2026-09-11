// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { YearPage } from '@/features/career/YearPage';
import { today } from '@/engine/dates';

/** The year page can be shown to someone (PLAN.md M68). */

const year = Number(today().slice(0, 4));

describe('the year in review', () => {
  it('offers a share once there is a year to show', async () => {
    await reset();
    await putSession(newSession(`${year}-01-05`, 0, { completed: true }));
    await hydrate();
    renderAt(`/year/${year}`, <YearPage params={{ year: String(year) }} />);
    expect(screen.getByRole('button', { name: /share/i })).toBeTruthy();
  });

  // Nothing logged is nothing to show, and a card of zeroes is worse than
  // no card.
  it('offers nothing when the year is empty', async () => {
    await reset();
    await hydrate();
    renderAt(`/year/${year}`, <YearPage params={{ year: String(year) }} />);
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
  });
});
