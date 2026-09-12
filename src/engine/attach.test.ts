import { describe, expect, it } from 'vitest';
import { MAX_PER_OWNER } from '@/db/media';
import { newSession, type Session } from '@/db/sessions';
import { newProject, type Project } from '@/db/projects';
import { RECENT_DAYS, attachTargets, describeEmpty } from './attach';

/**
 * Where a photo can go (PLAN.md M111b).
 *
 * The rules worth holding are the refusals: never a day that does not
 * exist, never a project that has been sent or shelved, and never a
 * destination that vanishes when it fills up.
 */

const TODAY = '2026-09-12';

const day = (date: string, patch: Partial<Session> = {}): Session =>
  newSession(date, 0, { completed: true, ...patch });

const project = (id: string, patch: Partial<Project> = {}): Project => ({
  ...newProject({ name: `Project ${id}`, grade: 'V7', scale: 'V' }),
  id,
  ...patch,
});

const build = (patch: Partial<Parameters<typeof attachTargets>[0]> = {}) =>
  attachTargets({ sessions: [], projects: [], counts: new Map(), today: TODAY, ...patch });

describe('what is offered', () => {
  it('lists a logged session', () => {
    const targets = build({ sessions: [day(TODAY)] });
    expect(targets.map((t) => t.kind)).toEqual(['session']);
    expect(targets[0]?.owner).toBe(`session:${TODAY}#0`);
  });

  it('lists an open project', () => {
    const targets = build({ projects: [project('p1')] });
    expect(targets.map((t) => t.owner)).toEqual(['project:p1']);
  });

  it('puts sessions before projects', () => {
    // A photo taken today belongs to today far more often than to a
    // project, and the project is the one a climber will scroll for.
    const targets = build({ sessions: [day(TODAY)], projects: [project('p1')] });
    expect(targets.map((t) => t.kind)).toEqual(['session', 'project']);
  });

  it('puts the newest session first', () => {
    const targets = build({
      sessions: [day('2026-09-05'), day(TODAY), day('2026-09-09')],
    });
    expect(targets.map((t) => t.detail)).toEqual([TODAY, '2026-09-09', '2026-09-05']);
  });

  it('keeps two sessions on one day in a stable order', () => {
    // The id encodes the index, so descending id is descending index. A
    // comparator that returned the same value either way would let two
    // reads of the same list disagree.
    const first = newSession(TODAY, 0, { completed: true });
    const second = newSession(TODAY, 1, { completed: true });
    expect(build({ sessions: [first, second] }).map((t) => t.owner)).toEqual([
      `session:${TODAY}#1`,
      `session:${TODAY}#0`,
    ]);
    expect(build({ sessions: [second, first] }).map((t) => t.owner)).toEqual([
      `session:${TODAY}#1`,
      `session:${TODAY}#0`,
    ]);
  });
});

describe('what is refused', () => {
  it('never invents a session for a day that has none', () => {
    // The rule the page is built around. A day created as a side effect of
    // filing a photo is a day the review, the streak and the consistency
    // grid all have to explain.
    expect(build()).toEqual([]);
  });

  it('leaves out a session older than the window', () => {
    expect(build({ sessions: [day('2026-08-01')] })).toEqual([]);
  });

  it('keeps one exactly at the edge of it', () => {
    // Off-by-one on a boundary nobody would notice by hand: a fortnight ago
    // is inside a fourteen-day window.
    const edge = new Date(`${TODAY}T00:00:00`);
    edge.setDate(edge.getDate() - RECENT_DAYS);
    expect(build({ sessions: [day(edge.toISOString().slice(0, 10))] })).toHaveLength(1);
  });

  it('leaves out a session dated in the future', () => {
    // Planned days exist. A photo cannot belong to one that has not
    // happened, and offering it would read as a bug.
    expect(build({ sessions: [day('2026-09-20')] })).toEqual([]);
  });

  for (const status of ['sent', 'shelved'] as const) {
    it(`leaves out a ${status} project`, () => {
      expect(build({ projects: [project('p1', { status })] })).toEqual([]);
    });
  }
});

describe('an owner that is already full', () => {
  const full = new Map([[`session:${TODAY}#0`, MAX_PER_OWNER]]);

  it('is still listed', () => {
    // Hiding it makes a destination a climber can see today disappear
    // tomorrow, which is a thing to hunt for rather than a limit to read.
    expect(build({ sessions: [day(TODAY)], counts: full })).toHaveLength(1);
  });

  it('is marked full', () => {
    expect(build({ sessions: [day(TODAY)], counts: full })[0]?.full).toBe(true);
  });

  it('is not full one photo short', () => {
    const nearly = new Map([[`session:${TODAY}#0`, MAX_PER_OWNER - 1]]);
    expect(build({ sessions: [day(TODAY)], counts: nearly })[0]?.full).toBe(false);
  });

  it('carries the count either way', () => {
    expect(build({ sessions: [day(TODAY)], counts: new Map([[`session:${TODAY}#0`, 3]]) })[0]?.count).toBe(3);
  });
});

describe('the label', () => {
  it('is where you climbed, when you said', () => {
    const targets = build({ sessions: [day('2026-09-10', { fields: { location: 'Stanage' } })] });
    expect(targets[0]?.label).toBe('Stanage');
  });

  it('ignores a location that is only spaces', () => {
    const targets = build({ sessions: [day('2026-09-10', { fields: { location: '   ' } })] });
    expect(targets[0]?.label).not.toBe('   ');
  });

  it('says Today for today', () => {
    expect(build({ sessions: [day(TODAY)] })[0]?.label).toBe('Today');
  });

  it('distinguishes an outdoor day from an indoor one', () => {
    expect(build({ sessions: [day('2026-09-10', { mode: 'outdoor' })] })[0]?.label).toBe('Outdoors');
    expect(build({ sessions: [day('2026-09-10', { mode: 'indoor' })] })[0]?.label).toBe('Session');
  });

  it('always carries the date as well, whatever the label says', () => {
    // Two days at the same crag are two identical rows without it.
    const targets = build({
      sessions: [
        day('2026-09-10', { fields: { location: 'Stanage' } }),
        day('2026-09-11', { fields: { location: 'Stanage' } }),
      ],
    });
    expect(targets.map((t) => t.detail)).toEqual(['2026-09-11', '2026-09-10']);
  });
});

describe('why there is nothing to attach to', () => {
  it('says nothing at all when there is somewhere to put it', () => {
    expect(describeEmpty(build({ sessions: [day(TODAY)] }), true)).toBeNull();
  });

  it('tells a new climber what a photo attaches to', () => {
    expect(describeEmpty([], false)).toMatch(/Log a session/);
  });

  it('tells a returning one that the window is the problem', () => {
    // Not the same sentence: this climber has logged before and would read
    // "log a session" as the app having forgotten them.
    const said = describeEmpty([], true) ?? '';
    expect(said).toMatch(new RegExp(`last ${RECENT_DAYS} days`));
    expect(said).not.toMatch(/start a project/);
  });

  it('tells a full one to make room rather than to log more', () => {
    const targets = build({
      sessions: [day(TODAY)],
      counts: new Map([[`session:${TODAY}#0`, MAX_PER_OWNER]]),
    });
    const said = describeEmpty(targets, true) ?? '';
    expect(said).toMatch(/Remove one/);
    expect(said, 'it told a full climber to log a session').not.toMatch(/Log the day first/);
  });
});
