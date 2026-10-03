// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { getProgram, loadPrograms } from '@/content/programs';
import { buildBlockFile } from '@/engine/blockFile';
import { blockReport, describeBlock } from '@/engine/blockReport';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { planFromLayout } from '@/engine/weekLayouts';
import { setLaunchFile } from '@/lib/launchFile';
import { useProfile } from '@/store/profile';
import { useCustomPrograms } from '@/store/programs';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from '@/features/finish/FinishPage';
import { SharedBlockPage } from './SharedBlockPage';

/**
 * Light progress where a climber and a coach read it (PLAN.md M370): the
 * review's chart and sentence, and the block a coach opens.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

const IG = () => getProgram('iron_grip')!;
const at = (metricId: string, date: string, value: number) => ({ id: `${metricId}@${date}`, metricId, date, value }) as never;

describe('the block review', () => {
  it('calls a change of exactly the band light progress, in the sentence and on the chart', async () => {
    const start = addDays(startOfWeek(today()), -14 * 7);
    await putMetricEntry(at('max_hang_20mm_7s', addDays(start, 1), 40));
    await putMetricEntry(at('max_hang_20mm_7s', addDays(start, 80), 45));
    await putMetricEntry(at('max_pullups', addDays(start, 1), 10));
    await putMetricEntry(at('max_pullups', addDays(start, 80), 9));
    await hydrate();
    useProfile.setState({ activeProgramId: 'iron_grip', startDates: { iron_grip: start }, plans: { iron_grip: planFromLayout(IG().recommendedLayout!) } });
    renderAt('/finish', <FinishPage />);
    await screen.findByRole('heading', { name: 'What moved' });
    expect(document.body.textContent).toContain(
      'None of the 2 retested numbers improved, one made light progress, one had a light decline.',
    );
    const titles = [...document.querySelectorAll('svg title')].map((t) => t.textContent);
    expect(titles.find((t) => t?.startsWith('Max Pull-Ups'))).toMatch(/ · light decline$/);
    // The max hang is listed under the chart rather than on it: added load
    // has no percentage of its own (PLAN.md M371).
    const listed = [...document.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(listed.find((t) => t.startsWith('Max Hang 20mm 7s'))).toMatch(/\+5 BW\+lbs · light progress$/);
    // Drawn between held and a full change.
    const bar = (label: string) =>
      [...document.querySelectorAll('svg title')].find((t) => t.textContent?.startsWith(label))!.parentElement!.querySelector('rect')!;
    expect(bar('Max Pull-Ups').getAttribute('opacity')).toBe('0.55');
  });
});

describe('the block a coach opens', () => {
  it('counts light progress and a light decline, and says which rows were light', async () => {
    const r = blockReport({
      program: IG(), startDate: '2026-03-01', today: '2026-06-30',
      entries: [at('max_hang_20mm_7s', '2026-03-02', 40), at('max_hang_20mm_7s', '2026-03-29', 45), at('max_pullups', '2026-03-02', 10), at('max_pullups', '2026-03-29', 9)],
    })!;
    const file = buildBlockFile({ report: r, outcome: 'completed', weeksRun: 12, sessions: null, planned: null, summary: describeBlock(r) });
    setLaunchFile(new File([JSON.stringify(file)], 'theirs.ascent-block.json', { type: 'application/json' }));
    renderAt('/shared', <SharedBlockPage />);
    await screen.findByText('Iron Grip');
    expect(screen.getByText('1 light progress')).toBeTruthy();
    expect(screen.getByText('1 light decline')).toBeTruthy();
    const rows = [...document.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows.find((t) => t.startsWith('Max Hang 20mm 7s'))).toMatch(/ · light progress$/);
    expect(rows.find((t) => t.startsWith('Max Pull-Ups'))).toMatch(/ · light decline$/);

    // And the counts travel with the program the coach writes back.
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;
    cleanup();
    renderAt(`/build/${made.id}`, <BuilderPage params={{ id: made.id }} />);
    await screen.findByText('Answering a block they sent you');
    expect(document.body.textContent).toMatch(/0 improved, 1 light progress, 0 held, 0 down, 1 light decline, \d+ untested/);
  });
});
