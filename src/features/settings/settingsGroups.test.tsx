// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { getTheme, THEMES } from '@/ui/themes';
import { SettingsPage } from './SettingsPage';

/**
 * Settings in four groups (PLAN.md M122).
 *
 * Fourteen cards in one column became four stretches with a heading each,
 * the palette went into a sheet, the Reference card went, and the calendar
 * export came in under Data. What is checked is the shape: which heading
 * each card sits under, and that nothing a card used to do is lost.
 */

async function open(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/settings', <SettingsPage />);
  await screen.findByText('Your data');
}

/** Card titles in page order, with the group heading each falls under. */
function grouped(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let group = '';
  for (const h of document.querySelectorAll('h2')) {
    const text = h.textContent?.trim() ?? '';
    if (['Appearance', 'Training', 'Data', 'About'].includes(text) && h.className.includes('pt-2')) {
      group = text;
      out[group] = [];
      continue;
    }
    if (group) out[group]!.push(text);
  }
  return out;
}

describe('the four groups', () => {
  it('put every card under the heading it belongs to', async () => {
    await open();
    const g = grouped();
    expect(Object.keys(g)).toEqual(['Appearance', 'Training', 'Data', 'About']);
    expect(g.Appearance).toEqual(['Appearance']);
    expect(g.Training).toEqual(['Grades', 'Weight & height', 'What you can train on', 'Session templates']);
    expect(g.Data).toContain('Your data');
    expect(g.Data).toContain('Start over');
    expect(g.Data).toContain('Storage');
    expect(g.About).toEqual(['About']);
  });

  it('folded sound into appearance rather than losing it', async () => {
    await open();
    const card = screen.getByText('Sound & haptics').closest('section')!;
    expect(within(card).getByRole('heading', { name: 'Appearance' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Off' }));
    expect(useSettings.getState().cues).toBe(false);
  });

  /**
   * Drills left this row in M152: the app's own guide has always called
   * them *"the library under Train"*, and a drill is prescribed by a
   * program and put on today's session, which is training rather than
   * documentation. The manual stayed.
   */
  it('dropped the Reference card and kept the manual on About', async () => {
    await open();
    expect(screen.queryByText('Reference')).toBeNull();
    const about = screen.getByText('About', { selector: 'h2:not(.pt-2)' }).closest('section')!;
    expect(within(about).queryByRole('link', { name: 'Drills' })).toBeNull();
    for (const [name, href] of [['Guides', '#/guides'], ['Glossary', '#/glossary']]) {
      expect(within(about).getByRole('link', { name: name! }).getAttribute('href')).toBe(href);
    }
  });
});

describe('the palette sheet', () => {
  it('names the palette in use and opens the sheet on request', async () => {
    await open();
    const current = getTheme(useSettings.getState().themeId).name;
    const button = screen.getByRole('button', { name: new RegExp(`^${current}`) });
    expect(screen.queryByRole('dialog', { name: 'Palette' })).toBeNull();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Palette' });
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThanOrEqual(THEMES.length);
  });

  it('applies a pick at once and closes on Escape', async () => {
    await open();
    const current = useSettings.getState().themeId;
    const other = THEMES.find((t) => t.id !== current)!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${getTheme(current).name}`) }));
    const dialog = await screen.findByRole('dialog', { name: 'Palette' });
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${other.name}:`) }));
    expect(useSettings.getState().themeId).toBe(other.id);
    // Still open, so the next can be compared.
    expect(screen.getByRole('dialog', { name: 'Palette' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Palette' })).toBeNull();
    // The row now names the new one.
    expect(screen.getByRole('button', { name: new RegExp(`^${other.name}`) })).toBeTruthy();
    useSettings.getState().setThemeId(current);
  });
});

describe('the calendar export', () => {
  it('is under Data while a program runs, and absent otherwise', async () => {
    await open();
    expect(screen.queryByText('Put it in your calendar')).toBeNull();
    const program = getProgram('iron_grip')!;
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: addDays(today(), -7) },
      plans: { [program.id]: { [dayOfWeek(today())]: program.sessionTypes[0]!.id } },
      weekOverrides: {},
      adaptations: {},
    });
    await screen.findByText('Put it in your calendar');
    expect(grouped().Data).toContain('Put it in your calendar');
  });

  it('is absent for a program that is active but has no plan yet', async () => {
    // Half a block — an id with no start date and no plan — has nothing to
    // schedule, and a card saying "nothing left to export" would be
    // reading an empty plan as a finished one.
    await open();
    useProfile.setState({ activeProgramId: 'iron_grip', startDates: {}, plans: {}, weekOverrides: {}, adaptations: {} });
    // Retried until it is true, rather than asked once a tick later
    // (PLAN.md M304): the card is on screen when this runs, so a single
    // read before React has re-rendered finds it and fails.
    await waitFor(() => expect(screen.queryByText('Put it in your calendar')).toBeNull());
    expect(screen.queryByText(/Nothing left in this program/)).toBeNull();
  });
});
