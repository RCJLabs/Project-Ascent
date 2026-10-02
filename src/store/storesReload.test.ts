// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { appendLedger, putAscent, putBounties, putWallet, EMPTY_ASCENT } from '@/db/game';
import { newProject, putProject } from '@/db/projects';
import { putMetricEntry } from '@/db/metrics';
import { putCustomProgram } from '@/db/customPrograms';
import { blankProgram } from '@/engine/customProgram';
import { useGame } from './game';
import { useMetrics } from './metrics';
import { useObjectives } from './objectives';
import { useProjects } from './projects';
import { useCustomPrograms } from './programs';
import { useTemplates } from './templates';
import { kept, sameData } from './sameData';

/**
 * M350's rule, on the six stores a page also loads itself (PLAN.md M360).
 *
 * `hydrateAll` loads every store at launch, and the board, the projects
 * page, the objectives page and the assessments page each load theirs too,
 * in case they mounted first. Counted on warm launches, the second read
 * replaced the game store's four fields on Home, the Board and the Ascent,
 * the projects on three pages, the objectives, the metrics and the
 * templates on one each — equal values, new objects, and everything reading
 * them derived again. The climber's own programs have the same race on the
 * builder.
 *
 * Each store is checked both ways: an equal read keeps every object, and a
 * read that differs anywhere replaces the one that differs.
 */

const entry = (id: string, units: number) => ({
  id,
  date: '2026-09-22',
  label: 'A run',
  units,
  origin: 'ascent-run',
  source: 'game' as const,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useGame.setState({
    hydrated: false,
    ledger: [],
    bounties: [],
    wallet: { spent: 0, owned: [], walls: [], wall: null },
    ascent: EMPTY_ASCENT,
  });
  useProjects.setState({ hydrated: false, projects: [], dismissed: [] });
  useObjectives.setState({ hydrated: false, objectives: [] });
  useMetrics.setState({ hydrated: false, entries: [] });
  useTemplates.setState({ hydrated: false, templates: [] });
  useCustomPrograms.setState({ hydrated: false, custom: [] });
});

describe('kept', () => {
  it('hands back what the store has when the read says the same', () => {
    const current = [{ id: 'a', n: 1 }];
    expect(kept(current, [{ id: 'a', n: 1 }])).toBe(current);
  });

  it('hands back the read when anything differs', () => {
    const next = [{ id: 'a', n: 2 }];
    expect(kept([{ id: 'a', n: 1 }], next)).toBe(next);
  });

  it('is the same comparison the log uses', () => {
    // Moved out of `sessions.ts`, not rewritten: a Date has no keys and
    // must not read as equal to another.
    expect(sameData({ at: new Date(1) }, { at: new Date(2) })).toBe(false);
    expect(sameData({ a: undefined }, { b: undefined })).toBe(false);
  });
});

describe('the game store', () => {
  async function seed(): Promise<void> {
    await appendLedger(entry('claim:a', 10));
    await appendLedger(entry('run:2026-09-22', 4));
    await putWallet({ spent: 3, owned: ['Chalk bag'], walls: [], wall: null });
    await putBounties([{ id: 'b1', spec: { kind: 'sends', count: 3 }, acceptedAt: '2026-09-20T10:00:00.000Z' } as never]);
    await putAscent({ ...EMPTY_ASCENT, runs: 2, best: { ascent: 120, freesolo: 0 } });
  }

  it('keeps all four objects when a second read says the same', async () => {
    await seed();
    await useGame.getState().load();
    const first = useGame.getState();
    expect(first.ledger).toHaveLength(2);
    expect(first.bounties).toHaveLength(1);
    await useGame.getState().load();
    const second = useGame.getState();
    expect(second.ledger).toBe(first.ledger);
    expect(second.wallet).toBe(first.wallet);
    expect(second.bounties).toBe(first.bounties);
    expect(second.ascent).toBe(first.ascent);
  });

  it('keeps them across two loads at once, as at launch', async () => {
    await seed();
    await useGame.getState().load();
    const first = useGame.getState().ledger;
    await Promise.all([useGame.getState().load(), useGame.getState().load()]);
    expect(useGame.getState().ledger).toBe(first);
  });

  it('replaces only what changed', async () => {
    await seed();
    await useGame.getState().load();
    const first = useGame.getState();
    await appendLedger(entry('claim:b', 5));
    await useGame.getState().load();
    const second = useGame.getState();
    expect(second.ledger).not.toBe(first.ledger);
    expect(second.ledger.map((e) => e.id)).toContain('claim:b');
    expect(second.wallet).toBe(first.wallet);
    expect(second.bounties).toBe(first.bounties);
    expect(second.ascent).toBe(first.ascent);
  });

  it('replaces the wallet, the bounties and the records each on their own', async () => {
    await seed();
    await useGame.getState().load();
    let before = useGame.getState();
    await putWallet({ spent: 4, owned: ['Chalk bag'], walls: [], wall: null });
    await useGame.getState().load();
    expect(useGame.getState().wallet).not.toBe(before.wallet);
    expect(useGame.getState().wallet.spent).toBe(4);

    before = useGame.getState();
    await putBounties([]);
    await useGame.getState().load();
    expect(useGame.getState().bounties).not.toBe(before.bounties);
    expect(useGame.getState().bounties).toEqual([]);

    before = useGame.getState();
    await putAscent({ ...EMPTY_ASCENT, runs: 3, best: { ascent: 120, freesolo: 0 } });
    await useGame.getState().load();
    expect(useGame.getState().ascent).not.toBe(before.ascent);
    expect(useGame.getState().ascent.runs).toBe(3);
    expect(useGame.getState().ledger).toBe(before.ledger);
  });
});

describe('the projects store', () => {
  it('keeps the projects and the dismissed list when a second read says the same', async () => {
    await putProject(newProject({ name: 'Arête', grade: 'V5', scale: 'V' }));
    const db = await getDb();
    await db.put('profile', { key: 'project-suggestions', value: ['V6'] } as never);
    await useProjects.getState().load();
    const first = useProjects.getState();
    expect(first.projects).toHaveLength(1);
    expect(first.dismissed).toEqual(['V6']);
    await useProjects.getState().load();
    expect(useProjects.getState().projects).toBe(first.projects);
    expect(useProjects.getState().dismissed).toBe(first.dismissed);
  });

  it('replaces the projects when one changed, and leaves the dismissed list', async () => {
    const project = await putProject(newProject({ name: 'Arête', grade: 'V5', scale: 'V' }));
    await useProjects.getState().load();
    const first = useProjects.getState();
    await putProject({ ...project, name: 'The Arête' });
    await useProjects.getState().load();
    expect(useProjects.getState().projects).not.toBe(first.projects);
    expect(useProjects.getState().projects[0]!.name).toBe('The Arête');
    expect(useProjects.getState().dismissed).toBe(first.dismissed);
  });

  it('replaces the dismissed list when it changed', async () => {
    await useProjects.getState().load();
    const first = useProjects.getState().dismissed;
    const db = await getDb();
    await db.put('profile', { key: 'project-suggestions', value: ['V7'] } as never);
    await useProjects.getState().load();
    expect(useProjects.getState().dismissed).not.toBe(first);
    expect(useProjects.getState().dismissed).toEqual(['V7']);
  });
});

describe('the objectives store', () => {
  const objective = (name: string) => ({ id: 'o1', name, targetDate: '2026-12-01', updatedAt: '2026-09-01T00:00:00.000Z' });

  it('keeps the list when a second read says the same, and replaces it when not', async () => {
    const db = await getDb();
    await db.put('profile', { key: 'objectives', value: [objective('Send the roof')] } as never);
    await useObjectives.getState().load();
    const first = useObjectives.getState().objectives;
    expect(first).toHaveLength(1);
    await useObjectives.getState().load();
    expect(useObjectives.getState().objectives).toBe(first);

    await db.put('profile', { key: 'objectives', value: [objective('Send the big roof')] } as never);
    await useObjectives.getState().load();
    expect(useObjectives.getState().objectives).not.toBe(first);
  });
});

describe('the metrics store', () => {
  it('keeps the entries when a second read says the same, and replaces them when not', async () => {
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-09-01', value: 20 });
    await useMetrics.getState().load();
    const first = useMetrics.getState().entries;
    expect(first).toHaveLength(1);
    await useMetrics.getState().load();
    expect(useMetrics.getState().entries).toBe(first);

    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-09-01', value: 22 });
    await useMetrics.getState().load();
    expect(useMetrics.getState().entries).not.toBe(first);
    expect(useMetrics.getState().entries[0]!.value).toBe(22);
  });
});

describe('the templates store', () => {
  const template = (name: string) => ({ id: 't1', name, createdAt: '2026-09-01T00:00:00.000Z' });

  it('keeps the list when a second read says the same, and replaces it when not', async () => {
    const db = await getDb();
    await db.put('profile', { key: 'templates', value: [template('Board night')] } as never);
    await useTemplates.getState().load();
    const first = useTemplates.getState().templates;
    expect(first).toHaveLength(1);
    await useTemplates.getState().load();
    expect(useTemplates.getState().templates).toBe(first);

    await db.put('profile', { key: 'templates', value: [template('Long board night')] } as never);
    await useTemplates.getState().load();
    expect(useTemplates.getState().templates).not.toBe(first);
  });
});

describe("the climber's own programs", () => {
  it('keeps the list when a second read says the same, and replaces it when not', async () => {
    const program = { ...blankProgram('My block'), id: 'custom_test' };
    await putCustomProgram(program as never);
    await useCustomPrograms.getState().load();
    const first = useCustomPrograms.getState().custom;
    expect(first).toHaveLength(1);
    await useCustomPrograms.getState().load();
    expect(useCustomPrograms.getState().custom).toBe(first);

    await putCustomProgram({ ...program, name: 'My long block' } as never);
    await useCustomPrograms.getState().load();
    expect(useCustomPrograms.getState().custom).not.toBe(first);
    expect(useCustomPrograms.getState().custom[0]!.name).toBe('My long block');
  });
});
