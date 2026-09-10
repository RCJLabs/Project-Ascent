// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/content/guides';
import { PROGRAMS } from '@/content/programs';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { TrainPage } from '@/features/train/TrainPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';

/**
 * The grade preference has to reach the catalogue (PLAN.md M47).
 *
 * A climber who sets Font sees their own climbing in Font — Projects and
 * Progress convert correctly — and then every program in the catalogue is
 * still advertised in V-scale: "Base Camp V0-V2", "V5-V8 GRADES". The range
 * on a program is `{ scale, min, max, label }` and the label is an authored
 * string, so nothing converted it. This was recorded as a known limitation
 * parked against M9; M9 finished and the limitation outlived it.
 */

async function inFont(): Promise<void> {
  await reset();
  await hydrate();
  useSettings.getState().setBoulderDisplay('Font');
  useSettings.getState().setRouteDisplay('French');
}

const text = (container: HTMLElement) => container.textContent ?? '';

describe('reading the catalogue in Font', () => {
  it('the program list converts its grade ranges', async () => {
    await inFont();
    const view = renderAt('/train', <TrainPage />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container), 'Base Camp is still advertised in V-scale').not.toMatch(/V0-V2/);
    expect(text(view.container)).toMatch(/4-5\+|4-5/);
  });

  it('a program page converts the range in its header', async () => {
    await inFont();
    const view = renderAt('/train/iron_grip', <ProgramDetailPage params={{ id: 'iron_grip' }} />);
    await view.findByRole('heading', { level: 1 });
    // The header stat, not the whole page: the prose below it still says
    // "for V5-V8 climbers", which is the authoring half — see below.
    const grades = [...view.container.querySelectorAll('div')].find(
      (el) => el.textContent?.trim() === 'Grades',
    )?.previousElementSibling;
    expect(grades?.textContent?.trim()).toBe('6C-7B');
  });

  it('leaves a range that is not a range alone', async () => {
    // "All Levels" and "Pre-Climbing" are editorial: they say something the
    // ladder cannot, and deriving them from V0-V17 would be worse.
    await inFont();
    const view = renderAt('/train', <TrainPage />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container)).toMatch(/All Levels/);
  });

  it('still reads in V-scale for a climber who wants V-scale', async () => {
    await reset();
    await hydrate();
    const view = renderAt('/train', <TrainPage />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container)).toMatch(/V0-V2/);
  });

  it('every convertible range is derived rather than authored', async () => {
    // The structural half: a label kept as prose is a label that cannot
    // follow a preference, so only the editorial ones keep one.
    const authored = PROGRAMS.filter((p) => p.gradeRange.label !== undefined).map((p) => p.gradeRange.label);
    expect(authored.sort()).toEqual(['All Levels', 'All Levels', 'All Levels', 'Pre-Climbing']);
  });
});

/**
 * The half a display preference cannot reach (PLAN.md M47).
 *
 * Grades are written into prose all over the content — a program's pitch
 * ("for V5-V8 climbers"), its graduation note, the reason it gives for what
 * comes next, and its guide. Those are sentences, not fields, so nothing can
 * convert them without re-authoring the content as structured ranges.
 *
 * **And a blanket transform at render time would be wrong**, which is the
 * finding that settled this. Twenty of the sixty-one grade tokens in the
 * guides are the notation being *explained* — "V-scale (for bouldering) —
 * runs from V0 (easiest) upward", "Yosemite Decimal System … runs 5.0 to
 * 5.15+". Rewriting those into Font produces "runs from 4 (easiest) upward",
 * which is nonsense in a passage whose subject is the V-scale.
 *
 * So this is debt, pinned rather than hidden: the counts cannot grow without
 * someone editing this file, and the number is the size of the authoring job
 * whenever it is picked up.
 */
describe('grades still written into prose', () => {
  const TOKEN = /\b(V\d{1,2}|5\.\d{1,2}[a-d]?)\b/g;
  const count = (value: unknown): number => {
    if (typeof value === 'string') return [...value.matchAll(TOKEN)].length;
    if (Array.isArray(value)) return value.reduce<number>((n, item) => n + count(item), 0);
    if (value !== null && typeof value === 'object') {
      return Object.values(value).reduce<number>((n, item) => n + count(item), 0);
    }
    return 0;
  };

  it('is exactly this much, and no more', () => {
    const prose = PROGRAMS.reduce(
      (n, p) => n + count(p.intro) + count(p.nextPrograms) + count(p.frequency) + count(p.ordering),
      0,
    );
    expect(prose, 'grades in program prose: fix them or update the count deliberately').toBe(37);
  });

  it('is exactly this much in the program guides too', () => {
    const ids = new Set(PROGRAMS.map((p) => p.id));
    const guides = GUIDES.filter((g) => ids.has(g.id)).reduce((n, g) => n + count(g.sections), 0);
    expect(guides, 'grades in program guide prose').toBe(41);
  });

  it('leaves the guides that teach the notation alone', () => {
    // The finding that settled the design: the general guides explain what
    // the scales *are*, and twenty of their tokens are the notation itself.
    // A render-time transform would rewrite "runs from V0 (easiest) upward"
    // into "runs from 4 (easiest) upward" inside a passage about the
    // V-scale. These are not debt; they are correct.
    const ids = new Set(PROGRAMS.map((p) => p.id));
    const general = GUIDES.filter((g) => !ids.has(g.id)).reduce((n, g) => n + count(g.sections), 0);
    expect(general).toBeGreaterThan(15);
  });

  it('is not hiding in a range that should have been derived', () => {
    // The structural half is done, and this is what stops it coming back:
    // a new program cannot ship a hand-written "V3-V6".
    const authored = PROGRAMS.map((p) => p.gradeRange.label).filter((l): l is string => l !== undefined);
    expect(authored.filter((l) => TOKEN.test(l)), 'this range is derivable').toEqual([]);
  });
});
