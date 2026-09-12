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

describe('the hardest sent at each place', () => {
  const at = (place: string, date: string, grades: string[], mode: 'indoor' | 'outdoor' = 'outdoor') =>
    ({
      id: `${date}#${place}`,
      date,
      completed: true,
      mode,
      fields: { location: place },
      climbs: grades.map((grade, i) => ({
        id: `${date}-${i}`,
        grade,
        scale: grade.startsWith('V') ? ('V' as const) : ('YDS' as const),
        count: 1,
        result: 'send' as const,
      })),
    }) as never;

  const best = (sessions: unknown[], name: string) =>
    venues({ sessions: sessions as never }).find((v) => v.name === name)!.best;

  it('reports the hardest boulder', () => {
    expect(best([at('Stanage', '2026-09-01', ['V3', 'V6', 'V4'])], 'Stanage').V).toBe('V6');
  });

  it('keeps the two ladders apart', () => {
    // Grades vary by crag, which is the point of the whole reading — and a
    // crag with both needs both numbers, not whichever ordinal is larger.
    const b = best([at('Malham', '2026-09-01', ['V4', '5.12a'])], 'Malham');
    expect(b.V).toBe('V4');
    expect(b.YDS).toBe('5.12a');
  });

  it('is null for a ladder nothing was climbed on', () => {
    const b = best([at('Stanage', '2026-09-01', ['V3'])], 'Stanage');
    expect(b.V).toBe('V3');
    expect(b.YDS).toBe(null);
  });

  it('does not count an attempt', () => {
    const session = at('Stanage', '2026-09-01', ['V8']);
    (session as { climbs: { result: string }[] }).climbs[0]!.result = 'attempt';
    expect(best([session], 'Stanage').V).toBe(null);
  });

  it('keeps two places apart', () => {
    const sessions = [
      at('Stanage', '2026-09-01', ['V6']),
      at('Burbage', '2026-09-02', ['V3']),
    ];
    expect(best(sessions, 'Stanage').V).toBe('V6');
    expect(best(sessions, 'Burbage').V).toBe('V3');
  });

  it('counts a gym as readily as a crag', () => {
    // A place is almost always one mode or the other, so this is per venue
    // rather than per mode — and "my best at The Works" is a real question.
    expect(best([at('The Works', '2026-09-01', ['V5'], 'indoor')], 'The Works').V).toBe('V5');
  });

  it('collects every session at the place, however it was spelled', () => {
    // Same crag, two spellings. `venueKey` already folds them and the best
    // has to fold with them. Asserted on the single folded venue rather
    // than by name: with one use of each spelling the display name breaks
    // on *recency*, which is deliberate — a climber who switched from "the
    // works" to "The Works" is telling the app which one they mean.
    const list = venues({
      sessions: [
        at('Stanage', '2026-09-01', ['V3']),
        at('stanage', '2026-09-08', ['V7']),
      ] as never,
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.best.V).toBe('V7');
  });

  it('survives a record with no climbs array at all', () => {
    // `Session.climbs` is not optional and real records violate it anyway —
    // M105b found the spreadsheet writers crashing on exactly this, and
    // M112e made the rest-day predicate defend against it. The venue scan
    // reads `climbs` too, and a crash here takes the whole career page.
    const bare = {
      id: 'x', date: '2026-09-01', completed: true, mode: 'outdoor',
      fields: { location: 'Stanage' },
    } as never;
    const list = venues({ sessions: [bare] });
    expect(list).toHaveLength(1);
    expect(list[0]!.best).toEqual({ V: null, YDS: null });
    expect(list[0]!.days).toBe(1);
  });

  it('is null for a place known only from a project', () => {
    const list = venues({ projects: [{ location: 'Font' }] as never });
    expect(list.find((v) => v.name === 'Font')!.best).toEqual({ V: null, YDS: null });
  });
});
