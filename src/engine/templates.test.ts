import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { today } from './dates';
import {
  MAX_NAME,
  alreadySaved,
  applyTemplate,
  bodyFrom,
  cleanName,
  createTemplate,
  isRestSession,
  markUsed,
  rankTemplates,
  suggestName,
  type Template,
} from './templates';

const NOW = '2026-03-01T10:00:00.000Z';

function session(patch: Partial<Session> = {}): Session {
  return newSession('2026-03-01', 0, {
    completed: true,
    rewarded: true,
    mode: 'indoor',
    programId: 'iron_grip',
    sessionTypeId: 'fp',
    rpe: 8,
    durationMin: 95,
    warmup: true,
    drillId: 'd1',
    completedExercises: ['Max Hangs', 'Weighted Pull-Ups'],
    climbs: [{ id: 'c1', grade: 'V6', scale: 'V', count: 4, result: 'send' }],
    notes: 'Felt strong on the crimps.',
    ...patch,
  });
}

describe('what a template keeps', () => {
  const body = bodyFrom(session());

  it('keeps the structure', () => {
    expect(body).toMatchObject({
      mode: 'indoor', programId: 'iron_grip', sessionTypeId: 'fp',
      rpe: 8, durationMin: 95, warmup: true, drillId: 'd1',
      exercises: ['Max Hangs', 'Weighted Pull-Ups'],
    });
  });

  // The whole point. Pre-filled sends are things that have not happened, and
  // one careless Mark complete turns them into log entries that never did.
  it('never keeps the climbs', () => {
    expect(body).not.toHaveProperty('climbs');
    expect(JSON.stringify(body)).not.toContain('V6');
  });

  // A note is an observation about a day, not a plan for one.
  it('never keeps the notes', () => {
    expect(body).not.toHaveProperty('notes');
    expect(JSON.stringify(body)).not.toContain('crimps');
  });

  it('omits absent fields rather than storing undefined', () => {
    const bare = bodyFrom(newSession('2026-03-01', 0, { mode: 'outdoor' }));
    expect(Object.keys(bare)).toEqual(['mode']);
  });

  it('recognises a rest day and marks it as one', () => {
    const rest = session({
      climbs: [], restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
    });
    expect(isRestSession(rest)).toBe(true);
    expect(bodyFrom(rest).rest).toBe(true);
  });

  it('does not call a session with climbs a rest day', () => {
    expect(isRestSession(session())).toBe(false);
    expect(bodyFrom(session()).rest).toBeUndefined();
  });
});

describe('naming', () => {
  it('prefers the session type when there is one', () => {
    expect(suggestName(session(), 'Finger Power')).toBe('Finger Power');
  });

  it('falls back through rest and mode', () => {
    const rest = session({ climbs: [], restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false } });
    expect(suggestName(rest)).toBe('Rest day');
    expect(suggestName(session({ mode: 'outdoor' }))).toBe('Outdoor day');
    expect(suggestName(session())).toBe('Climbing session');
  });

  it('tidies whitespace, caps length, and never returns empty', () => {
    expect(cleanName('  Fingers   and   pull  ')).toBe('Fingers and pull');
    expect(cleanName('x'.repeat(80))).toHaveLength(MAX_NAME);
    expect(cleanName('   ', 'Session')).toBe('Session');
  });
});

describe('applying one', () => {
  const template = createTemplate(session(), 'Finger Power', NOW);

  it('plans a session rather than logging one', () => {
    const s = applyTemplate(template, '2026-04-02', 0);
    expect(s.completed).toBe(false);
    expect(s.rewarded).toBe(false);
    expect(s.planned).toBe(true);
    expect(s.date).toBe('2026-04-02');
  });

  it('carries the structure across', () => {
    const s = applyTemplate(template, '2026-04-02', 0);
    expect(s).toMatchObject({
      mode: 'indoor', programId: 'iron_grip', sessionTypeId: 'fp',
      rpe: 8, durationMin: 95, warmup: true, drillId: 'd1',
    });
  });

  it('starts with no climbs at all', () => {
    expect(applyTemplate(template, '2026-04-02', 0).climbs).toEqual([]);
  });

  it('gives a rest template a blank checklist, not a ticked one', () => {
    const rest = createTemplate(
      session({ climbs: [], restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true } }),
      'Rest', NOW,
    );
    expect(applyTemplate(rest, '2026-04-02', 0).restChecklist).toEqual({
      hydration: false, mobility: false, zone1: false, sleep: false,
    });
  });

  it('starts the clock only when applied to today', () => {
    expect(applyTemplate(template, today(), 0, true).startedAt).toBeDefined();
    expect(applyTemplate(template, '2026-04-02', 0, false).startedAt).toBeUndefined();
  });

  it('respects the index so two templates on one day do not collide', () => {
    expect(applyTemplate(template, '2026-04-02', 0).id).toBe('2026-04-02#0');
    expect(applyTemplate(template, '2026-04-02', 1).id).toBe('2026-04-02#1');
  });
});

describe('ordering and duplicates', () => {
  const base = (patch: Partial<Template>): Template => ({
    id: 'a', name: 'a', body: { mode: 'indoor' }, uses: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...patch,
  });

  it('counts a use and stamps it', () => {
    const used = markUsed(base({}), NOW);
    expect(used.uses).toBe(1);
    expect(used.lastUsedAt).toBe(NOW);
  });

  it('leads with what you actually use', () => {
    const list = [base({ id: 'rare', uses: 1 }), base({ id: 'often', uses: 9 }), base({ id: 'never' })];
    expect(rankTemplates(list).map((t) => t.id)).toEqual(['often', 'rare', 'never']);
  });

  it('breaks ties on recency', () => {
    const list = [
      base({ id: 'old', uses: 2, lastUsedAt: '2026-01-02T00:00:00.000Z' }),
      base({ id: 'new', uses: 2, lastUsedAt: '2026-02-02T00:00:00.000Z' }),
    ];
    expect(rankTemplates(list).map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('does not mutate the list it was given', () => {
    const list = [base({ id: 'a', uses: 1 }), base({ id: 'b', uses: 5 })];
    rankTemplates(list);
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });

  // Two sessions of the same shape on different days are one template.
  it('spots a session already covered', () => {
    const templates = [createTemplate(session(), 'Finger Power', NOW)];
    expect(alreadySaved(templates, session({ date: '2026-05-05', rpe: 6, durationMin: 60 }))).toBe(true);
  });

  it('does not confuse different session types', () => {
    const templates = [createTemplate(session(), 'Finger Power', NOW)];
    expect(alreadySaved(templates, session({ sessionTypeId: 'endurance' }))).toBe(false);
    expect(alreadySaved(templates, session({ mode: 'outdoor' }))).toBe(false);
    expect(alreadySaved(templates, session({ completedExercises: ['Something else'] }))).toBe(false);
  });
});
