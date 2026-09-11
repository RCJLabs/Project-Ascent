import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIELDS, SCALE_MAX, getField } from './fields';
import { PROGRAMS } from './programs';

import type { FieldId } from './types';

/**
 * The questions the content asks (PLAN.md M70).
 *
 * Nine programs declared `fields` on their session types and nothing in the
 * app read one of them. These hold the two sides together.
 */

describe('the field registry', () => {
  it('has an entry for every id the type allows', () => {
    // The union in types.ts is the authority; this reads it rather than
    // repeating it, so a new id cannot be added without a definition.
    const source = readFileSync('src/content/types.ts', 'utf8');
    const union = source.slice(source.indexOf('export type FieldId ='));
    const declared = [...union.slice(0, union.indexOf(';')).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);
    expect(declared.length).toBeGreaterThan(10);
    for (const id of declared) expect(getField(id as FieldId), id).toBeDefined();
    expect(Object.keys(FIELDS).sort()).toEqual([...declared].sort());
  });

  it('gives every field a label and a kind the logger can render', () => {
    for (const [id, spec] of Object.entries(FIELDS)) {
      expect(spec.id, id).toBe(id);
      expect(spec.label.trim(), id).not.toBe('');
      expect(['text', 'number', 'grade', 'scale'], id).toContain(spec.kind);
      if (spec.kind === 'scale') expect(spec.ends, id).toHaveLength(2);
      if (spec.kind === 'grade') expect(['boulder', 'route'], id).toContain(spec.scale);
      // A unit belongs to a number; a placeholder belongs to free text.
      if (spec.unit !== undefined) expect(spec.kind, id).toBe('number');
      if (spec.placeholder !== undefined) expect(spec.kind, id).toBe('text');
    }
  });

  it('defines every field the catalogue actually asks for', () => {
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const id of type.fields ?? []) {
          expect(getField(id), `${program.id}/${type.id}/${id}`).toBeDefined();
        }
      }
    }
  });

  // The whole point of the milestone: these were declared and never read.
  it('is asked for by the catalogue, not just declared here', () => {
    const asked = new Set<string>();
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) for (const id of type.fields ?? []) asked.add(id);
    }
    expect(asked.size).toBeGreaterThanOrEqual(10);
    expect(asked.has('location')).toBe(true);
  });

  // "Day of the trip (of the trip)" is what a unit repeating its label
  // looks like on screen, and it shipped for exactly one browser run.
  it('never writes a unit that repeats its own label', () => {
    for (const spec of Object.values(FIELDS)) {
      if (spec.unit === undefined) continue;
      const words = new Set(spec.label.toLowerCase().split(/\s+/));
      for (const word of spec.unit.toLowerCase().split(/\s+/)) {
        if (word.length <= 2) continue;
        expect(words.has(word), `${spec.id}: "${spec.label} (${spec.unit})"`).toBe(false);
      }
    }
  });

  it('runs its scales from one to ten', () => {
    expect(SCALE_MAX).toBe(10);
  });
});
