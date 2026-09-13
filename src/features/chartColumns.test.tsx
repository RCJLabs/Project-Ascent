// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession, type ProjectAttempt } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';

/**
 * What the table under each chart says its columns are (PLAN.md M140).
 *
 * The header was hard-coded to the one caller it was written for, so the
 * accessible form of a project's high point read *Week: Sep 3 · Hardest
 * grade: 60%* — two wrong words over two right numbers, for the readers
 * who have nothing but those words. The primitives now require the header,
 * so a caller cannot inherit one by accident; these hold the words each
 * page chose.
 */

const columns = (): string[] =>
  [...document.querySelectorAll('th[scope="col"]')].map((th) => th.textContent ?? '');

const body = (): string[][] =>
  [...document.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('th,td')].map((c) => c.textContent ?? ''),
  );

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

describe("a project's high point per day", () => {
  const burn = (id: string, outcome: ProjectAttempt['outcome']): ProjectAttempt => ({
    id, projectId: 'p1', outcome, count: 1,
  });

  beforeEach(async () => {
    await putProject(newProject({ id: 'p1', name: 'Midnight Lightning', grade: 'V8', scale: 'V' }));
    await putSession(
      newSession('2026-09-01', 0, { completed: true, projectAttempts: [burn('a1', 'fell-low')] }),
    );
    await putSession(
      newSession('2026-09-04', 0, { completed: true, projectAttempts: [burn('a2', 'fell-high')] }),
    );
    await hydrate();
  });

  it('calls its columns a day tried and a high point', async () => {
    renderAt('/projects/p1', <ProjectDetailPage params={{ id: 'p1' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(columns()).toEqual(['Day tried', 'High point']);
  });

  /**
   * And the rows under them are the days the climber tried it. A header
   * naming the right axis over a column of the wrong dates is the same
   * failure one level down.
   */
  it('puts the day each high point was reached under that heading', async () => {
    renderAt('/projects/p1', <ProjectDetailPage params={{ id: 'p1' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(body()).toEqual([
      ['Sep 1', '25%'],
      ['Sep 4', '75%'],
    ]);
  });

  // The words the chart inherited. Neither is what this page is showing.
  it('says neither week nor hardest grade', async () => {
    renderAt('/projects/p1', <ProjectDetailPage params={{ id: 'p1' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(columns()).not.toContain('Week');
    expect(columns()).not.toContain('Hardest grade');
  });
});

describe('a benchmark over time', () => {
  beforeEach(async () => {
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-03-01', value: 40 });
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-09-01', value: 50 });
    await hydrate();
  });

  // The benchmark names its own second column, because "the value" is a
  // word that tells a reader nothing.
  it('names the benchmark itself in the column heading', async () => {
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(columns()).toEqual(['Date tested', 'Max Hang 20mm 7s']);
  });

  it('puts each reading under the date it was taken', async () => {
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(body().map((r) => r[0])).toEqual(['Mar 1', 'Sep 1']);
  });
});
