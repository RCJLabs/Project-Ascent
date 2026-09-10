import { describe, expect, it } from 'vitest';
import { keyOf, previewImport, visibleRows, type PreviewInput } from './importPreview';

const session = (id: string) => ({ id, date: id.slice(0, 10) });

const input = (patch: Partial<PreviewInput> = {}): PreviewInput => ({
  incoming: {},
  existing: {},
  ...patch,
});

describe('keying a record', () => {
  it('reads each store from its own key path', () => {
    expect(keyOf('sessions', { id: '2026-01-01#0' })).toBe('2026-01-01#0');
    expect(keyOf('profile', { key: 'active-plan' })).toBe('active-plan');
    expect(keyOf('projects', { id: 'p1' })).toBe('p1');
  });

  it('joins a compound key', () => {
    expect(keyOf('metrics', { metricId: 'max-hang', date: '2026-01-01' })).toBe(
      'max-hang 2026-01-01',
    );
  });

  it('refuses to invent a key', () => {
    // Calling an unkeyable record "new" would report an import as safer
    // than it is.
    expect(keyOf('sessions', { date: '2026-01-01' })).toBeNull();
    expect(keyOf('sessions', null)).toBeNull();
    expect(keyOf('sessions', 'not a record')).toBeNull();
    expect(keyOf('metrics', { metricId: 'max-hang' })).toBeNull();
    expect(keyOf('sessions', { id: { nested: true } })).toBeNull();
  });

  it('accepts a numeric key', () => {
    expect(keyOf('game', { key: 7 })).toBe('7');
  });
});

describe('previewing an import', () => {
  it('separates what is new from what is overwritten', () => {
    const preview = previewImport(
      input({
        incoming: { sessions: [session('2026-01-01#0'), session('2026-01-02#0')] },
        existing: { sessions: ['2026-01-01#0'] },
      }),
    );
    const sessions = preview.stores.find((s) => s.store === 'sessions')!;
    expect(sessions.added).toBe(1);
    expect(sessions.overwritten).toBe(1);
    expect(sessions.onlyHere).toBe(0);
  });

  it('counts what replace would delete', () => {
    // The number that matters: records here that the backup does not have.
    const preview = previewImport(
      input({
        incoming: { sessions: [session('2026-01-01#0')] },
        existing: { sessions: ['2026-01-01#0', '2025-06-01#0', '2025-06-03#0'] },
      }),
    );
    expect(preview.stores.find((s) => s.store === 'sessions')!.onlyHere).toBe(2);
    expect(preview.lostByReplace).toBe(2);
  });

  it('loses nothing when the backup is a superset', () => {
    const preview = previewImport(
      input({
        incoming: { sessions: [session('2026-01-01#0'), session('2026-01-02#0')] },
        existing: { sessions: ['2026-01-01#0'] },
      }),
    );
    expect(preview.lostByReplace).toBe(0);
  });

  it('says nothing arrives from an empty file', () => {
    const preview = previewImport(input({ existing: { sessions: ['a', 'b'] } }));
    expect(preview.arriving).toBe(0);
    expect(preview.lostByReplace).toBe(2);
  });

  it('counts a duplicated key once', () => {
    // Two records with the same key leave one record behind, so reporting
    // two would overstate what arrives.
    const preview = previewImport(
      input({ incoming: { sessions: [session('2026-01-01#0'), session('2026-01-01#0')] } }),
    );
    const sessions = preview.stores.find((s) => s.store === 'sessions')!;
    expect(sessions.added).toBe(1);
    expect(sessions.incoming).toBe(2);
  });

  it('reports records it cannot read rather than skipping them quietly', () => {
    const preview = previewImport(
      input({ incoming: { sessions: [session('2026-01-01#0'), { date: 'no id' }] } }),
    );
    expect(preview.unreadable).toBe(1);
    expect(preview.arriving).toBe(1);
  });

  it('counts photos that a replace would clear', () => {
    const withPhotos = previewImport(
      input({ media: { incoming: 0, existing: 12, fileHasMedia: false } }),
    );
    expect(withPhotos.lostByReplace).toBe(12);

    const fileHasThem = previewImport(
      input({ media: { incoming: 3, existing: 12, fileHasMedia: true } }),
    );
    expect(fileHasThem.lostByReplace).toBe(0);
  });

  it('covers every exportable store', () => {
    // A store missing from the preview is a store whose loss goes unreported.
    const preview = previewImport(input());
    expect(preview.stores.map((s) => s.store).sort()).toEqual(
      ['game', 'meta', 'metrics', 'profile', 'programs', 'projects', 'sessions'].sort(),
    );
  });
});

describe('the rows a climber reads', () => {
  it('puts sessions first', () => {
    const preview = previewImport(
      input({
        incoming: { sessions: [session('2026-01-01#0')], projects: [{ id: 'p1' }] },
        existing: {},
      }),
    );
    expect(visibleRows(preview)[0]?.store).toBe('sessions');
  });

  it('hides a store that is empty on both sides', () => {
    const preview = previewImport(input({ incoming: { sessions: [session('2026-01-01#0')] } }));
    expect(visibleRows(preview).map((r) => r.store)).toEqual(['sessions']);
  });
});
