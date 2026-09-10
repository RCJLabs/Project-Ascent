import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M22's "done when": nothing renders a blank card while it thinks.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const FEATURES = walk('src/features').filter((p) => p.endsWith('.tsx'));

describe('a loading page holds its shape', () => {
  it('renders nothing nowhere', () => {
    // `return null` while hydrating is worse than a blank card: with nothing
    // in `main` the page has no height at all, so the layout collapses and
    // snaps back a frame later, which reads as a fault. Four pages did this.
    const offenders = FEATURES.filter((p) => /if \(!hydrated\) return null;/.test(read(p)));
    expect(offenders).toEqual([]);
  });

  it('says it is loading rather than only drawing grey boxes', () => {
    const skeleton = read('src/ui/Skeleton.tsx');
    expect(skeleton).toContain('aria-busy');
    expect(skeleton).toContain('aria-label');
  });

  it('does not describe the grey boxes to a screen reader', () => {
    expect(read('src/ui/Skeleton.tsx')).toContain('aria-hidden');
  });
});

describe('empty states are one shape', () => {
  it('uses the primitive built for them', () => {
    // EmptyState was written in M13 and then used in exactly zero places,
    // while eight pages kept their own hand-rolled version.
    const users = FEATURES.filter((p) => read(p).includes('<EmptyState'));
    expect(users.length).toBeGreaterThanOrEqual(6);
  });

  it('leaves no hand-rolled copies of it behind', () => {
    const shape = /<Card>\s*\n\s*<p className="text-sm (leading-relaxed text-ink-soft|text-ink-soft leading-relaxed)">/;
    const offenders = FEATURES.filter((p) => shape.test(read(p)));
    expect(offenders).toEqual([]);
  });
});

describe('type scales with the text-size setting', () => {
  it('sets no font size in absolute pixels', () => {
    // M15 scales the root font size, which moves every rem-based utility
    // with it — and moves an absolute px value not at all. Thirty-one
    // labels were pinned at 10 and 11px, so a climber who chose "Largest"
    // got no larger text in the nav, on every badge, or on any chart key.
    const offenders = walk('src')
      .filter((p) => /\.(tsx|css)$/.test(p))
      .flatMap((p) =>
        read(p)
          .split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /text-\[\d+px\]/.test(line) && !line.trim().startsWith('*'))
          .map(({ n }) => `${p}:${n}`),
      );
    expect(offenders).toEqual([]);
  });

  it('names the extra step rather than leaving it arbitrary', () => {
    expect(read('src/index.css')).toContain('--text-2xs:');
    expect(read('src/index.css')).toMatch(/--text-2xs:\s*[\d.]+rem/);
  });
});

describe('motion is optional', () => {
  it('is turned off globally when the system asks', () => {
    // Route transitions and everything else ride on this one rule rather
    // than each remembering to check.
    expect(read('src/index.css')).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
