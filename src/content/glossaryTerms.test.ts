import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, lookup } from './glossary';
import { glossaryKeys, hasGlossaryTerm, termKey } from './glossaryTerms';
// The generator is plain ESM — it is a script, not part of the app — and
// `scripts/glossaryTerms.d.ts` types it. Calling the real thing rather than
// reimplementing the extraction here: a second copy of that regex would go
// on passing while the one that actually writes the file broke.
import { render, termsFrom } from '../../scripts/glossaryTerms.mjs';

/**
 * The keys, and the promise they make on the glossary's behalf (PLAN.md M116).
 *
 * `<Term>` decides whether to underline a word from this file and fetches
 * the definition from the other one. If the two ever disagree about what
 * exists, a climber taps an underlined word and nothing opens — the
 * "apology" `Term`'s first rule was written to prevent, now stretched across
 * a module boundary where a single function used to hold it.
 *
 * So these are not style checks. They are the reason the split is safe.
 */

describe('the keys and the entries agree', () => {
  it('defines every key the glossary has an entry for', () => {
    const missing = GLOSSARY.map((e) => termKey(e.term)).filter((k) => !hasGlossaryTerm(k));
    expect(missing, 'run `npm run glossary`').toEqual([]);
  });

  it('claims no key the glossary cannot answer', () => {
    // The dangerous direction: a key here with no entry there renders a
    // button that opens onto nothing.
    const orphans = glossaryKeys().filter((k) => lookup(k) === undefined);
    expect(orphans, 'run `npm run glossary`').toEqual([]);
  });

  it('has exactly as many as the glossary', () => {
    expect(glossaryKeys()).toHaveLength(new Set(GLOSSARY.map((e) => termKey(e.term))).size);
  });

  it('is not vacuous', () => {
    expect(glossaryKeys().length).toBeGreaterThan(200);
  });
});

describe('the generated file is current', () => {
  it('matches what the script would write today', () => {
    // The committed artefact and its source, held together. Without this the
    // two checks above pass on a stale file for as long as nobody adds a
    // term — and then fail on the commit that does, which is the wrong
    // commit to find out in.
    const source = readFileSync('src/content/glossary.ts', 'utf8');
    const expected = render(termsFrom(source));
    const actual = readFileSync('src/content/glossaryTerms.ts', 'utf8');
    expect(actual, 'stale — run `npm run glossary`').toBe(expected);
  });

  it('reads every term out of the source, not some of them', () => {
    // The extractor is a regex over TypeScript, which is exactly the kind of
    // thing that silently finds 200 of 208.
    const source = readFileSync('src/content/glossary.ts', 'utf8');
    expect(termsFrom(source)).toHaveLength(new Set(GLOSSARY.map((e) => termKey(e.term))).size);
  });

  it('refuses to write an empty file', () => {
    // A regex that stops matching would otherwise regenerate a keys module
    // with nothing in it, and every term in the app would quietly become
    // plain text.
    expect(() => termsFrom('export const GLOSSARY = [];')).toThrow(/no terms/);
  });
});

describe('one normalisation, not two', () => {
  it('answers the same way the lookup does', () => {
    for (const variant of ['Beta', 'beta', '  BETA  ', 'BeTa']) {
      expect(hasGlossaryTerm(variant), variant).toBe(true);
      expect(lookup(variant), variant).toBeDefined();
    }
  });

  it('says no to the same things', () => {
    for (const variant of ['Not A Real Term', 'bet', 'beta ipsum']) {
      expect(hasGlossaryTerm(variant), variant).toBe(false);
      expect(lookup(variant), variant).toBeUndefined();
    }
  });

  it('is the glossary that normalises through this module', () => {
    // The mechanism behind the two checks above: if `glossary.ts` grew its
    // own `key` again they could drift apart while both still passed on the
    // cases someone thought to write down.
    expect(readFileSync('src/content/glossary.ts', 'utf8')).toMatch(
      /const key = termKey;/,
    );
  });
});

describe('the definitions stay out of it', () => {
  it('carries no definition text', () => {
    // The whole point. One definition leaking in would be a warning; the
    // check is that none of them are here.
    const keysFile = readFileSync('src/content/glossaryTerms.ts', 'utf8');
    const leaked = GLOSSARY.filter((e) => keysFile.includes(e.definition.slice(0, 40)));
    expect(leaked.map((e) => e.term)).toEqual([]);
  });

  it('is small enough to be worth the split', () => {
    // 208 keys against 208 definitions: measured at 1.7KB versus 11.8KB
    // gzipped. Held as a ratio rather than a number so it survives the
    // glossary growing, and it fails if someone puts the entries back.
    const keys = readFileSync('src/content/glossaryTerms.ts', 'utf8').length;
    const all = readFileSync('src/content/glossary.ts', 'utf8').length;
    expect(keys).toBeLessThan(all / 3);
  });
});

describe('Term asks the small module and fetches the large one', () => {
  const source = readFileSync('src/ui/Term.tsx', 'utf8');

  it('imports no definitions statically', () => {
    expect(source).not.toMatch(/^import .* from '@\/content\/glossary';$/m);
  });

  it('asks the keys module synchronously', () => {
    expect(source).toMatch(/^import \{ hasGlossaryTerm \} from '@\/content\/glossaryTerms';$/m);
  });

  it('loads the glossary on the tap', () => {
    expect(source).toContain("await import('@/content/glossary')");
  });
});
