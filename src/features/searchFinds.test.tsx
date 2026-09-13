// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { DRILLS } from '@/content/drills';
import { METRICS } from '@/content/metrics';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Climb } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { SearchSheet } from '@/features/search/SearchSheet';

/**
 * Two things search could not do (PLAN.md M143).
 *
 * Every drill result linked to `/train` — the catalogue tab, not the drill.
 * The drill page has existed since M107 and the library links to it; the
 * index predates it and was never moved. And a session was indexed as
 * *V5 × 2*, so the climb name M130 made the natural thing to type matched
 * nothing unless it was also a project.
 */

const climb = (patch: Partial<Climb>): Climb => ({
  id: `c-${patch.name ?? patch.grade}`,
  grade: 'V5',
  scale: 'V',
  count: 2,
  result: 'send',
  ...patch,
});

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

async function search(term: string) {
  await hydrate();
  renderAt('/', <SearchSheet onClose={() => undefined} />);
  const box = await screen.findByPlaceholderText(/^Search \d/);
  fireEvent.change(box, { target: { value: term } });
  return screen.findByRole('dialog', { name: 'Search' });
}

const links = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href'),
    text: a.textContent ?? '',
  }));

describe('a drill found in search', () => {
  const drill = DRILLS[0]!;

  it('goes to the drill, not to the catalogue tab', async () => {
    const dialog = await search(drill.name);
    // By href, not by text: a guide passage that mentions the drill by name
    // is a legitimate second hit, and it is not the one under test.
    const hrefs = links(dialog).map((l) => l.href);
    expect(hrefs).toContain(`#/drills/${drill.id}`);
  });

  it('sends no drill to the tab it used to', async () => {
    const dialog = await search(drill.name);
    const drillish = links(dialog).filter((l) => l.text.includes(drill.focus));
    expect(drillish.length).toBeGreaterThan(0);
    for (const l of drillish) expect(l.href).not.toBe('#/train');
  });
});

describe('a climb found by its name', () => {
  beforeEach(async () => {
    await putSession(
      newSession('2026-09-09', 0, {
        completed: true,
        climbs: [climb({ name: 'Moonlight Arete' }), climb({ grade: 'V3', name: undefined })],
      }),
    );
  });

  it('finds the day it was climbed', async () => {
    const dialog = await search('Moonlight');
    const hit = links(dialog).find((l) => l.href === '#/log/2026-09-09');
    expect(hit, 'the session is not in the results').toBeTruthy();
  });

  it('shows the name in the line, so the day is recognisable', async () => {
    const dialog = await search('Moonlight');
    const hit = links(dialog).find((l) => l.href === '#/log/2026-09-09')!;
    expect(hit.text).toContain('Moonlight Arete');
  });

  /**
   * The whole line, exactly. A named climb keeps its grade and its count
   * beside the name, and an unnamed one reads as it always did — not as
   * "undefined V3 × 2", which is what a name prefix applied unconditionally
   * would write.
   */
  it('names what was named and leaves the rest as it was', async () => {
    const dialog = await search('Moonlight');
    const hit = links(dialog).find((l) => l.href === '#/log/2026-09-09')!;
    expect(hit.text).toContain('Moonlight Arete V5 × 2, V3 × 2');
    expect(hit.text).not.toMatch(/undefined/);
  });

  it('does not invent a hit for a name nobody climbed', async () => {
    const dialog = await search('Midnight Lightning');
    expect(links(dialog).find((l) => l.href === '#/log/2026-09-09')).toBeUndefined();
  });
});

/**
 * And a benchmark that claimed to be something it is not. *Total Outdoor
 * Days* said *Derived from your logs* over a number the climber types —
 * and the app's own derived count is a different number with a different
 * meaning, since most of a climber's outdoor days happened before this app.
 */
describe('the benchmark that said it was derived', () => {
  it('no longer claims the app worked it out', () => {
    expect(METRICS.total_outdoor_days!.description).not.toMatch(/Derived from your logs/);
  });

  /**
   * And says whose count it is instead. Kept shorter than the sentence it
   * replaced, deliberately: `content/metrics.ts` is in the entry chunk, so
   * every word of every benchmark description is in the first load.
   */
  it('says whose count it is', () => {
    const said = METRICS.total_outdoor_days!.description ?? '';
    expect(said).toMatch(/counted by you/);
    expect(said.length).toBeLessThan(80);
  });
});
