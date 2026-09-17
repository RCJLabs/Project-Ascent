import { beforeAll, describe, expect, it } from 'vitest';
import { PROGRAMS, loadPrograms } from '@/content/programs';
import { getMetric, METRICS } from '@/content/metrics';
import { describePlacing, place, standardsFor } from './standards';

/**
 * What a reading qualifies you for (PLAN.md M235).
 *
 * The numbers are the catalogue's own `prerequisites.metrics`, which the
 * finder has read since M38 — to block a program, and only to block one. So
 * most of what is worth checking here is that they are *read* rather than
 * copied, and that the sentence never says more than the catalogue does.
 */

beforeAll(async () => {
  await loadPrograms();
});

const show = (v: number) => `${v}`;

describe('the floors the catalogue sets', () => {
  /**
   * The seam this milestone rests on, pinned. If the prerequisites were
   * emptied out, the whole module would have nothing to say and should fail
   * loudly rather than quietly showing nothing.
   */
  it('exists on eight of the thirteen programs', () => {
    const withFloors = PROGRAMS.filter((p) => (p.prerequisites?.metrics ?? []).length > 0);
    expect(withFloors).toHaveLength(8);
    expect(PROGRAMS).toHaveLength(13);
  });

  it('reads them from the programs rather than a second copy', () => {
    // Changing a program's floor has to move this, which is the only way the
    // sentence can keep agreeing with the finder's blocker.
    const fromPrograms = [
      ...new Set(
        PROGRAMS.flatMap((p) =>
          (p.prerequisites?.metrics ?? [])
            .filter((m) => m.metricId === 'dead_hang')
            .map((m) => m.atLeast),
        ),
      ),
    ].sort((a, b) => a - b);
    // Distinct, because a rung is a number: five programs set a dead-hang
    // floor and they stand on three of them.
    expect(standardsFor('dead_hang').map((s) => s.atLeast)).toEqual(fromPrograms);
    expect(fromPrograms).toEqual([30, 45, 60]);
  });

  it('runs lowest first, so the ladder is a ladder', () => {
    for (const id of ['dead_hang', 'max_pushups', 'core_plank', 'max_boulder_grade'] as const) {
      const ladder = standardsFor(id).map((s) => s.atLeast);
      expect([...ladder].sort((a, b) => a - b), id).toEqual(ladder);
      expect(ladder.length, id).toBeGreaterThan(1);
    }
  });

  it('carries the program that asks and whether it blocks', () => {
    const ladder = standardsFor('dead_hang');
    // Two of the three rungs carry two programs, which is the case that made
    // a rung a number rather than a program in the first place.
    expect(ladder).toEqual([
      { metricId: 'dead_hang', atLeast: 30, programs: ['Base Camp', 'The Cruiser'], soft: true },
      { metricId: 'dead_hang', atLeast: 45, programs: ['Gravity Defied', 'The Long Game'], soft: true },
      { metricId: 'dead_hang', atLeast: 60, programs: ['Iron Grip'], soft: false },
    ]);
  });

  /**
   * The sort is equivalent today, and this is the fact that makes it so.
   *
   * A battery removing `.sort()` survives: `Map` keeps insertion order and the
   * catalogue authors its programs easiest-first, so the rungs come out
   * ascending without being sorted. Writing a test that pretended to catch it
   * would be a test that catches nothing — so the guard goes on the
   * assumption instead. Author a program out of difficulty order and this
   * fires, which is the moment the sort starts earning its place.
   */
  it('has a catalogue whose authored order is already ascending', () => {
    for (const id of ['dead_hang', 'max_pushups', 'core_plank', 'max_boulder_grade'] as const) {
      const asAuthored: number[] = [];
      for (const p of PROGRAMS) {
        for (const m of p.prerequisites?.metrics ?? []) {
          if (m.metricId === id && !asAuthored.includes(m.atLeast)) asAuthored.push(m.atLeast);
        }
      }
      expect([...asAuthored].sort((a, b) => a - b), id).toEqual(asAuthored);
    }
  });

  /**
   * And the `higherIsBetter` guard is equivalent for the same kind of reason:
   * no program sets a floor on a metric that gets better by going down, so
   * `standardsFor` returns nothing there and the guard never gets to matter.
   *
   * It stays because `atLeast` would mean the opposite on such a metric and
   * the day one is authored is the day a silent inversion ships. This is what
   * fires on that day.
   */
  it('has no floor on a metric where lower is better', () => {
    const wrongWay = (Object.keys(METRICS) as (keyof typeof METRICS)[]).filter(
      (id) => standardsFor(id).length > 0 && getMetric(id)?.higherIsBetter === false,
    );
    expect(wrongWay, 'a floor on a lower-is-better metric needs `place` to invert').toEqual([]);
  });

  it('has nothing for a metric no program sets a floor for', () => {
    expect(standardsFor('max_hang_20mm_7s')).toEqual([]);
    expect(standardsFor('min_edge')).toEqual([]);
  });
});

describe('where a reading sits', () => {
  const deadHang = getMetric('dead_hang')!;

  it('names the next floor when nothing is cleared', () => {
    expect(place(deadHang, 20)).toEqual({
      cleared: null,
      next: expect.objectContaining({ atLeast: 30, programs: ['Base Camp', 'The Cruiser'] }),
    });
  });

  it('names the highest cleared and the next above it', () => {
    const at52 = place(deadHang, 52)!;
    expect(at52.cleared).toMatchObject({ atLeast: 45, programs: ['Gravity Defied', 'The Long Game'] });
    expect(at52.next).toMatchObject({ atLeast: 60, programs: ['Iron Grip'] });
  });

  it('counts a reading exactly on a floor as clearing it', () => {
    // `atLeast` is the catalogue's word, and the finder treats it that way.
    expect(place(deadHang, 45)!.cleared).toMatchObject({ atLeast: 45 });
    expect(place(deadHang, 44)!.cleared).toMatchObject({ atLeast: 30 });
  });

  it('runs out at the top rather than inventing a rung', () => {
    const top = place(deadHang, 90)!;
    expect(top.cleared).toMatchObject({ atLeast: 60, programs: ['Iron Grip'] });
    expect(top.next).toBeNull();
  });

  /**
   * `min_edge` gets better by going down, so `atLeast` would mean the
   * opposite there. No program sets one — but rather than guess at an
   * inversion nobody has asked for, the whole thing declines.
   */
  it('says nothing about a metric where lower is better', () => {
    const minEdge = getMetric('min_edge')!;
    expect(minEdge.higherIsBetter).toBe(false);
    expect(place(minEdge, 12)).toBeNull();
  });

  it('says nothing about a metric with no floors at all', () => {
    expect(place(getMetric('max_hang_20mm_7s')!, 30)).toBeNull();
  });
});

describe('the sentence', () => {
  const deadHang = getMetric('dead_hang')!;

  it('is null when there is nothing to say', () => {
    expect(describePlacing(null, show)).toBeNull();
  });

  it('names the floor being worked toward, before any reading', () => {
    expect(describePlacing(place(deadHang, 20), show)).toBe(
      'Base Camp and The Cruiser ask for 30.',
    );
    // One program on a rung takes the singular, which is the only reason the
    // sentence is built rather than templated.
    expect(describePlacing(place(deadHang, 52), show)).toContain('Iron Grip asks for 60');
  });

  it('names what is behind and what is next', () => {
    expect(describePlacing(place(deadHang, 52), show)).toBe(
      'Past 45, which Gravity Defied and The Long Game ask for. Iron Grip asks for 60.',
    );
  });

  it('says so once every floor is behind', () => {
    expect(describePlacing(place(deadHang, 90), show)).toBe(
      'Past every floor the catalogue sets — the highest is the 60 Iron Grip asks for.',
    );
  });

  /**
   * It reports and never judges. The finder is the thing that acts on these
   * numbers; this is the same fact said to the climber, and a sentence that
   * congratulated or warned would be the app having an opinion about a
   * reading it asked for.
   */
  it('never congratulates and never warns', () => {
    const said = [20, 30, 52, 90]
      .map((v) => describePlacing(place(deadHang, v), show) ?? '')
      .join(' ');
    expect(said).not.toMatch(/well done|great|nice|only|just|behind|should|need to|fall(s|ing)? short/i);
  });

  /**
   * And it reads in the climber's own notation. A grade floor stored as an
   * ordinal is `3`, which is not a grade anybody has ever climbed.
   */
  it('shows a grade floor as a grade', () => {
    const boulder = getMetric('max_boulder_grade')!;
    const said = describePlacing(place(boulder, 4), (v) => `V${v}`)!;
    expect(said).toBe('Past V3, which Lockdown asks for. Iron Grip asks for V5.');
  });
});

describe('what it covers', () => {
  /**
   * Seven of the thirty-seven, and the thirty are silent on purpose: the
   * catalogue has nothing authored to say about a toe touch, and an invented
   * band would be the app manufacturing authority. Pinned so that staying
   * silent is a decision rather than a bug nobody noticed.
   */
  it('speaks for seven metrics and stays quiet about the rest', () => {
    const ids = Object.keys(METRICS) as (keyof typeof METRICS)[];
    const spoken = ids.filter((id) => standardsFor(id).length > 0);
    expect(spoken.sort()).toEqual([
      'core_plank',
      'dead_hang',
      'flash_grade',
      'max_boulder_grade',
      'max_pushups',
      'onsight_grade',
      'redpoint_grade',
    ]);
    expect(ids.length).toBe(37);
    for (const id of ['toe_touch', 'wall_angel', 'flexibility', 'box_jump_height'] as const) {
      expect(place(getMetric(id)!, 5), id).toBeNull();
    }
  });
});
