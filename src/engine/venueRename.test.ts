import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import type { Objective } from './objectives';
import { renameVenue, rewriteSize, venueKey, venues } from './venues';

/**
 * Saying two spellings are one place (PLAN.md M283).
 *
 * `venueKey` is deliberately timid and says why. This is the climber
 * answering it — and a rename rather than a stored alias, because the log
 * would otherwise still hold both spellings everywhere except the grouping.
 */

const at = (date: string, location?: string): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'outdoor',
    rpe: 7,
    durationMin: 120,
    warmup: true,
    climbs: [],
    ...(location === undefined ? {} : { fields: { location } }),
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

const project = (id: string, location?: string): Project =>
  ({ id, name: id, grade: 'V5', scale: 'V', status: 'open', ...(location ? { location } : {}) }) as unknown as Project;

const objective = (id: string, location?: string): Objective =>
  ({ id, name: id, kind: 'trip', status: 'training', requirements: [], ...(location ? { location } : {}) }) as unknown as Objective;

describe('renaming a place', () => {
  const log = {
    sessions: [at('2026-06-01', 'Works'), at('2026-06-03', 'works'), at('2026-06-05', 'Malham')],
    projects: [project('p1', 'WORKS'), project('p2', 'Malham')],
    objectives: [
      objective('o1', 'the works'),
      objective('o2', 'Malham'),
      objective('o3', 'WORKS '),
    ],
  };

  it('rewrites every record naming it, whatever the spelling', () => {
    const done = renameVenue(log, venueKey('Works'), 'The Works');
    expect(done.sessions.map((s) => s.fields?.location)).toEqual(['The Works', 'The Works']);
    expect(done.projects.map((p) => p.location)).toEqual(['The Works']);
    // All three record types, and a mutant proved this one was needed: the
    // only objective in the first draft sat at a different key, so nothing
    // ever exercised an objective being rewritten at all.
    expect(done.objectives.map((o) => o.location)).toEqual(['The Works']);
  });

  it('leaves a spelling that is genuinely a different key', () => {
    // "the works" and "Works" differ by more than capitals and spacing, so
    // they are two places until the climber says otherwise — which is the
    // rule `venueKey` states and this must not quietly widen.
    const done = renameVenue(log, venueKey('Works'), 'The Works');
    expect(done.objectives.map((o) => o.id)).not.toContain('o1');
  });

  it('leaves every other place alone', () => {
    const done = renameVenue(log, venueKey('Works'), 'The Works');
    expect([...done.sessions, ...done.projects].every((r) => !/Malham/.test(JSON.stringify(r)))).toBe(true);
  });

  /**
   * The point of it: afterwards they share a key, which is the only thing
   * being one place has ever meant here.
   */
  it('merges two places by making them the same one', () => {
    // "Works", "works", "WORKS " and "the works" — three of them one key,
    // and the fourth a place the app will not merge without being told.
    const before = venues(log).filter((v) => /works/i.test(v.name));
    expect(before).toHaveLength(2);

    const done = renameVenue(log, venueKey('Works'), 'the works');
    const after = venues({
      sessions: log.sessions.map((s) => done.sessions.find((x) => x.id === s.id) ?? s),
      projects: log.projects.map((p) => done.projects.find((x) => x.id === p.id) ?? p),
      // Applied too: a rewrite the caller drops on the floor leaves the
      // place it was meant to merge still standing, which is what this test
      // started reporting the moment an objective was added to the fixture.
      objectives: log.objectives.map((o) => done.objectives.find((x) => x.id === o.id) ?? o),
    }).filter((v) => /works/i.test(v.name));
    expect(after).toHaveLength(1);
    expect(after[0]?.sessions).toBe(2);
  });

  it('changes nothing when the name is already what it says', () => {
    const same = { sessions: [at('2026-06-01', 'Malham')], projects: [], objectives: [] };
    expect(rewriteSize(renameVenue(same, venueKey('Malham'), 'Malham'))).toBe(0);
  });

  /** One record differing only in case is still a record to fix. */
  it('still rewrites a spelling that differs only in case', () => {
    const cased = { sessions: [at('2026-06-01', 'malham')], projects: [], objectives: [] };
    expect(rewriteSize(renameVenue(cased, venueKey('Malham'), 'Malham'))).toBe(1);
  });

  it('tidies the name it is given', () => {
    const done = renameVenue(log, venueKey('Works'), '  The   Works  ');
    expect(done.sessions[0]?.fields?.location).toBe('The Works');
  });

  /**
   * An empty name would delete the place rather than rename it, which is a
   * different thing and not one this offers.
   */
  it('refuses a name with nothing in it', () => {
    expect(rewriteSize(renameVenue(log, venueKey('Works'), '   '))).toBe(0);
  });

  it('never touches a record with no place on it', () => {
    const bare = { sessions: [at('2026-06-01')], projects: [project('p3')], objectives: [] };
    expect(rewriteSize(renameVenue(bare, venueKey('Works'), 'The Works'))).toBe(0);
  });

  it('counts what it would touch, for the screen to say first', () => {
    expect(rewriteSize(renameVenue(log, venueKey('Works'), 'The Works'))).toBe(4);
  });

  /** Everything else on a record survives the rewrite. */
  it('changes the place and nothing else', () => {
    const done = renameVenue(log, venueKey('Works'), 'The Works');
    const before = log.sessions[0]!;
    const after = done.sessions[0]!;
    expect({ ...after, fields: undefined }).toEqual({ ...before, fields: undefined });
  });
});
