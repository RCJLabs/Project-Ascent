import { describe, expect, it } from 'vitest';
import { groupResults, scoreItem, search, type SearchItem } from './search';

const item = (patch: Partial<SearchItem> & Pick<SearchItem, 'title' | 'kind'>): SearchItem => ({
  id: patch.title,
  href: '/x',
  ...patch,
});

const INDEX: SearchItem[] = [
  item({ kind: 'page', title: 'Glossary', keywords: ['terms', 'jargon'] }),
  item({ kind: 'page', title: 'Log', keywords: ['session'] }),
  item({ kind: 'page', title: 'Weekly review' }),
  item({ kind: 'term', title: 'Half Crimp', detail: 'The standard climbing grip.' }),
  item({ kind: 'term', title: 'Flapper', detail: 'A piece of skin that tears off.' }),
  item({ kind: 'program', title: 'Iron Grip', detail: 'Finger strength and conditioning' }),
  item({ kind: 'project', title: 'Midnight Lightning' }),
  item({ kind: 'session', title: 'Tuesday session', detail: 'V5 × 4', date: '2026-09-01' }),
  item({ kind: 'session', title: 'Thursday session', detail: 'V5 × 2', date: '2026-09-03' }),
];

describe('scoring', () => {
  it('finds nothing for an empty query', () => {
    expect(scoreItem(INDEX[0]!, '')).toBe(0);
    expect(scoreItem(INDEX[0]!, '   ')).toBe(0);
  });

  it('ranks a title prefix above a word inside the title', () => {
    const prefix = scoreItem(item({ kind: 'term', title: 'Crimp grip' }), 'crimp');
    const inside = scoreItem(item({ kind: 'term', title: 'Half Crimp' }), 'crimp');
    expect(prefix).toBeGreaterThan(inside);
  });

  it('ranks a word start above a mid-word match', () => {
    const word = scoreItem(item({ kind: 'term', title: 'Half Crimp' }), 'cri');
    const mid = scoreItem(item({ kind: 'term', title: 'Recrimping' }), 'cri');
    expect(word).toBeGreaterThan(mid);
  });

  it('ranks a title match above a body-only match', () => {
    const title = scoreItem(item({ kind: 'term', title: 'Skin' }), 'skin');
    const body = scoreItem(item({ kind: 'term', title: 'Flapper', detail: 'A piece of skin' }), 'skin');
    expect(title).toBeGreaterThan(body);
  });

  it('matches keywords a climber never sees', () => {
    expect(scoreItem(item({ kind: 'page', title: 'Glossary', keywords: ['jargon'] }), 'jargon')).toBeGreaterThan(0);
  });

  it('does not guess', () => {
    // A search that offers "Deadlift" for "deadhang" is worse than one that
    // offers nothing, for the same reason the glossary lookup is exact.
    expect(scoreItem(item({ kind: 'term', title: 'Deadlift' }), 'deadhang')).toBe(0);
    expect(scoreItem(item({ kind: 'term', title: 'Crimp' }), 'crmp')).toBe(0);
  });

  it('ignores case and surrounding space', () => {
    expect(scoreItem(item({ kind: 'term', title: 'Half Crimp' }), '  HALF  ')).toBeGreaterThan(0);
  });
});

describe('search', () => {
  it('puts the page above the term when both match equally', () => {
    const results = search(INDEX, 'glossary');
    expect(results[0]?.kind).toBe('page');
  });

  it('prefers the short direct answer', () => {
    // "Log" the page, not "Weekly review" which merely mentions sessions.
    expect(search(INDEX, 'log')[0]?.title).toBe('Log');
  });

  it('orders sessions newest first when they tie', () => {
    const sessions = search(INDEX, 'session', { kind: 'session' });
    expect(sessions.map((s) => s.date)).toEqual(['2026-09-03', '2026-09-01']);
  });

  it('filters to one kind', () => {
    const terms = search(INDEX, 'crimp', { kind: 'term' });
    expect(terms.every((r) => r.kind === 'term')).toBe(true);
  });

  it('respects the limit', () => {
    expect(search(INDEX, 'session', { limit: 1 })).toHaveLength(1);
  });

  it('returns nothing rather than everything for nonsense', () => {
    expect(search(INDEX, 'qwertyuiop')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    // The browse list is a different thing; an empty search is not "all".
    expect(search(INDEX, '')).toEqual([]);
  });
});

describe('grouping', () => {
  it('keeps a fixed order and drops empty groups', () => {
    const groups = groupResults(search(INDEX, 'crimp'));
    expect(groups.map((g) => g.kind)).toEqual(['term']);
  });

  it('loses nothing', () => {
    const results = search(INDEX, 'session');
    const total = groupResults(results).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(results.length);
  });

  it('puts pages before sessions', () => {
    const groups = groupResults(search(INDEX, 'session'));
    const kinds = groups.map((g) => g.kind);
    if (kinds.includes('page') && kinds.includes('session')) {
      expect(kinds.indexOf('page')).toBeLessThan(kinds.indexOf('session'));
    }
  });
});
