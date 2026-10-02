// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getDb, resetDbForTests } from '@/db/db';
import { buildBlockFile, type BlockFile } from '@/engine/blockFile';
import type { BlockReport } from '@/engine/blockReport';
import { setLaunchFile } from '@/lib/launchFile';
import { useSessions } from '@/store/sessions';
import { useMetrics } from '@/store/metrics';
import { renderAt, reset } from '@/test/render';
import { SharedBlockPage } from './SharedBlockPage';

/**
 * Somebody else's block, read and kept nowhere (PLAN.md M292).
 *
 * The engine half is `engine/blockFile.test.ts`. What is left for here is
 * the half that is the whole point: the app has two importers and both of
 * them merge into the climber's own records, and this one must not.
 */

function file(over: Partial<BlockReport> = {}): BlockFile {
  return buildBlockFile({
    report: {
      program: { id: 'iron_grip', name: 'Iron Grip', weeks: 12 } as BlockReport['program'],
      from: '2026-06-07',
      to: '2026-08-29',
      through: '2026-08-29',
      finished: true,
      tests: [],
      results: [
        {
          metric: { id: 'max_hang_20mm_7s', label: 'Max Hang 20mm 7s' } as never,
          points: [],
          baseline: { metricId: 'max_hang_20mm_7s', date: '2026-06-08', value: 12 },
          latest: { metricId: 'max_hang_20mm_7s', date: '2026-08-24', value: 15 },
          moved: 'better',
          percent: 25,
          steps: null,
          gap: null,
        },
        {
          metric: { id: 'max_boulder_grade', label: 'Max Boulder Grade' } as never,
          points: [],
          baseline: { metricId: 'max_boulder_grade', date: '2026-06-08', value: 5 },
          latest: { metricId: 'max_boulder_grade', date: '2026-08-24', value: 6 },
          moved: 'better',
          // A grade is ordinal, so it moves in steps and has no percentage —
          // `blockReport.ts` gives four reasons for that rule, and this is the
          // row that holds the page to it.
          percent: null,
          steps: 1,
          gap: null,
        },
        {
          metric: { id: 'pull_ups_max', label: 'Max Pull-Ups' } as never,
          points: [],
          baseline: null,
          latest: null,
          moved: null,
          percent: null,
          steps: null,
          gap: 'never-tested',
        },
      ],
      comparable: [],
      better: 2,
      worse: 0,
      flat: 0,
      untested: 1,
      ...over,
    } as BlockReport,
    outcome: 'completed',
    weeksRun: 12,
    sessions: 30,
    planned: 36,
    summary: 'Two of three improved; one was never tested.',
  });
}

const asFile = (body: unknown) =>
  new File([JSON.stringify(body)], 'theirs.ascent-block.json', { type: 'application/json' });

async function open(body: unknown = file()): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  setLaunchFile(asFile(body));
  renderAt('/shared', <SharedBlockPage />);
  await screen.findByText('Iron Grip');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a block somebody sent you', () => {
  it('opens the file the app was launched with', async () => {
    await open();
    expect(screen.getByText(/12 weeks · ran to the end/)).toBeTruthy();
  });

  it('reads the numbers in the metric’s own unit', async () => {
    await open();
    expect(screen.getByText('Max Hang 20mm 7s')).toBeTruthy();
    expect(screen.getByText(/12 → 15 · \+25%/)).toBeTruthy();
  });

  /**
   * And a grade in steps, never a percentage. V5 to V6 is one rung on a
   * ladder; *"+20%"* is a number about nothing.
   */
  it('moves a grade in steps rather than in percent', async () => {
    await open();
    expect(screen.getByText('Max Boulder Grade')).toBeTruthy();
    expect(screen.getByText(/5 → 6 · \+1 step/)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('+20%');
  });

  /**
   * `describeBlock`'s rule, one screen over: *"a report that names three
   * improvements and stays quiet about four untested metrics is a highlight
   * reel."* So untested is a number beside the rest, not a row left out.
   */
  it('shows the untested beside the moved, rather than quietly dropping them', async () => {
    await open();
    expect(screen.getByText('2 improved')).toBeTruthy();
    expect(screen.getByText('1 untested')).toBeTruthy();
    expect(screen.getByText('Max Pull-Ups')).toBeTruthy();
    expect(screen.getByText('not tested')).toBeTruthy();
  });

  it('carries their app’s sentence, and says whose it is', async () => {
    await open();
    expect(screen.getByText(/Two of three improved/)).toBeTruthy();
    expect(screen.getByText(/their app/i)).toBeTruthy();
  });

  it('says how many sessions against how many the plan placed', async () => {
    await open();
    expect(screen.getByText('30 of 36 sessions the plan placed')).toBeTruthy();
  });
});

describe('what it refuses to do with it', () => {
  /** The milestone in one assertion. */
  it('writes none of it into the climber’s own records', async () => {
    await open();
    expect(useSessions.getState().byDate).toEqual({});
    expect(useMetrics.getState().entries).toEqual([]);
    // And the database, not just the stores in front of it: the two real
    // importers write here, and `sessions` and `metrics` are exactly what a
    // block report would land in if this page ever decided to keep one.
    const db = await getDb();
    expect(await db.count('sessions')).toBe(0);
    expect(await db.count('metrics')).toBe(0);
    expect(await db.count('programs')).toBe(0);
  });

  /**
   * The promise, not the preamble. A mutant that kept *"Nothing on this
   * screen is saved"* and dropped the clause naming what it does not touch
   * survived a version of this — which is the half a coach needs, because
   * the app's other two importers do touch exactly those things.
   */
  it('says on screen that it keeps nothing, and what it does not touch', async () => {
    await open();
    const said = document.body.textContent ?? '';
    expect(said).toContain('Nothing on this screen is saved');
    expect(said).toContain('none of it touches your own grades, your log or your numbers');
  });

  it('says what the file does not contain, before one is opened', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    renderAt('/shared', <SharedBlockPage />);
    const said = await screen.findByText(/no sessions, no places, no partners/);
    expect(said).toBeTruthy();
  });

  it('names the problem rather than a stack trace', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    setLaunchFile(new File(['not json'], 'x.json', { type: 'application/json' }));
    renderAt('/shared', <SharedBlockPage />);
    expect(await screen.findByText('That file is not readable JSON.')).toBeTruthy();
  });

  it('refuses the app’s other document with a sentence', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    setLaunchFile(asFile({ app: 'project-ascent', kind: 'program', program: {} }));
    renderAt('/shared', <SharedBlockPage />);
    expect(await screen.findByText(/not a Project Ascent block file/)).toBeTruthy();
  });

  /** Taken, not read: a page that mounts twice must not open it twice. */
  it('takes the launched file once', async () => {
    await open();
    await waitFor(() => expect(screen.getByText('Iron Grip')).toBeTruthy());
    renderAt('/shared', <SharedBlockPage />);
    expect(screen.queryByText('Iron Grip')).toBeNull();
  });
});

describe('opening one by hand', () => {
  it('reads a file from the picker, the same path as a launch', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    renderAt('/shared', <SharedBlockPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [asFile(file())] });
    fireEvent.change(input);
    expect(await screen.findByText('Iron Grip')).toBeTruthy();
  });
});

describe('across blocks (PLAN.md M362)', () => {
  /** The same athlete's block, run to another day, with the hang ending on `hang`. */
  function another(through: string, hang: number, program = 'Iron Grip'): BlockFile {
    const body = file();
    body.block.program = program;
    body.block.from = `${through.slice(0, 7)}-01`;
    body.block.through = through;
    body.block.results[0]!.latest = hang;
    return body;
  }

  const named = (body: unknown, name: string) =>
    new File([typeof body === 'string' ? body : JSON.stringify(body)], name, { type: 'application/json' });

  /** Files from the picker, several at once, as a coach selects them. */
  function pick(...files: File[]): void {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);
  }

  async function empty(): Promise<void> {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    renderAt('/shared', <SharedBlockPage />);
  }

  const table = () => screen.getByRole('table');
  /** A test's readings: its name heads a row group of its own (PLAN.md M362). */
  const group = (label: string) =>
    within(table())
      .getAllByRole('rowgroup')
      .find((g) => within(g).queryByRole('rowheader')?.textContent === label);
  const cells = (label: string) => within(group(label)!).getAllByRole('cell').map((c) => c.textContent);

  it('puts two blocks opened together side by side, oldest first', async () => {
    await empty();
    // Picked newest first, which is not the order they ran in.
    pick(named(another('2026-11-28', 18), 'autumn.json'), named(file(), 'summer.json'));
    expect(await screen.findByText('Across 2 blocks')).toBeTruthy();
    // file() ran to 29 August and ended the hang on 15.
    expect(cells('Max Hang 20mm 7s')).toEqual(['15', '18']);
    const heads = within(table()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads[0]).toMatch(/^Aug 29/);
    expect(heads[1]).toMatch(/^Nov 28/);
  });

  it('adds a block opened later to the ones already open', async () => {
    await empty();
    pick(named(file(), 'summer.json'));
    await screen.findByText('Iron Grip');
    expect(screen.queryByText(/^Across/)).toBeNull();
    pick(named(another('2026-11-28', 18), 'autumn.json'));
    expect(await screen.findByText('Across 2 blocks')).toBeTruthy();
  });

  it('says a block is already open, and does not open it twice', async () => {
    await empty();
    pick(named(file(), 'summer.json'));
    await screen.findByText('Iron Grip');
    pick(named(file(), 'summer copy.json'));
    expect(await screen.findByText(/already open/)).toBeTruthy();
    expect(screen.queryByText(/^Across/)).toBeNull();
  });

  it('names the file it could not read, and opens the rest', async () => {
    await empty();
    pick(named('not json', 'broken.json'), named(file(), 'summer.json'));
    expect(await screen.findByText('broken.json: That file is not readable JSON.')).toBeTruthy();
    expect(screen.getByText('Iron Grip')).toBeTruthy();
  });

  it('keeps what is open when a later file cannot be read', async () => {
    await empty();
    pick(named(file(), 'summer.json'));
    await screen.findByText('Iron Grip');
    pick(named('not json', 'broken.json'));
    expect(await screen.findByText('That file is not readable JSON.')).toBeTruthy();
    expect(screen.getByText('Iron Grip')).toBeTruthy();
  });

  it('writes back from the newest block, which is the one being answered', async () => {
    await empty();
    pick(named(another('2026-11-28', 18, 'A block of their own'), 'autumn.json'), named(file(), 'summer.json'));
    await screen.findByText('Across 2 blocks');
    const said = document.body.textContent ?? '';
    expect(said).toContain('A block of their own is not a program this app ships');
    expect(said).not.toContain('They ran Iron Grip');
  });

  it('starts again with nothing open', async () => {
    await empty();
    pick(named(file(), 'summer.json'), named(another('2026-11-28', 18), 'autumn.json'));
    await screen.findByText('Across 2 blocks');
    fireEvent.click(screen.getByRole('button', { name: /Start again/ }));
    expect(screen.queryByText('Iron Grip')).toBeNull();
    expect(screen.getByRole('button', { name: /Open block files/ })).toBeTruthy();
    // And forgotten, not just hidden: the next athlete's block opens alone.
    pick(named(another('2027-02-27', 21, 'Somebody else'), 'theirs.json'));
    expect(await screen.findByText('Somebody else')).toBeTruthy();
    expect(screen.queryByText(/^Across/)).toBeNull();
    expect(screen.queryByText('Iron Grip')).toBeNull();
  });

  it('keeps none of them, however many are open', async () => {
    await empty();
    pick(named(file(), 'summer.json'), named(another('2026-11-28', 18), 'autumn.json'));
    await screen.findByText('Across 2 blocks');
    const db = await getDb();
    expect(await db.count('sessions')).toBe(0);
    expect(await db.count('metrics')).toBe(0);
    expect(await db.count('programs')).toBe(0);
    expect(document.body.textContent).toContain('Nothing on this screen is saved');
  });

  it('opens twelve at most, and says which it left', async () => {
    await empty();
    const thirteen = Array.from({ length: 13 }, (_, i) =>
      named(another(`2027-${String(i + 1).padStart(2, '0')}-28`, 12 + i), `block-${i}.json`),
    );
    pick(...thirteen);
    expect(await screen.findByText('Across 12 blocks')).toBeTruthy();
    expect(screen.getByText(/was not opened: 12 blocks at once/)).toBeTruthy();
  });
});

