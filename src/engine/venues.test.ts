import { describe, expect, it } from 'vitest';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import type { Objective } from './objectives';
import { describeVenues, venueKey, venueSuggestions, venues } from './venues';

/**
 * Where you climbed (PLAN.md M88b).
 *
 * The milestone names one field. There are three — `session.fields.location`,
 * `Project.location` and `Objective.location` — rendered everywhere and
 * grouped nowhere.
 */

const at = (date: string, location?: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    ...(location === undefined ? {} : { fields: { location } }),
    ...patch,
  }) as unknown as Session;

const project = (location?: string): Project =>
  ({ id: `p${location ?? ''}`, name: 'X', grade: 'V5', scale: 'V', setting: 'indoor', status: 'active', beta: [], createdAt: '', updatedAt: '', ...(location ? { location } : {}) }) as Project;

const objective = (location?: string): Objective =>
  ({ id: `o${location ?? ''}`, name: 'X', kind: 'route', status: 'open', requirements: [], ...(location ? { location } : {}) }) as unknown as Objective;

describe('the key two spellings share', () => {
  it('ignores case and surrounding space', () => {
    expect(venueKey('  The Works ')).toBe(venueKey('the works'));
  });

  it('collapses space inside the name', () => {
    expect(venueKey('the  works')).toBe(venueKey('the works'));
  });

  /**
   * Deliberately timid: "The Works" and "Works" may well be the same crag
   * and the app cannot know it. A grouping that guessed would silently
   * merge two real places that happen to read alike.
   */
  it('does not guess past that', () => {
    expect(venueKey('The Works')).not.toBe(venueKey('Works'));
    expect(venueKey('St. Bees')).not.toBe(venueKey('St Bees'));
  });

  it('is empty for a name that is only space', () => {
    expect(venueKey('   ')).toBe('');
  });
});

describe('reading the places off the log', () => {
  it('counts the days at a place, not the sessions', () => {
    const list = venues({ sessions: [at('2026-09-01', 'The Works'), at('2026-09-01', 'The Works'), at('2026-09-03', 'The Works')] });
    expect(list[0]).toMatchObject({ name: 'The Works', sessions: 3, days: 2 });
  });

  it('groups two spellings of one place', () => {
    const list = venues({ sessions: [at('2026-09-01', 'The Works'), at('2026-09-02', 'the works')] });
    expect(list).toHaveLength(1);
    expect(list[0]?.days).toBe(2);
  });

  /**
   * A climber who has switched from "the works" to "The Works" is telling
   * the app which one they mean; a tie broken alphabetically would keep
   * showing the one they stopped typing.
   */
  it('shows the most recent spelling when two are used as often', () => {
    const list = venues({ sessions: [at('2026-09-01', 'the works'), at('2026-09-09', 'The Works')] });
    expect(list[0]?.name).toBe('The Works');
  });

  it('shows the spelling used most', () => {
    const list = venues({
      sessions: [at('2026-09-01', 'the works'), at('2026-09-02', 'The Works'), at('2026-09-03', 'The Works')],
    });
    expect(list[0]?.name).toBe('The Works');
    expect(list[0]?.spellings).toEqual(['The Works', 'the works']);
  });

  it('counts outdoor days separately', () => {
    const list = venues({
      sessions: [at('2026-09-01', 'Stanage', { mode: 'outdoor' }), at('2026-09-02', 'Stanage')],
    });
    expect(list[0]).toMatchObject({ days: 2, outdoorDays: 1 });
  });

  it('ignores a session that was never finished', () => {
    expect(venues({ sessions: [at('2026-09-01', 'Stanage', { completed: false })] })).toEqual([]);
  });

  it('ignores a session that named no place', () => {
    expect(venues({ sessions: [at('2026-09-01'), at('2026-09-02', '  ')] })).toEqual([]);
  });

  it('puts the most-visited first', () => {
    const list = venues({
      sessions: [at('2026-09-01', 'Rarely'), at('2026-09-02', 'Often'), at('2026-09-03', 'Often')],
    });
    expect(list.map((v) => v.name)).toEqual(['Often', 'Rarely']);
  });
});

/**
 * The finding the milestone missed: three independent free-text strings,
 * rendered everywhere and grouped nowhere.
 */
describe('the three places a location is written', () => {
  it('counts a project at the same place as the sessions', () => {
    const list = venues({ sessions: [at('2026-09-01', 'The Works')], projects: [project('the works')] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ days: 1, projects: 1 });
  });

  it('counts an objective there too', () => {
    const list = venues({ sessions: [at('2026-09-01', 'Stanage')], objectives: [objective('Stanage')] });
    expect(list[0]?.objectives).toBe(1);
  });

  // A crag you have not climbed at yet is still a place you have named.
  it('knows a place named only by an objective', () => {
    const list = venues({ objectives: [objective('Yosemite')] });
    expect(list[0]).toMatchObject({ name: 'Yosemite', days: 0, sessions: 0, objectives: 1 });
  });
});

describe('what the inputs offer back', () => {
  it('offers every spelling, not only the winning one', () => {
    const list = venues({ sessions: [at('2026-09-01', 'The Works'), at('2026-09-02', 'the works')] });
    expect(venueSuggestions(list)).toEqual(['The Works', 'the works']);
  });

  it('offers nothing when nothing has been typed', () => {
    expect(venueSuggestions(venues({}))).toEqual([]);
  });

  it('offers a place named only on a project', () => {
    expect(venueSuggestions(venues({ projects: [project('Camp 4')] }))).toEqual(['Camp 4']);
  });
});

describe('said out loud', () => {
  const say = (input: Parameters<typeof venues>[0]) => describeVenues(venues(input));

  it('says nothing with nowhere climbed', () => {
    expect(say({})).toBeNull();
    expect(say({ objectives: [objective('Yosemite')] })).toBeNull();
  });

  it('names the one place when there is only one', () => {
    expect(say({ sessions: [at('2026-09-01', 'The Works'), at('2026-09-02', 'The Works')] })).toMatch(
      /^Every session you have named a place for was at The Works — 2 days\.$/,
    );
  });

  it('leads with where you climb most', () => {
    expect(
      say({ sessions: [at('2026-09-01', 'Rarely'), at('2026-09-02', 'Often'), at('2026-09-03', 'Often')] }),
    ).toMatch(/^You climb at Often most — 2 days of 3 across 2 places\./);
  });

  it('names the places you go outside', () => {
    const said = say({
      sessions: [
        at('2026-09-01', 'The Works'),
        at('2026-09-02', 'Stanage', { mode: 'outdoor' }),
        at('2026-09-03', 'Stanage', { mode: 'outdoor' }),
      ],
    });
    expect(said).toMatch(/Outdoors: Stanage \(2\)\.$/);
  });

  it('stays quiet about outdoors when there has been none', () => {
    expect(say({ sessions: [at('2026-09-01', 'The Works'), at('2026-09-02', 'The Works')] })).not.toMatch(
      /Outdoors/,
    );
  });
});
