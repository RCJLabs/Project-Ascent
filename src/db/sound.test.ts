import { beforeEach, describe, expect, it } from 'vitest';
import { clearReadingProblems, readingProblems, recordReading, sound, type Shape } from './sound';

/**
 * Repairing what can be repaired, dropping what cannot, counting both
 * (PLAN.md M44).
 */
const SHAPE: Shape = {
  needs: { id: 'string', date: 'string', value: 'number' },
  lists: { notes: { id: 'string', text: 'string' } },
};

const whole = { id: 'a', date: '2026-01-01', value: 3, notes: [{ id: 'n1', text: 'hi' }] };

describe('reading records the database returned', () => {
  beforeEach(clearReadingProblems);

  it('leaves a whole record alone', () => {
    const reading = sound(([whole]), SHAPE);
    expect(reading.rows).toEqual([whole]);
    expect(reading).toMatchObject({ dropped: 0, repaired: 0 });
  });

  it('fills a missing list rather than losing the record', () => {
    // The exact shape of the bug: a project without `beta` is a project with
    // no beta notes, and answering that with an empty page was the defect.
    const { notes: _gone, ...withoutNotes } = whole;
    const reading = sound<typeof whole>([withoutNotes], SHAPE);
    expect(reading.rows[0]!.notes).toEqual([]);
    expect(reading).toMatchObject({ dropped: 0, repaired: 1 });
  });

  it('fills a list that is there but is not a list', () => {
    const reading = sound<typeof whole>([{ ...whole, notes: 'nope' }], SHAPE);
    expect(reading.rows[0]!.notes).toEqual([]);
    expect(reading.repaired).toBe(1);
  });

  it('drops an element the app would walk straight into', () => {
    // A beta note with no `date` reached the journal as an entry with no
    // date, which `byMonth` sliced. Failing at the element is the point:
    // one unreadable note should not cost the project.
    const reading = sound<typeof whole>(
      [{ ...whole, notes: [{ id: 'n1', text: 'kept' }, { id: 'n2' }, null] }],
      SHAPE,
    );
    expect(reading.rows[0]!.notes).toEqual([{ id: 'n1', text: 'kept' }]);
    expect(reading).toMatchObject({ dropped: 0, repaired: 1 });
  });

  it('drops a record that cannot be addressed', () => {
    // Not repairable: without an id it cannot be opened, edited or deleted,
    // and inventing one would make a phantom that reappears on every read.
    const { id: _none, ...withoutId } = whole;
    expect(sound([withoutId, { ...whole, id: '' }, whole], SHAPE)).toMatchObject({
      dropped: 2,
      repaired: 0,
    });
  });

  it('drops a field of the wrong type as firmly as a missing one', () => {
    expect(sound([{ ...whole, value: '3' }], SHAPE).dropped).toBe(1);
    expect(sound([{ ...whole, date: null }], SHAPE).dropped).toBe(1);
  });

  it('drops whatever is not a record at all', () => {
    expect(sound([null, 'a string', 42, [], undefined], SHAPE)).toMatchObject({ dropped: 5 });
  });

  it('never mutates what the database handed it', () => {
    const original = { ...whole };
    const { notes: _gone, ...withoutNotes } = original;
    const input = [withoutNotes] as unknown[];
    sound(input, SHAPE);
    expect(input[0]).not.toHaveProperty('notes');
  });

  describe('telling the climber', () => {
    it('remembers which store was short, and by how much', () => {
      recordReading('projects', { rows: [], dropped: 2, repaired: 1 });
      expect(readingProblems()).toEqual([{ store: 'projects', dropped: 2, repaired: 1 }]);
    });

    it('forgets a store once it reads clean', () => {
      // Every hydrate re-reads. A warning that outlives the problem is a
      // warning nobody believes the second time.
      recordReading('projects', { rows: [], dropped: 2, repaired: 0 });
      recordReading('projects', { rows: [], dropped: 0, repaired: 0 });
      expect(readingProblems()).toEqual([]);
    });
  });
});
