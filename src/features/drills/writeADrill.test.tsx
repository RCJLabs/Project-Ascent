// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadDrills, registerCustomDrills } from '@/content/drills';
import type { Drill, DrillId } from '@/content/types';
import { blankDrill } from '@/engine/customDrill';
import { useCustomDrills } from '@/store/drills';
import { useUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { DrillsPage } from './DrillsPage';
import { DrillPage } from './DrillPage';

/**
 * Writing a drill, on screen (PLAN.md M286).
 *
 * No second route and no builder screen: a written drill *is* a `Drill`, so
 * the page that reads one already reads it. What it gains is an edit mode.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadDrills();
  useCustomDrills.setState({ hydrated: false, custom: [] });
  await useCustomDrills.getState().load();
});

const mine = (over: Partial<Drill> = {}): Drill => ({
  ...blankDrill(),
  id: 'own_test' as DrillId,
  name: 'Three-point rule',
  focus: 'Foot precision',
  text: 'Keep three points on, always.',
  ...over,
});

async function openDrill(drill: Drill): Promise<void> {
  await useCustomDrills.getState().save(drill);
  await hydrate();
  renderAt(`/drills/${drill.id}`, <DrillPage params={{ id: drill.id }} />);
  await screen.findByRole('heading', { level: 1 });
}

describe('the library offers writing one', () => {
  it('says why, on the page that lists the shipped ones', async () => {
    await hydrate();
    renderAt('/drills', <DrillsPage />);
    expect(await screen.findByText('Write a drill')).toBeTruthy();
    expect(screen.getByText(/somebody else/)).toBeTruthy();
  });

  it('makes a real record rather than a draft', async () => {
    await hydrate();
    renderAt('/drills', <DrillsPage />);
    fireEvent.click(await screen.findByText('Write a drill'));
    await waitFor(() => expect(useCustomDrills.getState().custom).toHaveLength(1));
    expect(useCustomDrills.getState().custom[0]?.id.startsWith('own_')).toBe(true);
  });
});

describe('the drill page, for one of yours', () => {
  /**
   * A drill made a moment ago has no name, and sending a climber to a page
   * that says nothing would be the wrong half of "it exists before it is
   * finished".
   */
  it('opens a blank one straight into the editor', async () => {
    await openDrill(blankDrill());
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByText('Your drill')).toBeTruthy();
  });

  it('reads a finished one as a drill, with a way in', async () => {
    await openDrill(mine());
    expect(screen.getByText('Keep three points on, always.')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  /**
   * The store is the source of truth; the registry is a lookup for the pure
   * engines. `store/programs.ts` states that division, and this is the page
   * holding to it — with the registry emptied, the drill is still the
   * climber's and still readable.
   *
   * It is also the only way jsdom can see the bug the browser found. Reading
   * `getDrill` alone left the page never re-rendering with what had been
   * typed, and a test harness that forces a re-render around every event
   * cannot reproduce that; an emptied registry can.
   */
  it('reads the climber\u2019s own copy, not just the registry\u2019s', async () => {
    await useCustomDrills.getState().save(mine());
    await hydrate();
    // After hydrating, not before: `hydrateAll` loads this store and
    // re-registers everything in it, so clearing first cleared nothing.
    registerCustomDrills([]);
    renderAt('/drills/own_test', <DrillPage params={{ id: 'own_test' }} />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Three-point rule');
  });

  it('offers no edit on a drill from the library', async () => {
    await hydrate();
    renderAt('/drills/sticky_feet', <DrillPage params={{ id: 'sticky_feet' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Edit')).toBeNull();
  });

  /** No Save button: the record is saved as it is typed. */
  it('keeps what is typed without being told to', async () => {
    await openDrill(mine());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Four-point rule' } });
    await waitFor(() => expect(useCustomDrills.getState().custom[0]?.name).toBe('Four-point rule'));
  });

  it('says what is still missing, rather than refusing to hold it', async () => {
    await openDrill(blankDrill());
    expect(screen.getByText('Still to do')).toBeTruthy();
    expect(screen.getByText(/Give it a name/)).toBeTruthy();
    // And it is stored regardless, which is the point.
    expect(useCustomDrills.getState().custom).toHaveLength(1);
  });

  /**
   * Both halves of this were broken while every test above passed, which is
   * why they are here now.
   *
   * The page read `getDrill` and did not subscribe to the store, so it never
   * re-rendered with what had been typed — a drill made a moment ago could
   * **never leave the editor**. Subscribing fixed that and broke the other
   * end: "is it still nameless" was recomputed every render, so the first
   * letter of the name closed the editor mid-word. Found in a browser.
   */
  it('stays in the editor while the name is being typed', async () => {
    await openDrill(blankDrill());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'T' } });
    await waitFor(() => expect(useCustomDrills.getState().custom[0]?.name).toBe('T'));
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('leaves the editor when you are done, and reads as a drill', async () => {
    await openDrill(blankDrill());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Three-point rule' } });
    fireEvent.change(screen.getByLabelText('What it trains'), { target: { value: 'Feet' } });
    fireEvent.change(screen.getByLabelText('The drill'), { target: { value: 'Three points on.' } });
    fireEvent.click(screen.getByText('Done'));

    /**
     * Every assertion here retries, and the first draft's did not — which
     * took `main` red on a slower CI runner while passing locally.
     *
     * The editor saves fire-and-forget by design, so the editor closing and
     * the page reading back what was typed are **two** events, not one. A
     * `waitFor` on the first tells you nothing about the second: the heading
     * was still "Your drill" because the store had not landed yet. The same
     * shape as M268's timeout, and the same cause — a local machine fast
     * enough to hide the gap.
     */
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Three-point rule'),
    );
    expect(await screen.findByText('Three points on.')).toBeTruthy();
  });

  /**
   * Done means done, even on a drill that is still nothing.
   *
   * It is also the case that separates "opened blank" from "is blank": a
   * guard recomputing the second every render keeps the editor up forever,
   * which is the browser bug this pins.
   */
  it('lets an unfinished drill be left unfinished', async () => {
    await openDrill(blankDrill());
    fireEvent.click(screen.getByText('Done'));
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your drill'),
    );
    // Still there, and still unfinished — the record was never the problem.
    expect(useCustomDrills.getState().custom).toHaveLength(1);
  });

  it('tidies the name when you are done', async () => {
    await openDrill(mine());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Four   point  ' } });
    fireEvent.click(screen.getByText('Done'));
    await waitFor(() => expect(useCustomDrills.getState().custom[0]?.name).toBe('Four point'));
  });

  it('deletes one, and puts it back whole', async () => {
    await openDrill(mine());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(useCustomDrills.getState().custom).toEqual([]));

    await useUndo.getState().offer!.run();
    await waitFor(() => expect(useCustomDrills.getState().custom[0]?.text).toBe('Keep three points on, always.'));
  });
});
