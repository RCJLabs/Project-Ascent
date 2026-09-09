import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import type { MetricEntry } from '@/db/metrics';
import { buildJournal, byMonth, extractTags, filterJournal, journalTags } from './journal';

let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, ...patch });
}

function project(patch: Partial<Project> = {}): Project {
  return newProject({ name: 'The Prow', grade: 'V8', scale: 'V', id: 'p1', ...patch });
}

describe('extractTags', () => {
  it('finds hashtags and folds their case', () => {
    expect(extractTags('Felt strong on #Crimps and #crimps again, #Steep-Cave too')).toEqual([
      'crimps',
      'steep-cave',
    ]);
  });

  it('ignores a bare hash and a hash mid-word', () => {
    expect(extractTags('grade # and a#b')).toEqual([]);
  });

  it('handles accents and numbers', () => {
    expect(extractTags('#arête #v8')).toEqual(['arête', 'v8']);
  });
});

describe('buildJournal', () => {
  it('pulls session notes, beta, attempt notes and assessment notes into one timeline', () => {
    const sessions = [
      session('2026-09-01', { notes: 'Felt flat all evening.' }),
      session('2026-09-05', {
        projectAttempts: [
          { id: 'a1', projectId: 'p1', outcome: 'fell-crux', count: 2, note: 'Right hand slipped both times.' },
        ],
      }),
    ];
    const projects = [
      project({ beta: [{ id: 'b1', date: '2026-09-03', text: 'Left heel by the arête.' }] }),
    ];
    const metrics: MetricEntry[] = [
      { metricId: 'max_pullups', date: '2026-09-07', value: 14, note: 'Fresh, after a rest day.' },
    ];

    const journal = buildJournal({ sessions, projects, metrics });
    expect(journal.map((e) => e.kind)).toEqual(['assessment', 'attempt', 'beta', 'session']);
    expect(journal.map((e) => e.date)).toEqual(['2026-09-07', '2026-09-05', '2026-09-03', '2026-09-01']);
  });

  it('names the source and links back to where it was written', () => {
    const journal = buildJournal({
      sessions: [
        session('2026-09-05', {
          projectAttempts: [{ id: 'a1', projectId: 'p1', outcome: 'send', count: 1, note: 'Finally.' }],
        }),
      ],
      projects: [project()],
    });
    expect(journal[0]).toMatchObject({
      kind: 'attempt',
      title: 'The Prow',
      detail: 'Sent it',
      href: '/projects/p1',
      projectId: 'p1',
    });
  });

  it('carries the assessment result alongside its note', () => {
    const journal = buildJournal({
      metrics: [{ metricId: 'max_hang_20mm_7s', date: '2026-09-07', value: 34, note: 'Half crimp only.' }],
    });
    expect(journal[0]).toMatchObject({ title: 'Max Hang 20mm 7s', detail: '34 BW+lbs', href: '/assessments/max_hang_20mm_7s' });
  });

  it('uses the program session type as the title when it can', () => {
    const withProgram = buildJournal({
      sessions: [session('2026-09-01', { notes: 'x', programId: 'iron_grip', sessionTypeId: 'fp' })],
    });
    expect(withProgram[0]!.title).not.toBe('Session');

    const without = buildJournal({ sessions: [session('2026-09-01', { notes: 'x' })] });
    expect(without[0]!.title).toBe('Session');
  });

  it('skips blank and whitespace-only notes', () => {
    const journal = buildJournal({
      sessions: [session('2026-09-01', { notes: '   ' }), session('2026-09-02', {})],
      projects: [project({ beta: [{ id: 'b1', date: '2026-09-03', text: '  ' }] })],
      metrics: [{ metricId: 'max_pullups', date: '2026-09-04', value: 10 }],
    });
    expect(journal).toEqual([]);
  });

  it('gives every entry a stable id, so rebuilding does not reshuffle', () => {
    const sources = {
      sessions: [session('2026-09-01', { notes: 'a' })],
      projects: [project({ beta: [{ id: 'b1', date: '2026-09-01', text: 'b' }] })],
    };
    const first = buildJournal(sources);
    const second = buildJournal(sources);
    expect(second.map((e) => e.id)).toEqual(first.map((e) => e.id));
    expect(new Set(first.map((e) => e.id)).size).toBe(first.length);
  });

  it('survives an attempt on a project that no longer exists', () => {
    const journal = buildJournal({
      sessions: [
        session('2026-09-05', {
          projectAttempts: [{ id: 'a1', projectId: 'gone', outcome: 'worked', count: 1, note: 'Still here.' }],
        }),
      ],
      projects: [],
    });
    expect(journal[0]).toMatchObject({ title: 'Project', text: 'Still here.' });
  });

  it('is empty, not broken, with nothing at all', () => {
    expect(buildJournal({})).toEqual([]);
  });
});

describe('filterJournal', () => {
  const journal = buildJournal({
    sessions: [
      session('2026-07-04', { notes: 'Overhang felt easy. #crimps' }),
      session('2026-09-01', { notes: 'Shoulder twinge on the last burn.' }),
    ],
    projects: [project({ beta: [{ id: 'b1', date: '2026-08-15', text: 'Heel hook beta for the #crimps section.' }] })],
    metrics: [{ metricId: 'max_pullups', date: '2026-08-20', value: 14, note: 'Felt strong.' }],
  });

  it('returns everything with no filters', () => {
    expect(filterJournal(journal)).toHaveLength(4);
  });

  it('requires every search term, not just one', () => {
    expect(filterJournal(journal, { query: 'heel beta' })).toHaveLength(1);
    expect(filterJournal(journal, { query: 'heel overhang' })).toHaveLength(0);
  });

  it('searches the title and detail as well as the text', () => {
    expect(filterJournal(journal, { query: 'prow' })).toHaveLength(1);
    expect(filterJournal(journal, { query: 'pull-ups' })).toHaveLength(1);
  });

  it('ignores case', () => {
    expect(filterJournal(journal, { query: 'SHOULDER' })).toHaveLength(1);
  });

  it('treats a #term in the query as a tag filter', () => {
    expect(filterJournal(journal, { query: '#crimps' })).toHaveLength(2);
    expect(filterJournal(journal, { query: '#nothing' })).toHaveLength(0);
  });

  it('filters by kind, project and tag', () => {
    expect(filterJournal(journal, { kinds: ['beta'] })).toHaveLength(1);
    expect(filterJournal(journal, { kinds: ['session', 'assessment'] })).toHaveLength(3);
    expect(filterJournal(journal, { projectId: 'p1' })).toHaveLength(1);
    expect(filterJournal(journal, { tag: 'crimps' })).toHaveLength(2);
  });

  it('filters by an inclusive date range', () => {
    expect(filterJournal(journal, { from: '2026-08-15', to: '2026-08-20' })).toHaveLength(2);
    expect(filterJournal(journal, { from: '2026-09-02' })).toHaveLength(0);
    expect(filterJournal(journal, { to: '2026-07-04' })).toHaveLength(1);
  });

  it('combines filters', () => {
    expect(filterJournal(journal, { tag: 'crimps', kinds: ['session'] })).toHaveLength(1);
  });

  it('ignores an empty kind list rather than hiding everything', () => {
    expect(filterJournal(journal, { kinds: [] })).toHaveLength(4);
  });
});

describe('journalTags', () => {
  it('counts tags, most used first', () => {
    const journal = buildJournal({
      sessions: [
        session('2026-09-01', { notes: '#crimps #power' }),
        session('2026-09-02', { notes: '#crimps' }),
        session('2026-09-03', { notes: '#ankle' }),
      ],
    });
    expect(journalTags(journal)).toEqual([
      { tag: 'crimps', count: 2 },
      { tag: 'ankle', count: 1 },
      { tag: 'power', count: 1 },
    ]);
  });
});

describe('byMonth', () => {
  it('groups a newest-first timeline into contiguous months', () => {
    const journal = buildJournal({
      sessions: [
        session('2026-09-01', { notes: 'a' }),
        session('2026-09-20', { notes: 'b' }),
        session('2026-08-11', { notes: 'c' }),
      ],
    });
    const groups = byMonth(journal);
    expect(groups.map((g) => g.month)).toEqual(['2026-09', '2026-08']);
    expect(groups[0]!.entries).toHaveLength(2);
  });
});
