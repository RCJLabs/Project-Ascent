// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getSession, listSessions, newSession, putSession } from '@/db/sessions';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';

/**
 * Bringing a spreadsheet in, from the screen (PLAN.md M105).
 *
 * The engine is covered in `importCsv.test.ts`. What is here is the part a
 * pure test cannot see: that the preview moves when the mapping is
 * corrected, that a wrong guess costs nothing, and that the import writes
 * what the preview promised.
 */

// Three good rows carrying four climbs, over two days, plus one the app
// cannot read — so every number in the preview is a different number.
const FILE = [
  'Date,Grade,Tick Type,Qty,Crag,Partner',
  '2026-01-09,V4,send,2,The Works,Sam',
  '2026-01-09,V5,attempt,1,The Works,Sam',
  '2026-01-11,V6,flash,1,Malham,',
  'nope,V3,send,1,Malham,',
].join('\n');

/** Hand the page a file, without assuming it produces a card. */
async function choose(text: string, existing: readonly string[] = []) {
  await reset();
  for (const date of existing) {
    await putSession(
      newSession(date, 0, {
        completed: true,
        climbs: [{ id: `own-${date}`, grade: 'V2', scale: 'V', count: 1, result: 'send' }],
      }) as never,
    );
  }
  await hydrate();
  renderAt('/settings', <SettingsPage />);
  const input = document.querySelector('input[type="file"][accept*="csv"]') as HTMLInputElement;
  const file = new File([text], 'my-climbing.csv', { type: 'text/csv' });
  // jsdom's File has no `.text()` in every version; the page awaits it.
  Object.defineProperty(file, 'text', { value: async () => text });
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
}

/** The card, driven the way the page drives it. */
async function pick(text = FILE, existing: readonly string[] = []) {
  await choose(text, existing);
  await screen.findByText('Import this spreadsheet?');
}

/** The preview card's own text, since the counts are split across spans. */
const card = () => screen.getByText('Import this spreadsheet?').closest('section')!;

const column = (header: string) =>
  screen.getByLabelText(`What is in "${header}"?`) as HTMLSelectElement;

describe('reading a spreadsheet on screen', () => {
  it('guesses the columns and says what it found', async () => {
    await pick();
    expect(column('Date').value).toBe('date');
    expect(column('Grade').value).toBe('grade');
    expect(column('Tick Type').value).toBe('result');
    expect(column('Qty').value).toBe('count');
    expect(column('Crag').value).toBe('place');
    // A column it does not know is not guessed at.
    expect(column('Partner').value).toBe('skip');
  });

  it('counts days and climbs rather than rows', async () => {
    await pick();
    // Three rows, four climbs, two days: no two of those numbers are the
    // same, so a preview that counted the wrong thing would say so.
    expect(card().textContent).toMatch(/2 days would arrive, carrying 4 climbs/);
  });

  // "412 imported, 9 skipped" is a number nobody can act on.
  it('names a refused row by its line and its reason', async () => {
    await pick();
    expect(screen.getByText(/1 row cannot be read/)).toBeTruthy();
    expect(screen.getByText(/No date the app can read in "nope"/)).toBeTruthy();
    expect(screen.getByText(/Line 5:/)).toBeTruthy();
  });

  /** The preview is the confirmation step, which is what makes a wrong
   *  guess free: correct the column and the numbers move. */
  it('moves the numbers when the mapping is corrected', async () => {
    await pick();
    fireEvent.change(column('Grade'), { target: { value: 'skip' } });
    await waitFor(() => expect(screen.getByText(/rows cannot be read/)).toBeTruthy());
    expect(screen.getByText(/Nothing can be read without a grade column/)).toBeTruthy();
  });

  // Two columns claiming one meaning makes the second unreachable.
  it('moves a meaning rather than duplicating it', async () => {
    await pick();
    fireEvent.change(column('Partner'), { target: { value: 'place' } });
    await waitFor(() => expect(column('Crag').value).toBe('skip'));
    expect(column('Partner').value).toBe('place');
  });

  it('will not import with nothing to import', async () => {
    await pick('Date,Grade\nnope,V4');
    const button = screen.getByRole('button', { name: /^Import 0 days$/ });
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});

describe('the grade that reads as two', () => {
  const FONT = 'Date,Grade\n2026-01-09,7c\n2026-01-10,6A';

  it('asks which, rather than guessing', async () => {
    await pick(FONT);
    expect(screen.getByText('Are these boulders or routes?')).toBeTruthy();
    expect(screen.getByText(/7c is a V9 boulder and a 5.12c route/)).toBeTruthy();
  });

  it('does not ask when every grade says its own scale', async () => {
    await pick();
    expect(screen.queryByText('Are these boulders or routes?')).toBeNull();
  });

  // The file already answered it, on every row, and better than one chip
  // could: a log can hold both.
  it('does not ask when the file has a discipline column', async () => {
    await pick('Date,Grade,Type\n2026-01-09,7c,boulder\n2026-01-10,7c,route');
    expect(screen.queryByText('Are these boulders or routes?')).toBeNull();
    expect(card().textContent).toMatch(/2 days would arrive/);
  });

  it('reads the file once the answer is given', async () => {
    await pick(FONT);
    expect(screen.getByText(/2 rows cannot be read/)).toBeTruthy();
    fireEvent.click(within(card()).getByText('Boulders'));
    await waitFor(() => expect(card().textContent).toMatch(/2 days would arrive/));
    expect(screen.queryByText(/rows cannot be read/)).toBeNull();
  });
});

describe('what actually lands in the log', () => {
  it('writes the days the preview promised', async () => {
    await pick();
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
    await waitFor(async () => expect((await listSessions()).length).toBe(2));
    const day = await getSession('2026-01-09#0');
    expect(day?.climbs.map((c) => c.grade)).toEqual(['V4', 'V5']);
    expect(day?.fields?.location).toBe('The Works');
    expect(day?.imported).toBe('csv');
    expect(day?.rewarded).toBe(true);
  });

  /**
   * Written is not shown. Without the re-hydration the rows are in the
   * database and the calendar, the home page and every derived number go
   * on saying the climber has no history until the app is reloaded.
   */
  it('puts them in front of the climber, not only in the database', async () => {
    await pick();
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
    await waitFor(() => {
      const days = useSessions.getState().byDate;
      expect(Object.keys(days).sort()).toEqual(['2026-01-09', '2026-01-11']);
    });
  });

  it('offers the way back', async () => {
    await pick();
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
    expect(await screen.findByText(/2 days imported\. You can undo this below\./)).toBeTruthy();
  });

  /**
   * An import is a merge, and a session's key is `${date}#${index}`.
   * A climber who logged the 9th in the app and also has the 9th in their
   * spreadsheet must end up with both — losing the logged one would be data
   * loss inside the operation that promises not to lose any.
   */
  describe('over a log that already has something in it', () => {
    const own = ['2026-01-09'];

    it('keeps the session that was already there', async () => {
      await pick(FILE, own);
      fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
      await waitFor(async () => expect((await listSessions()).length).toBe(3));
      const logged = await getSession('2026-01-09#0');
      expect(logged?.climbs.map((c) => c.grade)).toEqual(['V2']);
      expect(logged?.imported).toBeUndefined();
    });

    it('puts the imported day beside it rather than on it', async () => {
      await pick(FILE, own);
      fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
      await waitFor(async () => expect(await getSession('2026-01-09#1')).toBeTruthy());
      const arrived = await getSession('2026-01-09#1');
      expect(arrived?.climbs.map((c) => c.grade)).toEqual(['V4', 'V5']);
      expect(arrived?.imported).toBe('csv');
    });

    // The same restore point the backup import takes, for the same reason.
    it('offers the way back, as a card and not only a sentence', async () => {
      await pick(FILE, own);
      fireEvent.click(screen.getByRole('button', { name: /^Import 2 days$/ }));
      expect(await screen.findByRole('button', { name: /Undo/i })).toBeTruthy();
    });
  });

  it('says so when the file has a header and nothing under it', async () => {
    await choose('Date,Grade');
    expect(await screen.findByText('That file has a header and no rows under it.')).toBeTruthy();
    expect(screen.queryByText('Import this spreadsheet?')).toBeNull();
  });

  it('says what is wrong with a file it cannot parse at all', async () => {
    await choose('a,b\n"never closed');
    expect(await screen.findByText(/never closed/)).toBeTruthy();
  });
});
