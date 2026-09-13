import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRILLS } from './drills';
import { DRILL_TEXT, drillText } from './drillText';
import { LOAD_RULES, rulesInText } from '@/engine/bodyLoad';

/**
 * The drill text, out of the entry chunk (PLAN.md M137).
 *
 * Two things have to hold for a description to live in another file. Every
 * drill still has one — a registry entry with no paragraph behind it is a
 * page that renders a heading over nothing — and what the injury engine
 * used to read out of the paragraph still reaches it: `Drill.loads` is
 * derived from these words and this is where the derivation is held to
 * the text, drill by drill.
 */

describe('every drill has its text', () => {
  it('and every text has its drill', () => {
    const ids = new Set(DRILLS.map((d) => d.id));
    const missing = DRILLS.filter((d) => !DRILL_TEXT[d.id]).map((d) => d.id);
    const orphaned = Object.keys(DRILL_TEXT).filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
    expect(orphaned).toEqual([]);
    expect(Object.keys(DRILL_TEXT).length).toBe(DRILLS.length);
  });

  it('is a paragraph rather than a stub', () => {
    // M107's premise: the description carries the method. Forty characters
    // is a floor under "a stub", not a standard for a description.
    const thin = DRILLS.filter((d) => (DRILL_TEXT[d.id] ?? '').length < 40).map((d) => d.id);
    expect(thin).toEqual([]);
  });

  it('is read by id', () => {
    expect(drillText(DRILLS[0]!.id)).toBe(DRILL_TEXT[DRILLS[0]!.id]);
    expect(drillText('no_such_drill')).toBeUndefined();
  });
});

describe('what the text says it loads', () => {
  it('is what the drill carries, drill by drill', () => {
    // Edit a description and this names the drill whose `loads` no longer
    // agrees with it. The order is the rules' own, hardest first.
    const drift = DRILLS.filter((d) => rulesInText(DRILL_TEXT[d.id]!).join() !== d.loads.join()).map(
      (d) => `${d.id}: text says [${rulesInText(DRILL_TEXT[d.id]!).join(', ')}], drill says [${d.loads.join(', ')}]`,
    );
    expect(drift).toEqual([]);
  });

  it('is derived from the text and nothing else', () => {
    // The name and focus are read live; only the paragraph travels as data.
    // A drill whose name says "campus" and whose text does not must not
    // carry 'campus' — or the engine would count it twice from two places
    // and a later edit to the text could not take it away.
    const doubled = DRILLS.filter((d) => d.loads.some((id) => !rulesInText(DRILL_TEXT[d.id]!).includes(id)));
    expect(doubled.map((d) => d.id)).toEqual([]);
  });

  it('matters: for most drills the text is the only place the words appear', () => {
    // The reason this is data rather than a scan over a lazily loaded
    // string. Measured at 67 of 156 when the text moved.
    const onlyInText = DRILLS.filter((d) => d.loads.some((id) => !rulesInText(`${d.name} ${d.focus}`).includes(id)));
    expect(onlyInText.length).toBeGreaterThan(50);
  });

  it('names every rule once', () => {
    const ids = LOAD_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(14);
  });
});

describe('where the text is read', () => {
  const source = (path: string) => readFileSync(path, 'utf8');

  it('is fetched by the search sheet when it opens, never imported', () => {
    // The one eager reader. A static import here puts sixteen kilobytes
    // back on every cold start, which is the whole of what this undoes.
    const search = source('src/features/search/SearchBody.tsx');
    expect(search).not.toMatch(/^import .* from '@\/content\/drillText';$/m);
    expect(search).toContain("import('@/content/drillText')");
  });

  it('is imported by the pages that show it, which are lazy', () => {
    for (const path of [
      'src/features/drills/DrillPage.tsx',
      'src/features/drills/DrillsPage.tsx',
      'src/features/log/LogPage.tsx',
      'src/features/train/ProgramDetailPage.tsx',
    ]) {
      expect(source(path), path).toMatch(/^import \{ [^}]*\} from '@\/content\/drillText';$/m);
    }
  });

  it('is not read by the drill registry, which is entry-chunk by construction', () => {
    expect(source('src/content/drills/index.ts')).not.toContain('drillText');
    expect(source('src/engine/bodyLoad.ts')).not.toContain('drillText');
  });
});
