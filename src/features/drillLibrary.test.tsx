// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DRILLS } from '@/content/drills';
import { DRILL_COACHING } from '@/content/drillCoaching';
import { newSession, putSession, type Session } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { DrillsPage } from '@/features/drills/DrillsPage';
import { DrillPage } from '@/features/drills/DrillPage';

/**
 * The drill library, with a way in (PLAN.md M107).
 *
 * 144 drills the app has always had, reachable only from the week a program
 * put one in and from search — and never with the climber's own record
 * beside them.
 */

const day = (date: string, drillId: string, drillDone: boolean): Session =>
  newSession(date, 0, { completed: true, drillId, drillDone });

async function library(sessions: Session[] = []) {
  await reset();
  for (const s of sessions) await putSession(s as never);
  await hydrate();
  renderAt('/drills', <DrillsPage />);
  await screen.findByRole('heading', { name: 'Drills' });
}

async function one(id: string, sessions: Session[] = []) {
  await reset();
  for (const s of sessions) await putSession(s as never);
  await hydrate();
  renderAt(`/drills/${id}`, <DrillPage params={{ id }} />);
}

describe('the library, browsable at last', () => {
  it('lists the drills a climber can actually do', async () => {
    await library();
    expect(screen.getByText('Sticky Feet')).toBeTruthy();
  });

  /**
   * A kit filter was built here and removed after counting: all 144 drills
   * list `wall` and exactly three ask for more, so it separated three
   * entries — and a climber who had not listed a wall would have opened the
   * library to nothing at all.
   */
  it('shows the whole library rather than filtering it by kit', async () => {
    await library();
    expect(screen.getByText(`${DRILLS.length} of ${DRILLS.length} — every one the programs prescribe`)).toBeTruthy();
    expect(screen.queryByText(/need kit you have not listed/)).toBeNull();
  });

  it('narrows by category', async () => {
    await library();
    expect(screen.getByText('Sticky Feet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mental' }));
    await waitFor(() => expect(screen.queryByText('Sticky Feet')).toBeNull());
  });

  // A hundred-odd rows in one flat list is a wall rather than a library —
  // the unfiltered page ran to nineteen thousand pixels in a browser.
  it('groups the whole library by category rather than listing it flat', async () => {
    await library();
    expect(screen.getByRole('heading', { name: 'Technique' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mental' })).toBeTruthy();
    expect(screen.getByText(/Fear, focus, and pressure management/)).toBeTruthy();
  });

  it('drops the blurbs once a category is picked, since the scope is the heading', async () => {
    await library();
    fireEvent.click(screen.getByRole('button', { name: 'Mental' }));
    await waitFor(() =>
      expect(screen.queryByText(/Fear, focus, and pressure management/)).toBeNull(),
    );
    expect(screen.getByRole('heading', { name: 'Mental' })).toBeTruthy();
  });

  it('searches the method, not only the name', async () => {
    await library();
    fireEvent.change(screen.getByLabelText('Search the drills'), {
      target: { value: 'downclimb and restart' },
    });
    await waitFor(() => expect(screen.getByText('Sticky Feet')).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says so when nothing matches rather than showing an empty list', async () => {
    await library();
    fireEvent.change(screen.getByLabelText('Search the drills'), {
      target: { value: 'zzzzz' },
    });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
  });

  /** The part that did not exist anywhere before this. */
  it('shows the climber their own count beside a drill', async () => {
    await library([day('2026-02-01', 'sticky_feet', true), day('2026-02-08', 'sticky_feet', false)]);
    expect(screen.getByText(/done 1 of 2/)).toBeTruthy();
  });

  it('says nothing about a drill the climber has never been given', async () => {
    await library();
    const row = screen.getByText('Sticky Feet').closest('a')!;
    expect(row.textContent).not.toMatch(/done \d of \d/);
  });
});

describe('one drill', () => {
  it('shows the method as instructions rather than a summary', async () => {
    await one('sticky_feet');
    expect(await screen.findByText(/downclimb and restart/)).toBeTruthy();
    expect(screen.getByText('How to run it')).toBeTruthy();
  });

  it('names what it needs and where it came from', async () => {
    await one('sticky_feet');
    expect(await screen.findByText(/Prescribed by/)).toBeTruthy();
  });

  it('carries the climber’s record with it', async () => {
    await one('sticky_feet', [
      day('2026-02-01', 'sticky_feet', true),
      day('2026-02-08', 'sticky_feet', false),
    ]);
    expect(await screen.findByText('You and this drill')).toBeTruthy();
    expect(screen.getByText(/1 of 2 times it came up/)).toBeTruthy();
  });

  // A library entry the climber has never met should say nothing about
  // them rather than an empty heading over "0 of 0".
  it('says nothing about a climber who has never been given it', async () => {
    await one('sticky_feet');
    await screen.findByText('How to run it');
    expect(screen.queryByText('You and this drill')).toBeNull();
  });

  // Not a failure of will: usually the wrong drill for the session it lands
  // in, which is a thing the climber can actually act on.
  it('offers a reading when it keeps not happening', async () => {
    await one('sticky_feet', [
      day('2026-02-01', 'sticky_feet', false),
      day('2026-02-08', 'sticky_feet', false),
    ]);
    expect(await screen.findByText(/wrong drill for the session it lands in/)).toBeTruthy();
  });

  it('does not say that about a single miss', async () => {
    await one('sticky_feet', [day('2026-02-01', 'sticky_feet', false)]);
    await screen.findByText('You and this drill');
    expect(screen.queryByText(/wrong drill for the session/)).toBeNull();
  });

  // It is about a drill that never happens, not about one that sometimes
  // does. Two misses and a hit is a climber doing the drill.
  it('does not say it to someone who has done the drill', async () => {
    await one('sticky_feet', [
      day('2026-02-01', 'sticky_feet', false),
      day('2026-02-08', 'sticky_feet', false),
      day('2026-02-15', 'sticky_feet', true),
    ]);
    await screen.findByText('You and this drill');
    expect(screen.queryByText(/wrong drill for the session/)).toBeNull();
  });

  it('does not pretend a renamed drill still exists', async () => {
    await one('no_such_drill');
    expect(await screen.findByText(/That drill/)).toBeTruthy();
  });

  /**
   * Eleven of the 144 are a named method, and the method's cues were
   * written before the drill's were (PLAN.md M107).
   *
   * Since M107b those eleven pages carry **two** cue cards, which is the
   * arrangement rather than a bug: the drill's own cues are about this
   * week's version of the session, the protocol's are about the method, and
   * the second card names its method so the reader can tell them apart.
   */
  it('shows the drill’s cues and the protocol’s, named apart', async () => {
    const withProtocol = DRILLS.find((d) => d.protocolId !== undefined)!;
    await one(withProtocol.id);
    expect(await screen.findByText('Cues')).toBeTruthy();
    const named = screen.getByText(/^Cues for .+/);
    expect(named).toBeTruthy();
    // Specific first: what to do on this drill, then what the method is.
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Cues')).toBeLessThan(text.indexOf(named.textContent!));
  });

  /**
   * There is no longer a drill in the library without cues, so the absent
   * case cannot be tested through a real one (PLAN.md M107b). This is what
   * replaced that test rather than a version of it that skipped itself and
   * passed — a test that asserts nothing is worse than a deleted one.
   *
   * The branch it used to cover is still live: `drillCoaching` returns
   * `undefined` for an id it does not know, which is what a drill added
   * tomorrow gets. `drillCoaching.test.ts` is what fails then, and it fails
   * first.
   */
  it('has no drill left without cues to render', async () => {
    const bare = DRILLS.filter((d) => DRILL_COACHING[d.id] === undefined);
    expect(bare.map((d) => d.id)).toEqual([]);
  });

  it('renders the cards conditionally rather than always', async () => {
    // The guard, read at the source, because the content can no longer
    // produce the case that would exercise it.
    const { readFileSync } = await import('node:fs');
    const page = readFileSync('src/features/drills/DrillPage.tsx', 'utf8');
    expect(page).toMatch(/\{cues\.length > 0 && \(/);
    expect(page).toMatch(/\{faults\.length > 0 && \(/);
  });
});

/**
 * The coach's cues and faults (PLAN.md M107b).
 *
 * The fields are optional and most of the library has not been written yet,
 * so these run against a drill the coverage guard in
 * `content/drills/cues.test.ts` holds to having them.
 */
describe('a drill that has been coached', () => {
  it('says what to do while you are on the wall', async () => {
    await one('sticky_feet');
    expect(await screen.findByText('Cues')).toBeTruthy();
    expect(screen.getByText(/Pick the spot on the hold/)).toBeTruthy();
  });

  it('says what going wrong looks like, in its own card', async () => {
    // Not a second list under Cues: a climber opens this page either to run
    // the drill or to work out why it is not working.
    await one('sticky_feet');
    expect(await screen.findByText('Where it goes wrong')).toBeTruthy();
    expect(screen.getByText(/slides a centimetre/)).toBeTruthy();
  });

  it('puts the cues before the faults', async () => {
    await one('sticky_feet');
    await screen.findByText('Cues');
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Cues')).toBeLessThan(text.indexOf('Where it goes wrong'));
  });

  it('keeps them under the method rather than above it', async () => {
    // The description is what the drill *is*. A cue read before it is an
    // instruction about something the reader has not met.
    await one('sticky_feet');
    await screen.findByText('Cues');
    const text = document.body.textContent ?? '';
    expect(text.indexOf('How to run it')).toBeLessThan(text.indexOf('Cues'));
  });
});
