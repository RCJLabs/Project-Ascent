import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design system, enforced at the source rather than by review.
 *
 * M13 exists because there were 95 bare `<button>` elements against 20
 * files importing `Button`, 76 raw form controls, the same input class
 * string copied into ten files and the selected-chip pattern written out
 * thirty times across sixteen. Every one of those was a chance to forget a
 * focus ring, a hit target, an accessible name or a pressed state — and
 * reviewing for it by eye is exactly what let it reach ninety-five.
 *
 * So these are the milestone's "done when", executable. They will also stop
 * it coming back, which is the part a one-off cleanup never does.
 */

const UI = 'src/ui';
const FEATURES = 'src/features';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const componentFiles = (dir: string): { path: string; source: string }[] =>
  walk(dir)
    .filter((p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx'))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const FEATURE_FILES = componentFiles(FEATURES);
const UI_FILES = componentFiles(UI);

/** Occurrences of `needle`, as `path:line` for a readable failure. */
/** A line that is only a comment. Prose about `<select>` is not a select. */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function findAll(
  files: { path: string; source: string }[],
  test: (line: string) => boolean,
): string[] {
  return files.flatMap(({ path, source }) =>
    source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !isComment(line) && test(line))
      .map(({ line, n }) => `${path}:${n} ${line.trim().slice(0, 70)}`),
  );
}

/**
 * Files allowed a bare `<button>`, with the reason.
 *
 * Kept as an explicit list rather than a blanket exemption, because "this
 * one is special" is exactly how ninety-five of them happened. Everything
 * here still has to carry `focus-ring`; the exemption is from the
 * primitive, never from the ring.
 */
const BESPOKE: Record<string, string> = {
  'src/features/calendar/CalendarPage.tsx':
    'a calendar day is a grid cell with its own state shell — a Button would be a worse abstraction, not a better one',
  'src/features/week/WeekPage.tsx':
    'a day row is a full-width list row that is a link, a pick, a landing or nothing, sharing one shell — the calendar cell’s reason, one grain up',
  'src/features/ascent/AscentPage.tsx':
    'the game canvas and its overlay controls are their own visual language',
  'src/features/log/ClimbEntry.tsx':
    'the grade strip is a dense scrolling value picker, not a filter — Chip’s tinted-border selection is unreadable at that size, so it fills solid instead',
  'src/features/log/TallyRow.tsx':
    'the grade and the words are the row itself, tappable to correct it — a Button inside a row that already carries a 56px plus and a 36px minus would be a third control competing with the two that matter mid-session (PLAN.md M298)',
  'src/features/assessments/HoldTimer.tsx':
    'one 80px transport control on a full-screen sheet, matching TimerSheet’s — a Button at that size would be a Button in name only',
};

describe('feature files use the primitives', () => {
  it('styles no bare buttons outside the listed exceptions', () => {
    // `ui/` owns the element; features compose Button, IconButton or Chip.
    const offences = findAll(FEATURE_FILES, (l) => l.includes('<button')).filter(
      (hit) => !Object.keys(BESPOKE).some((allowed) => hit.startsWith(allowed)),
    );
    expect(offences).toEqual([]);
  });

  /**
   * Every bespoke button carries the ring, however it gets it.
   *
   * This counted `<button` against `focus-ring` and required the second to
   * be at least the first, which is a proxy rather than the rule — and it
   * punishes the right way to write two buttons that look alike. M100 added
   * a second calendar cell sharing the `shell` string the first already
   * used: correct, and one ring for two buttons.
   *
   * So the measure follows the rule instead. A button is covered if its own
   * attributes say `focus-ring`, or if they name a binding this file
   * declares with `focus-ring` in it.
   */
  it('gives the exceptions a focus ring anyway', () => {
    const offences: string[] = [];
    for (const [path, reason] of Object.entries(BESPOKE)) {
      const file = FEATURE_FILES.find((f) => f.path === path);
      expect(file, `listed exception no longer exists: ${path} (${reason})`).toBeDefined();
      const source = file?.source ?? '';

      const ringed = new Set(
        [...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=[^;]*?focus-ring/gs)].map(
          (m) => m[1] as string,
        ),
      );

      // The opening tag, scanned rather than matched: a regex that stops at
      // the first `>` stops inside `onClick={() => …}`, which cut every tag
      // short of its `className` and reported two false offences.
      for (const start of [...source.matchAll(/<button\b/g)].map((m) => m.index!)) {
        let depth = 0;
        let end = start;
        while (end < source.length) {
          const c = source[end];
          if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
          else if (c === '>' && depth === 0) break;
          end += 1;
        }
        const tag = source.slice(start, end);
        const covered =
          tag.includes('focus-ring') || [...ringed].some((name) => new RegExp(`\\b${name}\\b`).test(tag));
        if (!covered) offences.push(`${path}: a <button> with no focus ring`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('styles no bare form controls', () => {
    expect(
      findAll(FEATURE_FILES, (l) => /<(input|select|textarea)(\s|\/|>|$)/.test(l)),
    ).toEqual([]);
  });

  it('does not re-declare the control class string', () => {
    expect(findAll(FEATURE_FILES, (l) => l.includes('bg-sunken border border-line rounded'))).toEqual(
      [],
    );
  });

  it('does not hand-roll the selected-chip state', () => {
    expect(findAll(FEATURE_FILES, (l) => l.includes('border-accent bg-accent/10'))).toEqual([]);
  });

  /**
   * By shape, not by one background token (PLAN.md M257).
   *
   * This read `rounded-full bg-sunken overflow-hidden` — `Meter`'s own
   * class string, copied verbatim. The skills page wrote the same bar with
   * `bg-surface`, because its rows are already sunken, and the probe passed
   * over it for as long as both existed. A probe that cannot find a
   * known-present instance is not a probe (PLAN.md M195), so this one is
   * proved against the string it used to miss.
   */
  const BAR = /rounded-full bg-(sunken|surface) overflow-hidden/;

  it('does not hand-roll a progress bar', () => {
    expect(findAll(FEATURE_FILES, (l) => BAR.test(l))).toEqual([]);
  });

  it('would catch the one it missed', () => {
    expect(BAR.test('<div className="h-1 rounded-full bg-surface overflow-hidden mt-2">')).toBe(true);
    expect(BAR.test('<div className="h-1.5 rounded-full bg-sunken overflow-hidden">')).toBe(true);
    // And is still a bar rather than any rounded box: a thumbnail is
    // `rounded-xl overflow-hidden bg-sunken` and must go on passing.
    expect(BAR.test('className="aspect-square rounded-xl overflow-hidden bg-sunken"')).toBe(false);
  });
});

describe('the primitives are safe to use', () => {
  it('gives every interactive element in ui/ a focus ring', () => {
    const offences: string[] = [];
    for (const { path, source } of UI_FILES) {
      // Count the elements that take focus against the rings declared.
      const interactive = (source.match(/<(button|input|select|textarea)(\s|\/|>)/g) ?? []).length;
      if (interactive === 0) continue;
      const rings = (source.match(/focus-ring/g) ?? []).length;
      if (rings === 0) offences.push(`${path}: ${interactive} focusable, no focus-ring`);
    }
    expect(offences).toEqual([]);
  });

  it('defines the focus ring once, in CSS, on :focus-visible only', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('.focus-ring:focus-visible');
    // :focus would leave a ring after a mouse click, which reads as a bug
    // and trains people to dislike focus rings.
    expect(css).not.toMatch(/\.focus-ring:focus\s*\{/);
  });

  it('keeps every button size at or above the 24px WCAG target floor', () => {
    const button = readFileSync('src/ui/Button.tsx', 'utf8');
    const heights = [...button.matchAll(/min-h-(\d+)/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThanOrEqual(3);
    // Tailwind's scale is quarter-rem: min-h-9 is 36px, min-h-11 is 44px.
    for (const h of heights) expect(h * 4).toBeGreaterThanOrEqual(24);
  });

  it('keeps the checkbox at the 24px target floor', () => {
    // Measured in a browser at 390×780 before this: 20×20 on the injury
    // steps, and the logger's exercise rows pass an `sr-only` label, so
    // there the box is the whole target (PLAN.md M271).
    const field = readFileSync('src/ui/Field.tsx', 'utf8');
    // The *next* className after the input, with no character budget: the
    // comment explaining this fix pushed it past a 400-character window and
    // the assertion read nothing at all. Fourth time in two milestones that
    // prose has moved a source scan off its target.
    const box = /type="checkbox"[\s\S]*?className="([^"]+)"/.exec(field)?.[1] ?? '';
    const w = /\bw-(\d+)\b/.exec(box)?.[1];
    const h = /\bh-(\d+)\b/.exec(box)?.[1];
    expect(w, 'the checkbox has a width').toBeTruthy();
    expect(Number(w) * 4).toBeGreaterThanOrEqual(24);
    expect(Number(h) * 4).toBeGreaterThanOrEqual(24);
  });

  it('keeps a glossary term at the 24px target floor', () => {
    /**
     * Measured in the layout harness at 390 and at desktop: `Max Hangs` came
     * back 87x20 on the logger, and so did every other exercise name Iron
     * Grip's finger day prescribes (PLAN.md M321).
     *
     * M280 exempted a target sitting in a block of text, which is right for a
     * guide — these are words in sentences there. The logger renders the same
     * component as the **title of an exercise row**, where it is a control in
     * a list and the exemption does not apply. The harness never saw it
     * because no fixture had ever put a finger day on the screen.
     *
     * Padding rather than a height, because the element is inline and a
     * height would move the line it sits in.
     */
    const term = readFileSync('src/ui/Term.tsx', 'utf8');
    // The button's own className, taken from the JSX rather than the file, so
    // the sweep cannot match the word in the comment above it.
    const cls = /<button[\s\S]*?className=\{`([^`]+)`\}/.exec(term)?.[1] ?? '';
    expect(cls, 'no className found on the button').toContain('focus-ring');
    const pad = /\bpy-(\d+(?:\.\d+)?)\b/.exec(cls)?.[1];
    expect(pad, 'the glossary term has no vertical padding').toBeTruthy();
    // 20px of line box plus four of padding is the floor exactly. Tailwind's
    // scale is quarter-rem, so `py-0.5` is 2px a side.
    expect(20 + Number(pad) * 4 * 2).toBeGreaterThanOrEqual(24);
  });

  it('requires an accessible name on an icon button', () => {
    const source = readFileSync('src/ui/IconButton.tsx', 'utf8');
    // `label: string`, not `label?: string` — a screen reader cannot infer
    // one from an SVG.
    expect(source).toMatch(/\blabel: string/);
    expect(source).not.toMatch(/\blabel\?: string/);
  });

  it('makes a chip announce whether it is on', () => {
    const source = readFileSync('src/ui/Chip.tsx', 'utf8');
    expect((source.match(/aria-pressed/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('makes a meter readable without seeing it', () => {
    const source = readFileSync('src/ui/Meter.tsx', 'utf8');
    for (const attribute of ['role="progressbar"', 'aria-valuenow', 'aria-valuetext', 'aria-label']) {
      expect(source).toContain(attribute);
    }
  });
});

/**
 * A `className` cannot override a class the component always sets.
 *
 * Both land in the same class attribute, and which one applies is decided by
 * Tailwind's ordering of its own stylesheet, not by the order they appear in
 * the markup. The photo grid passed `p-0` to a card that sets `p-3` and got
 * `p-3` — every thumbnail a quarter smaller than the code said it was, on
 * two screens, for as long as the card had existed.
 *
 * So where a component owns a property, the caller asks for it by prop.
 */
describe('overriding a component from the outside', () => {
  const OWNED: { component: string; prop: string; pattern: RegExp }[] = [
    { component: 'SelectableCard', prop: 'padded', pattern: /\bp-\d/ },
    // `CONTROL` sets `w-full`, so a width beside it is a coin flip rather
    // than a width — which is how M102's "From %" box rendered full-width on
    // its own line. There is no prop for this one: a control that should not
    // fill its row goes in a sized wrapper, as `ExerciseNumbers` does.
    // Not `min-w-*` or `max-w-*`: those constrain a flex child rather than
    // arguing with `w-full`, and they are how a control shares a row.
    //
    // **All three, not just `Input`.** M102 added this row for the component
    // that happened to have the bug, and `Select` and `TextArea` share the
    // same `CONTROL` string — so M105's column mapper set `w-40` on a
    // `Select`, lost the coin flip, and rendered six full-width dropdowns
    // with every column name squeezed to nothing beside them. The guard was
    // looking at the component instead of at the cause.
    ...(['Input', 'Select', 'TextArea'] as const).map((component) => ({
      component,
      prop: 'a sized wrapper around it',
      pattern: /(?<![\w-])w-(?!full\b)[\d[]/,
    })),
  ];

  it('does not try to win a padding argument through className', () => {
    const offenders: string[] = [];
    for (const { component, prop, pattern } of OWNED) {
      for (const { path, source } of [...FEATURE_FILES, ...UI_FILES]) {
        if (path.endsWith('Chip.tsx')) continue;
        // Everything between `<Component` and the next opening tag. Matching
        // the tag itself with `[^>]*` does not work: an `onClick={() => …}`
        // attribute contains a `>` and ends the match early, which is how
        // the first version of this test passed on the very code it was
        // written to catch.
        for (const chunk of source.split(`<${component}`).slice(1)) {
          const tag = chunk.split(/<[A-Za-z]/)[0] ?? '';
          const className = /className=\{?["`]([^"`]*)["`]/.exec(tag)?.[1] ?? '';
          if (pattern.test(className)) {
            offenders.push(`${path}: <${component} className="…${className}…"> — use ${prop}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('colour classes name colours that exist', () => {
  /** Every token Tailwind is told about, from the one place they are declared. */
  const TOKENS = new Set(
    [...readFileSync('src/index.css', 'utf8').matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1] as string),
  );

  /** Tailwind's own keywords, which are colours without being tokens. */
  const BUILT_IN = new Set(['white', 'black', 'transparent', 'current', 'inherit', 'none']);

  const PREFIXES = ['text', 'bg', 'border', 'fill', 'stroke', 'ring', 'from', 'to', 'via', 'decoration', 'divide', 'outline', 'shadow', 'accent', 'caret', 'placeholder'];

  it('declares the tokens it thinks it declares', () => {
    for (const token of ['accent', 'accent-ink', 'ink-soft', 'danger', 'warn', 'positive']) {
      expect(TOKENS.has(token), token).toBe(true);
    }
  });

  it('writes no colour class for a token that was never defined', () => {
    // `text-on-accent` shipped in M21 and generated nothing at all, so the
    // selected grade in the logger's picker inherited `ink` and rendered at
    // 2.96:1 on the accent — below AA, and invisible to every test the app
    // had, because a class that does not exist breaks nothing loudly.
    const offences: string[] = [];
    for (const file of [...FEATURE_FILES, ...UI_FILES]) {
      for (const [, prefix, name] of file.source.matchAll(
        new RegExp(`\\b(${PREFIXES.join('|')})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\\b`, 'g'),
      )) {
        const token = name as string;
        // Anything that is not one of ours is either a Tailwind keyword or a
        // utility that has nothing to do with colour (`text-sm`, `border-2`).
        if (!token.startsWith('accent') && !token.startsWith('on-')) continue;
        if (BUILT_IN.has(token) || TOKENS.has(token)) continue;
        offences.push(`${file.path}: ${prefix}-${token}`);
      }
    }
    expect(offences).toEqual([]);
  });
});

/**
 * A status colour is a graphic, not a word (PLAN.md M103).
 *
 * `themes.test.ts` holds `positive`, `warn` and `danger` to **3:1** against
 * every surface, and says why in as many words: *"Graphics rather than text,
 * so 3:1 is the bar."* Nothing held anyone to using them that way.
 *
 * M103's day strip painted `text-warn` on `bg-warn/15` and measured 3.72,
 * 3.99 and 4.47 in light mode — three WCAG AA failures at 11px, from
 * tokens every palette test passed, because the tint drops what little
 * headroom a 3:1 promise leaves. The pairing is the tell: a status colour
 * as text on a tint of itself.
 */
describe('a status colour is a graphic, not a word', () => {
  const STATUS = ['positive', 'warn', 'danger'];

  it('never paints a status colour as text on a tint of itself', () => {
    const offences: string[] = [];
    for (const file of [...FEATURE_FILES, ...UI_FILES]) {
      for (const line of file.source.split('\n')) {
        if (isComment(line)) continue;
        for (const status of STATUS) {
          const tinted = new RegExp(`\\bbg-${status}/\\d+`).test(line);
          const worded = new RegExp(`\\btext-${status}\\b`).test(line);
          if (tinted && worded) offences.push(`${file.path}: text-${status} on bg-${status}/…`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

/**
 * A utility may not change the shape of what it is applied to (PLAN.md M99b).
 *
 * `.focus-ring` carried `border-radius: inherit` from M14, on the
 * reasonable-looking theory that a focus ring should follow the shape it is
 * drawn around. An outline already does that by itself; what the line
 * actually did was overwrite the element's own radius with its parent's.
 *
 * Measured in a browser before it was removed: **132 of 132** controls that
 * declared a radius across ten pages rendered a different one, most of them
 * square because their parent was. It survived for years because a button
 * inside a rounded card inherits something that looks plausible, and because
 * nothing in the suite has a layout engine — jsdom resolves no cascade, so
 * only a real browser could see it.
 *
 * This is the rule, which a test can hold: a shared behaviour class decorates,
 * and geometry belongs to the element.
 */
describe('the focus ring decorates and nothing more', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const block = css.slice(css.indexOf('.focus-ring {'), css.indexOf('}', css.indexOf('.focus-ring {')));

  it('finds the rule to check', () => {
    expect(block).toContain('outline');
  });

  it('sets no geometry of its own', () => {
    const geometry = ['border-radius', 'width', 'height', 'padding', 'margin', 'display', 'position'];
    const declared = geometry.filter((property) =>
      new RegExp(`^\\s*${property}\\s*:`, 'm').test(block),
    );
    expect(declared).toEqual([]);
  });
});

/**
 * The tab row is the way out of every screen (PLAN.md M269).
 *
 * The banners live inside the nav, so anything that appears there — an undo
 * offer, a storage warning, an update prompt — adds to its height. With the
 * nav `shrink-0` that height was taken whatever it cost: `main` shrank to
 * nothing and then the nav pushed its own tabs out of the bottom of an
 * `overflow-hidden` shell. Reported from an installed app as the bottom bar
 * disappearing after logging a rest day, which is the step that adds the
 * undo offer.
 *
 * jsdom has no layout, so this cannot be driven — it is the M43 caveat
 * exactly, and the behaviour was measured in a browser instead: at 360×640
 * with the banner box padded by 600px the tabs sat at 723–780 on a 640px
 * screen before, and at 583–640 after. What is left to hold is the three
 * declarations that arrangement depends on.
 */
describe('the nav can give way, and the tabs cannot', () => {
  const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
  const nav = shell.slice(shell.indexOf('<nav'), shell.indexOf('</nav>'));

  it('lets the nav shrink rather than overflow the shell', () => {
    expect(nav).toContain('order-last min-h-0 flex flex-col');
    // `shrink-0` on the nav itself is the defect: it is what made the tab
    // row displaceable. It stays only at `lg`, where the nav is a
    // fixed-width sidebar in a row and shrinking is a different axis.
    expect(nav).not.toMatch(/'order-last[^']*\bshrink-0\b/);
    expect(nav).toContain('lg:shrink-0');
  });

  it('gives way in the banners, which scroll', () => {
    // The banner box is the one that moves to the foot of the sidebar at
    // `lg`, which is what tells it apart from the nav's own class list.
    const at = nav.indexOf('lg:order-last');
    expect(at, 'the banner box is still there').toBeGreaterThan(0);
    const box = nav.slice(nav.lastIndexOf('className', at), nav.indexOf('>', at));
    expect(box).toContain('min-h-0');
    expect(box).toContain('overflow-y-auto');
  });

  it('makes `main` the containing block for what it scrolls', () => {
    // `sr-only` is `position: absolute`. Without this, a screen-reader
    // label near the foot of a long page resolves against the initial
    // containing block, sits that far down the *document*, and makes the
    // document scrollable — which scrolls the nav away with it (M270).
    //
    // Read off the class list, not the element's source: the first draft
    // searched the whole `<main>` block and passed with the class deleted,
    // because the comment above it explains the word. The battery caught
    // it. That is M222's lesson for the second time in one milestone — a
    // sweep has no business reading prose.
    // From `id="main"`, because `<main>` is named in a doc comment further
    // up and slicing from there read the shell's class list instead — the
    // third time prose has stood in for code in this milestone.
    const at = shell.indexOf('id="main"');
    expect(at, 'main is still there').toBeGreaterThan(0);
    const classes = (/className="([^"]+)"/.exec(shell.slice(at))?.[1] ?? '').split(/\s+/);
    expect(classes, 'main establishes a containing block').toContain('relative');
    expect(classes, 'main is the scroll container').toContain('overflow-y-auto');
  });

  it('pins the tab row', () => {
    const tabs = nav.slice(nav.indexOf('grid grid-cols-5') - 80, nav.indexOf('grid grid-cols-5') + 40);
    expect(tabs).toContain('shrink-0');
  });
});
