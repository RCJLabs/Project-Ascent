import { describe, expect, it } from 'vitest';
import { newSession, type Climb, type Session, type WallAngle } from '@/db/sessions';
import { angles, describeAngles, ENOUGH } from './angles';

/**
 * What you avoid (PLAN.md M108).
 *
 * A coach's first question of anyone who has plateaued, and the record
 * could not answer it: a `Climb` was grade, scale, count, result, ascent
 * style and a name.
 */

const climb = (grade: string, angle?: WallAngle, count = 1, patch: Partial<Climb> = {}): Climb => ({
  id: `c-${grade}-${angle ?? 'none'}-${Math.random()}`,
  grade,
  scale: grade.startsWith('V') ? 'V' : 'YDS',
  count,
  result: 'send',
  ...(angle ? { angle } : {}),
  ...patch,
});

const day = (climbs: Climb[], patch: Partial<Session> = {}): Session =>
  newSession('2026-01-01', 0, { completed: true, climbs, ...patch });

const read = (climbs: Climb[], patch: Partial<Session> = {}) => angles([day(climbs, patch)], 'V');

/** `n` sends of one grade on one angle, enough to clear the coverage gate. */
const many = (grade: string, angle: WallAngle, n: number) => climb(grade, angle, n);

describe('counting what was tagged', () => {
  it('keeps the angles apart', () => {
    const out = read([climb('V5', 'slab'), climb('V7', 'roof')]);
    expect(out.sides.map((s) => [s.angle, s.tally.best])).toEqual([
      ['slab', 'V5'],
      ['roof', 'V7'],
    ]);
  });

  it('reports them in the order a wall leans', () => {
    const out = read([climb('V4', 'roof'), climb('V4', 'slab'), climb('V4', 'overhang')]);
    expect(out.sides.map((s) => s.angle)).toEqual(['slab', 'overhang', 'roof']);
  });

  // An absent angle is a climb nobody answered about, not a vertical one.
  it('does not read an untagged climb as any angle', () => {
    const out = read([climb('V5'), climb('V6', 'slab')]);
    expect(out.sides).toHaveLength(1);
    expect(out.said).toBe(1);
    expect(out.total).toBe(2);
  });

  it('counts climbs rather than rows', () => {
    expect(read([climb('V4', 'slab', 3), climb('V5', undefined, 2)]).said).toBe(3);
    expect(read([climb('V4', 'slab', 3), climb('V5', undefined, 2)]).total).toBe(5);
  });

  it('ignores the other scale', () => {
    const out = angles([day([climb('5.11a', 'roof'), climb('V4', 'slab')])], 'V');
    expect(out.total).toBe(1);
    expect(out.sides.map((s) => s.angle)).toEqual(['slab']);
  });

  it('ignores a session that was never finished', () => {
    expect(read([climb('V5', 'slab')], { completed: false }).said).toBe(0);
  });

  it('counts an attempt toward coverage without making it a best', () => {
    const out = read([climb('V9', 'roof', 1, { result: 'attempt' })]);
    expect(out.said).toBe(1);
    expect(out.sides[0]!.tally.best).toBeNull();
  });
});

describe('what it says', () => {
  const say = (climbs: Climb[]) => describeAngles(read(climbs));

  it('says nothing when nothing was tagged', () => {
    expect(say([climb('V5'), climb('V6')])).toBeNull();
  });

  // A climber who tagged four roofs in one session and nothing else would
  // otherwise be told roofs are their strength.
  it('refuses a shape until enough climbs carry an angle', () => {
    const out = say([many('V6', 'roof', ENOUGH - 1), climb('V3', 'slab', 0)])!;
    expect(out).toMatch(/Not enough yet to read a shape from/);
    expect(out).not.toMatch(/rungs between them/);
  });

  it('reads a shape at exactly the threshold, not one past it', () => {
    const half = ENOUGH / 2;
    const at = say([many('V6', 'roof', half), many('V4', 'slab', half)])!;
    expect(at).toMatch(/rungs between them/);
    const under = say([many('V6', 'roof', half), many('V4', 'slab', half - 1)])!;
    expect(under).toMatch(/Not enough yet/);
  });

  /**
   * An angle you have only fallen off is not an end of anything. Letting
   * one in compares a grade that was sent against a grade that was not.
   */
  it('will not make an angle with no send one of the ends', () => {
    const out = say([many('V5', 'slab', ENOUGH), climb('V9', 'roof', 4, { result: 'attempt' })])!;
    expect(out).toMatch(/all the sends are slab/);
    expect(out).not.toMatch(/V9/);
  });

  it('states coverage before anything else', () => {
    const out = say([many('V6', 'roof', 6), many('V4', 'slab', 6), climb('V5', undefined, 3)])!;
    expect(out).toMatch(/^12 of your 15 climbs on this ladder say which angle they were on/);
  });

  it('names the two ends and the rungs between them', () => {
    const out = say([many('V6', 'roof', 6), many('V4', 'slab', 6)])!;
    expect(out).toMatch(/V6 roof, V4 slab — 2 rungs between them/);
  });

  it('counts one rung in the singular', () => {
    expect(say([many('V6', 'roof', 6), many('V5', 'slab', 6)])).toMatch(/1 rung between them/);
  });

  it('says level rather than nought rungs', () => {
    const out = say([many('V5', 'roof', 6), many('V5', 'slab', 6)])!;
    expect(out).toMatch(/level across the angles you have tagged/);
    expect(out).not.toMatch(/0 rungs/);
  });

  /**
   * The milestone's "Never". Which end is a weakness and which is just
   * where this climber climbs is a judgement about a person — the angle
   * nobody logs is as likely to be the one their gym does not have.
   */
  // The card is headed "The walls you climb on"; a body ending on the same
  // phrase is the heading twice, which the rendered card made obvious.
  it('does not end on the card\'s own title', () => {
    expect(say([many('V6', 'roof', 6), many('V4', 'slab', 6)])).not.toMatch(/the walls you climb on/);
  });

  it('calls neither end a weakness', () => {
    const out = say([many('V8', 'roof', 8), many('V2', 'slab', 8)])!;
    expect(out).not.toMatch(/weak|avoid|should|need to|work on|problem|worst/i);
    expect(out).toMatch(/nothing about which angles your wall actually has/);
  });

  it('will not read a shape from one angle', () => {
    const out = say([many('V6', 'roof', ENOUGH + 2)])!;
    expect(out).toMatch(/One angle is not a shape/);
  });

  it('says so when the tagged climbs were all attempts', () => {
    const out = say([climb('V9', 'roof', ENOUGH + 2, { result: 'attempt' })])!;
    expect(out).toMatch(/none of them were sent/);
  });
});
