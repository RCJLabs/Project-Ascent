import { beforeAll, describe, expect, it } from 'vitest';
import { PROGRAMS, getProgram, loadPrograms } from '@/content/programs';
import { DRILLS, loadDrills } from '@/content/drills/index';
import { METRICS, getMetric } from '@/content/metrics';
import type { Equipment } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { KIT_CHIPS, KIT_NAMES, kitForMetric, kitOffer, unclaimedKit } from './kit';

/**
 * What the log says you can train on (PLAN.md M236).
 *
 * The climber answers once and the app never looked again. These are about
 * the looking — and about the rule that makes it safe to look, which is that
 * every piece of evidence is a table the app already authored for something
 * else rather than an inference from prose.
 */

beforeAll(async () => {
  await loadPrograms();
  await loadDrills();
});

const DAY = '2026-03-02';

const reading = (metricId: string, date = DAY): MetricEntry =>
  ({ metricId, date, value: 20, createdAt: `${date}T10:00:00.000Z` }) as MetricEntry;

const session = (body: Partial<Session> = {}): Session =>
  ({
    id: `${DAY}#0`,
    date: DAY,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${DAY}T18:00:00.000Z`,
    updatedAt: `${DAY}T18:00:00.000Z`,
    ...body,
  }) as Session;

const DEFAULT_KIT: Equipment[] = ['wall', 'gym'];

function ask(body: Partial<Parameters<typeof unclaimedKit>[0]> = {}) {
  return unclaimedKit({ declared: DEFAULT_KIT, sessions: [], metrics: [], ...body });
}

/**
 * The measurement the milestone rests on, pinned so it cannot quietly stop
 * being true. If a catalogue edit made the hangboard optional everywhere,
 * this whole module would be solving nothing and should say so.
 */
describe('what the default kit turns away', () => {
  it('blocks five of the thirteen programs on a hangboard alone', () => {
    const need = PROGRAMS.filter((p) => p.equipment.includes('hangboard'));
    expect(need.map((p) => p.name).sort()).toEqual([
      'Gravity Defied',
      'Iron Grip',
      'Lockdown',
      'Peak Performance',
      'The Siege',
    ]);
    expect(PROGRAMS).toHaveLength(13);
    // And the default kit does not have one, which is the whole problem.
    expect(DEFAULT_KIT).not.toContain('hangboard');
  });
});

describe('kit the log has used and the profile does not claim', () => {
  it('says nothing when the profile already claims everything used', () => {
    expect(ask({ declared: ['wall', 'gym', 'hangboard'], metrics: [reading('max_hang_20mm_7s')] })).toEqual([]);
  });

  it('says nothing about an empty log', () => {
    expect(ask()).toEqual([]);
  });

  /** The program is the strongest statement, because the app acted on it. */
  it('reads the program being run', () => {
    const found = ask({ program: getProgram('iron_grip') });
    expect(found).toEqual([{ kit: 'hangboard', why: 'Iron Grip asks for one.' }]);
  });

  it('reads a benchmark that cannot be recorded without one', () => {
    const found = ask({ metrics: [reading('max_hang_20mm_7s', '2026-02-11')] });
    expect(found).toHaveLength(1);
    expect(found[0]!.kit).toBe('hangboard');
    expect(found[0]!.why).toMatch(/^You recorded a Max Hang 20mm 7s on /);
  });

  /**
   * And the newest one, because the date is most of what makes the sentence
   * checkable: a climber can remember last month and cannot remember 2024.
   */
  it('cites the most recent reading, not the first', () => {
    const found = ask({
      metrics: [reading('max_hang_20mm_7s', '2024-05-02'), reading('max_hang_20mm_7s', '2026-02-11')],
    });
    expect(found[0]!.why).toContain('Feb');
    expect(found[0]!.why).not.toContain('2024');
  });

  it('reads a drill the catalogue says needs one', () => {
    const drill = DRILLS.find((d) => d.equipment.includes('hangboard'))!;
    const found = ask({ sessions: [session({ drillId: drill.id, drillDone: true })] });
    expect(found).toEqual([{ kit: 'hangboard', why: `You completed ${drill.name} on Mar 2.` }]);
  });

  it('ignores a drill that was scheduled and not done', () => {
    const drill = DRILLS.find((d) => d.equipment.includes('hangboard'))!;
    expect(ask({ sessions: [session({ drillId: drill.id, drillDone: false })] })).toEqual([]);
    expect(ask({ sessions: [session({ drillId: drill.id })] })).toEqual([]);
  });

  /**
   * One reason per kit, and the strongest. A climber reading three sentences
   * about the same board is a climber reading none of them.
   */
  it('keeps the strongest reason and drops the rest', () => {
    const drill = DRILLS.find((d) => d.equipment.includes('hangboard'))!;
    const found = ask({
      program: getProgram('iron_grip'),
      metrics: [reading('max_hang_20mm_7s')],
      sessions: [session({ drillId: drill.id, drillDone: true })],
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.why).toBe('Iron Grip asks for one.');
  });

  /** `none` is the absence of kit, not a sixth thing to offer. */
  it('never offers nothing as a thing to own', () => {
    const offWall = DRILLS.find((d) => d.equipment.every((e) => e === 'none'))!;
    expect(ask({ declared: [], sessions: [session({ drillId: offWall.id, drillDone: true })] })).toEqual([]);
  });

  /**
   * One-directional, on purpose. A hangboard in a cupboard is still a
   * hangboard, so the app has no business removing one it has not seen used.
   */
  it('never takes anything away', () => {
    const found = unclaimedKit({
      declared: ['wall', 'gym', 'campus', 'weight', 'hangboard'],
      sessions: [],
      metrics: [],
    });
    expect(found).toEqual([]);
  });
});

describe('the metrics that need a board', () => {
  /**
   * The rule that keeps `EDGE_METRICS` from becoming a guess: every id in it
   * has to be a hang on an edge **by the registry's own description**. An id
   * added because it feels finger-ish fails here.
   */
  it('names only metrics whose own description is a hang on an edge', () => {
    const board = (Object.keys(METRICS) as (keyof typeof METRICS)[]).filter(
      (id) => kitForMetric(id) === 'hangboard',
    );
    expect(board.length).toBeGreaterThan(1);
    for (const id of board) {
      const text = `${getMetric(id)?.label ?? ''} ${getMetric(id)?.description ?? ''}`;
      // `repeater` is in the vocabulary because a 7/3 repeater is a protocol
      // performed on an edge by definition — as specific a word as "edge"
      // itself, and the reason `repeater_weight` belongs here. The first
      // version of this rule left it out and caught that entry, which is the
      // rule doing its job; widening it is a decision rather than a fudge,
      // and it is written down here so the next one has to be too.
      expect(text, id).toMatch(/edge|hangboard|fingerboard|hang|repeater/i);
    }
  });

  it('reads the battery’s own `requires` rather than a second copy of it', () => {
    // `weighted_pullup_3rm` is authored `requires: 'gym'` in BENCHMARKS and
    // appears nowhere in this module — if it stopped being read from there,
    // this is what would notice.
    expect(kitForMetric('weighted_pullup_3rm')).toBe('gym');
    expect(kitForMetric('max_hang_20mm_7s')).toBe('hangboard');
  });

  it('claims nothing about a metric that needs no kit', () => {
    expect(kitForMetric('max_pullups')).toBeNull();
    expect(kitForMetric('toe_touch')).toBeNull();
    expect(kitForMetric('max_boulder_grade')).toBeNull();
  });
});

describe('what each kit is called', () => {
  it('gives every kit a chip and a word, and `none` no chip', () => {
    for (const kit of KIT_CHIPS) {
      expect(KIT_NAMES[kit].chip, kit).toBeTruthy();
      expect(KIT_NAMES[kit].word, kit).toBeTruthy();
    }
    expect(KIT_NAMES.none.chip).toBeNull();
    // Five chips, and every `Equipment` but `none` has one.
    expect(KIT_CHIPS).toHaveLength(Object.keys(KIT_NAMES).length - 1);
    expect(KIT_CHIPS).not.toContain('none');
  });

  it('writes the offer as one sentence, however many there are', () => {
    expect(kitOffer([])).toBeNull();
    expect(kitOffer([{ kit: 'hangboard', why: 'x' }])).toBe('Your log has you using a hangboard.');
    expect(
      kitOffer([
        { kit: 'hangboard', why: 'x' },
        { kit: 'campus', why: 'y' },
      ]),
    ).toBe('Your log has you using a hangboard and a campus board.');
    expect(
      kitOffer([
        { kit: 'hangboard', why: 'x' },
        { kit: 'campus', why: 'y' },
        { kit: 'weight', why: 'z' },
      ]),
    ).toBe('Your log has you using a hangboard, a campus board and a way to add weight.');
  });
});
