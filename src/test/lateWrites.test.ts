import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe as say, lateWrites } from './lateWrites';

/**
 * No state write lands after its page has gone (PLAN.md M332).
 *
 * The rule and the reason are in `lateWrites.ts`. This is the sweep, and
 * the decision is a pure function over source text for the reason
 * `waiting.ts` gives: a guard that can only be exercised by the thing it
 * guards cannot be shown to work, because a broken one and a clean tree
 * look identical. So every rule is held twice below — once where it has to
 * fire, once where it has to stay quiet.
 */

function sourceFiles(dir = 'src'): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [{ path, source: readFileSync(path, 'utf8') }];
  });
}

const FILES = sourceFiles();
const REPORT = lateWrites(FILES);

describe('a state write after the page has gone', () => {
  it('reads enough of the app to be worth trusting', () => {
    // A sweep that found nothing because it recognised nothing would pass
    // the assertion below. These are the writes guarded by hand before it
    // existed, and it has to see every one of them.
    expect(FILES.length).toBeGreaterThan(200);
    const seen = REPORT.guarded.map((w) => `${w.path} ${w.setter}`);
    for (const known of [
      'src/features/settings/SettingsPage.tsx setDemo', // M323
      'src/features/media/AttachPage.tsx setCounts', // M323
      'src/features/ascent/AscentPage.tsx setPayout', // M243
      'src/ui/StorageWarning.tsx setPressure',
      'src/features/settings/SettingsPage.tsx setSnapshot', // M331
    ]) {
      expect(seen, `${known} was not recognised`).toContain(known);
    }
  });

  it('is guarded wherever an effect can reach it', () => {
    expect(
      REPORT.unguarded.map(say),
      'check that the page is still on screen after the await, before the write — a ref an effect sets and its cleanup clears, or a flag local to the effect',
    ).toEqual([]);
  });
});

/** One component's worth of source, run through the rule alone. */
const check = (body: string) =>
  lateWrites([
    {
      path: 'fixture.tsx',
      source:
        'function Page() {\n  const [thing, setThing] = useState(null);\n  const onScreen = useRef(true);\n' +
        '  useEffect(() => { onScreen.current = true; return () => void (onScreen.current = false); }, []);\n' +
        `${body}\n}`,
    },
  ]);
const unguarded = (body: string) => check(body).unguarded.map((w) => w.setter);
const guarded = (body: string) => check(body).guarded.map((w) => w.setter);

describe('the rule', () => {
  it('finds a write after an await, in a function a mount effect calls', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { const x = await read(); setThing(x); }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('accepts a check of the page after the await', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { const x = await read(); if (!onScreen.current) return; setThing(x); }`;
    expect(unguarded(body)).toEqual([]);
    expect(guarded(body)).toEqual(['setThing']);
  });

  it('does not accept one before it, which checks the wrong moment', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { if (!onScreen.current) return; const x = await read(); setThing(x); }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('does not accept an if around the await either', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { if (onScreen.current) { const x = await read(); setThing(x); } }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('finds a flag in a cleanup written as the effect itself', () => {
    // `useEffect(() => () => …)`: the shape M323 wrote. Whether the flag is
    // ever set back is `afterUnmount.test.tsx`'s question; this one only
    // asks whether it is checked.
    const body = `
      let gone = false;
      useEffect(() => () => { gone = true; }, []);
      useEffect(() => { void load(); }, []);
      async function load() { const x = await read(); if (gone) return; setThing(x); }`;
    expect(unguarded(body)).toEqual([]);
  });

  it('does not accept a check of some other boolean', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { const x = await read(); if (!ready) return; setThing(x); }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('leaves a handler alone that only a tap calls', () => {
    const body = `
      useEffect(() => { void other(); }, []);
      async function onTap() { const x = await read(); setThing(x); }`;
    expect(check(body)).toEqual({ unguarded: [], guarded: [] });
  });

  it('follows a call through another function', () => {
    const body = `
      useEffect(() => { start(); }, []);
      function start() { void load(); }
      async function load() { const x = await read(); setThing(x); }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('follows an effect written as a function name', () => {
    const body = `
      const refresh = useCallback(() => { void read().then(setThing); }, []);
      useEffect(refresh, [refresh]);`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('finds a setter handed straight to then', () => {
    const body = `useEffect(() => { void read().then(setThing); }, []);`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('finds a write in a then callback, and accepts an effect-local flag', () => {
    const bare = `useEffect(() => { void read().then((x) => setThing(x)); }, []);`;
    expect(unguarded(bare)).toEqual(['setThing']);
    const flagged = `
      useEffect(() => {
        let live = true;
        void read().then((x) => { if (live) setThing(x); });
        return () => { live = false; };
      }, []);`;
    expect(unguarded(flagged)).toEqual([]);
    const shortCircuit = `
      useEffect(() => {
        let live = true;
        void read().then((x) => live && setThing(x));
        return () => { live = false; };
      }, []);`;
    expect(unguarded(shortCircuit)).toEqual([]);
  });

  it('finds the write in a catch clause after the await', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { try { await read(); } catch { setThing(null); } }`;
    expect(unguarded(body)).toEqual(['setThing']);
  });

  it('counts a function that writes state as a setter itself', () => {
    const body = `
      const tell = useCallback((text) => { setThing(text); }, []);
      useEffect(() => { void load(); }, []);
      async function load() { await read(); tell('done'); }`;
    expect(unguarded(body)).toEqual(['tell']);
  });

  it('does not count an await that belongs to a function nested inside', () => {
    const body = `
      useEffect(() => { void load(); }, []);
      async function load() { const later = async () => { await read(); }; setThing(1); void later(); }`;
    expect(unguarded(body)).toEqual([]);
  });
});
