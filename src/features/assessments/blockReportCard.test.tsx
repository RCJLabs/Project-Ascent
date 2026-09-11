// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { getProgram, loadPrograms } from '@/content/programs';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { AssessmentsPage } from './AssessmentsPage';

/**
 * The block report reaches the page (PLAN.md M84).
 *
 * `engine/blockReport.test.ts` proves the comparison. This proves the page
 * builds one — and that it uses the program the climber actually started,
 * which a source scan cannot tell from a hardcoded one.
 */

const PROGRAM = 'base_camp';
/** Week one's Sunday, twelve weeks back, so the block is mid-run. */
const START = startOfWeek(addDays(today(), -35));

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  reset();
  await loadPrograms();
});

async function start(programId = PROGRAM) {
  useProfile.setState({ activeProgramId: programId, startDates: { [programId]: START } });
}

async function tested(metricId: string, baseline: number, after: number) {
  await putMetricEntry({ metricId, date: addDays(START, 1), value: baseline });
  await putMetricEntry({ metricId, date: addDays(START, 29), value: after });
}

describe('the block report card', () => {
  it('stays away with no program running', async () => {
    await hydrate();
    renderAt('/assessments', <AssessmentsPage />);
    expect(screen.queryByText(/What the block is moving/)).toBeNull();
  });

  it('appears once a program is running, and says nothing was taken', async () => {
    await hydrate();
    await start();
    renderAt('/assessments', <AssessmentsPage />);
    expect(screen.getByText('What the block is moving')).toBeTruthy();
    expect(screen.getByText(/no before to put an after beside/)).toBeTruthy();
  });

  it('compares against the first reading inside the block', async () => {
    await tested('dead_hang', 30, 45);
    await hydrate();
    await start();
    renderAt('/assessments', <AssessmentsPage />);
    expect(screen.getByText(/retested number improved/)).toBeTruthy();
    expect(screen.getByText(/Up: Dead Hang/)).toBeTruthy();
  });

  it('lists a grade change in grades rather than on the percent axis', async () => {
    // Base Camp assesses `flash_grade`, which is ordinal.
    await tested('flash_grade', 4, 6);
    await hydrate();
    await start();
    renderAt('/assessments', <AssessmentsPage />);
    // Scoped to the card: the battery row above shows its own change with
    // the same words, which is what a bare getByText found first.
    const card = screen.getByText('What the block is moving').closest('section, div')!;
    expect(card.textContent).toContain('+2 grades');
    expect(card.querySelector('svg')).toBeNull();
  });

  it('names the ones with no comparison rather than leaving them out', async () => {
    await tested('dead_hang', 30, 45);
    await hydrate();
    await start();
    renderAt('/assessments', <AssessmentsPage />);
    expect(screen.getAllByText('not taken').length).toBeGreaterThan(0);
    expect(screen.getByText(/have no comparison this block/)).toBeTruthy();
  });

  it('reads the program the climber actually started', async () => {
    // Gravity Defied's battery has `box_jump_height`; Base Camp's does not.
    await putMetricEntry({ metricId: 'box_jump_height', date: addDays(START, 1), value: 20 });
    await putMetricEntry({ metricId: 'box_jump_height', date: addDays(START, 29), value: 26 });
    await hydrate();
    await start('gravity_defied');
    renderAt('/assessments', <AssessmentsPage />);
    expect(getProgram('gravity_defied')!.assessments).toContain('box_jump_height');
    expect(screen.getByText(/Up: Box Jump/)).toBeTruthy();
  });

  it('has no report for a logging mode, which has no block', async () => {
    await hydrate();
    await start('general_training');
    renderAt('/assessments', <AssessmentsPage />);
    expect(screen.queryByText(/What the block/)).toBeNull();
  });
});
