// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from './ProgressPage';

/**
 * The logger's answers reach a screen (PLAN.md M88).
 *
 * `engine/sessionFields.test.ts` proves the series. This proves the page
 * draws one — the failure this app keeps shipping is a card written and
 * never mounted, which no source scan can tell from one that is.
 */

async function log(daysAgo: number, fields: Record<string, string | number>) {
  const date = addDays(today(), -daysAgo);
  await putSession({
    ...newSession(date, daysAgo),
    completed: true,
    rewarded: true,
    rpe: 6,
    durationMin: 60,
    climbs: [{ id: `c${daysAgo}`, grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    fields: fields as never,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  reset();
});

describe('what you told the logger', () => {
  it('stays away when nothing has been answered', async () => {
    await log(1, {});
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.queryByText('What you told the logger')).toBeNull();
  });

  it('draws a dot per answer once there are some', async () => {
    await log(1, { sessionVolume: 20 });
    await log(5, { sessionVolume: 14 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const card = screen.getByText('What you told the logger').closest('section, div')!;
    expect(card.textContent).toContain('Climbs done');
    expect(card.querySelectorAll('circle')).toHaveLength(2);
  });

  it('puts the unit on the number, not on the word typical', async () => {
    for (let i = 1; i <= 5; i += 1) await log(i, { attemptsToday: 5 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const card = screen.getByText('What you told the logger').closest('section, div')!;
    expect(card.textContent).toContain('typically 5 burns');
    expect(card.textContent).not.toContain('5 typical burns');
  });

  it('says how many answers a series came from', async () => {
    await log(1, { pumpLevel: 8 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const card = screen.getByText('What you told the logger').closest('section, div')!;
    expect(card.textContent).toContain('1 answer');
    expect(card.textContent).toContain('not a trend');
  });

  it('draws nothing for the text answers', async () => {
    await log(1, { highPoint: 'the third bolt', location: 'The Works' });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.queryByText('What you told the logger')).toBeNull();
  });

  it('draws one axis line when every answer was the same', async () => {
    // `hi` and `lo` are equal here, and rendering both put two children
    // under the same React key — caught as a console warning.
    await log(1, { sessionVolume: 20 });
    await log(5, { sessionVolume: 20 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const card = screen.getByText('What you told the logger').closest('section, div')!;
    expect(card.querySelectorAll('svg line')).toHaveLength(1);
    expect(card.querySelectorAll('circle')).toHaveLength(2);
  });

  it('draws a pump scale against its own ends, not against the answers', async () => {
    // A 1-10 scale means something at its ends: 6-to-8 against a 6-to-8
    // axis reads as the full range of possible pump. A single answer made
    // both axes identical, so this needs a spread.
    await log(1, { pumpLevel: 6 });
    await log(5, { pumpLevel: 8 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const card = screen.getByText('What you told the logger').closest('section, div')!;
    const labels = [...card.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('10');
    expect(labels).toContain('1');
    expect(labels).not.toContain('8');
  });

  it('says the questions only appear on the days they were asked', async () => {
    await log(1, { sessionVolume: 20 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.getByText(/only appears here on the days it was put to you/)).toBeTruthy();
  });
});
