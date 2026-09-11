import { describe, expect, it } from 'vitest';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { projectOwner, sessionOwner } from '@/db/media';
import { photoCount, pickPhotos, type PickInput } from './photos';

/**
 * Which pictures a retrospective shows (PLAN.md M92).
 *
 * Nothing here touches a blob: the input is the owner index — who has
 * photos — and the output names the handful a page should then read.
 */

const session = (date: string, i = 0): Session =>
  ({ id: `${date}#${i}`, date, planned: false, completed: true, rewarded: true, mode: 'indoor', climbs: [] }) as unknown as Session;

const project = (id: string, patch: Partial<Project> = {}): Project =>
  ({ id, name: `Project ${id}`, grade: 'V5', scale: 'V', setting: 'indoor', status: 'active', beta: [], createdAt: '', updatedAt: '', ...patch }) as Project;

/** `owners` from a list of [ownerKey, howMany]. */
const index = (pairs: [string, number][]): Map<string, string[]> =>
  new Map(pairs.map(([owner, n]) => [owner, Array.from({ length: n }, (_, i) => `${owner}-m${i}`)]));

function pick(patch: Partial<PickInput>) {
  return pickPhotos({
    owners: new Map(),
    sessions: [],
    projects: [],
    from: '2026-01-01',
    to: '2026-12-31',
    limit: 12,
    ...patch,
  });
}

describe('picking a year of pictures', () => {
  it('takes the photos filed on the year’s sessions', () => {
    const s = session('2026-03-04');
    expect(pick({ sessions: [s], owners: index([[sessionOwner(s.id), 2]]) })).toHaveLength(2);
  });

  it('leaves out a session before the range', () => {
    const s = session('2025-03-04');
    expect(pick({ sessions: [s], owners: index([[sessionOwner(s.id), 2]]) })).toEqual([]);
  });

  it('leaves out a session after it', () => {
    const s = session('2027-03-04');
    expect(pick({ sessions: [s], owners: index([[sessionOwner(s.id), 2]]) })).toEqual([]);
  });

  it('leaves out a session with no photos on it', () => {
    expect(pick({ sessions: [session('2026-03-04')], owners: new Map() })).toEqual([]);
  });

  /**
   * Taking the first twelve in date order hands back one busy fortnight
   * and calls it a year.
   */
  it('spreads across the months rather than emptying the first', () => {
    const busy = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((d) => session(d));
    const later = [session('2026-06-01'), session('2026-11-01')];
    const owners = index([...busy, ...later].map((s) => [sessionOwner(s.id), 1] as [string, number]));

    const months = pick({ sessions: [...busy, ...later], owners, limit: 3 }).map((p) => p.date.slice(0, 7));
    expect(months).toEqual(['2026-01', '2026-06', '2026-11']);
  });

  it('comes back to a month once every other has had its turn', () => {
    const jan = [session('2026-01-05'), session('2026-01-06')];
    const jun = [session('2026-06-01')];
    const owners = index([...jan, ...jun].map((s) => [sessionOwner(s.id), 1] as [string, number]));
    const months = pick({ sessions: [...jan, ...jun], owners, limit: 3 }).map((p) => p.date.slice(0, 7));
    expect(months).toEqual(['2026-01', '2026-06', '2026-01']);
  });

  // Round one takes the earliest from each month, so a month's own photos
  // have to be in date order or the grid tells the year backwards.
  it('takes a month’s earliest first', () => {
    // Three, arriving mid-late-early: sorted is none of arrival order,
    // reverse order, or anything else a list that was merely rearranged
    // would produce.
    const sessions = ['2026-01-15', '2026-01-25', '2026-01-05'].map((d) => session(d));
    const owners = index(sessions.map((s) => [sessionOwner(s.id), 1] as [string, number]));
    expect(pick({ sessions, owners, limit: 3 }).map((p) => p.date)).toEqual([
      '2026-01-05',
      '2026-01-15',
      '2026-01-25',
    ]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => session(`2026-0${(i % 9) + 1}-01`, i));
    const owners = index(many.map((s) => [sessionOwner(s.id), 1] as [string, number]));
    expect(pick({ sessions: many, owners, limit: 12 })).toHaveLength(12);
  });

  it('asks for none and gets none', () => {
    const s = session('2026-03-04');
    expect(pick({ sessions: [s], owners: index([[sessionOwner(s.id), 2]]), limit: 0 })).toEqual([]);
  });

  it('gives the same answer twice', () => {
    const sessions = [session('2026-01-05'), session('2026-01-06'), session('2026-06-01')];
    const owners = index(sessions.map((s) => [sessionOwner(s.id), 2] as [string, number]));
    expect(pick({ sessions, owners, limit: 4 })).toEqual(pick({ sessions, owners, limit: 4 }));
  });
});

describe('a project’s photos', () => {
  it('belong to the year it was sent in', () => {
    const p = project('a', { sentDate: '2026-05-02' });
    const picked = pick({ projects: [p], owners: index([[projectOwner(p.id), 1]]) });
    expect(picked).toHaveLength(1);
    expect(picked[0]!.title).toBe('Project a');
    expect(picked[0]!.date).toBe('2026-05-02');
  });

  /**
   * A project spans months and the app has no date for the picture itself.
   * One still in progress is not a record of a year, and filing its beta
   * under a date invented for it would be the app making something up.
   */
  it('stay out of the grid while it is still a project', () => {
    // Created squarely inside the year, so falling back to `createdAt` —
    // a date for the project and not for the picture — would let it in.
    const p = project('a', { createdAt: '2026-02-01T09:00:00.000Z' });
    expect(pick({ projects: [p], owners: index([[projectOwner(p.id), 3]]) })).toEqual([]);
  });

  it('leave the grid when it was sent in another year', () => {
    const p = project('a', { sentDate: '2024-05-02' });
    expect(pick({ projects: [p], owners: index([[projectOwner(p.id), 1]]) })).toEqual([]);
  });

  it('sit beside the sessions’ rather than after them', () => {
    const s = session('2026-01-05');
    const p = project('a', { sentDate: '2026-06-02' });
    const owners = index([
      [sessionOwner(s.id), 1],
      [projectOwner(p.id), 1],
    ]);
    expect(pick({ sessions: [s], projects: [p], owners, limit: 2 }).map((x) => x.title)).toEqual([
      'A session',
      'Project a',
    ]);
  });
});

describe('counting without reading', () => {
  it('says how many are filed on a thing', () => {
    expect(photoCount(index([['session:a', 3]]), 'session:a')).toBe(3);
  });

  it('says none for a thing with none', () => {
    expect(photoCount(new Map(), 'session:a')).toBe(0);
  });
});
