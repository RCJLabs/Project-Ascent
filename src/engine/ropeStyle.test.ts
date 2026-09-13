import { describe, expect, it } from 'vitest';
import { newSession, type Climb, type Session } from '@/db/sessions';
import { describeRopeSplit, ENOUGH, ropeSplit } from './ropeStyle';

/**
 * Lead against top-rope (PLAN.md M133).
 *
 * The engine `angles.ts` got and `ropeStyle` did not, held to the same three
 * rules: nothing inferred from an absent answer, coverage stated before any
 * shape is, and a gap reported as a fact rather than as a verdict.
 */

const climb = (grade: string, patch: Partial<Climb> = {}): Climb =>
  ({
    id: `c-${grade}-${Math.random()}`,
    grade,
    scale: grade.startsWith('V') ? 'V' : 'YDS',
    count: 1,
    result: 'send',
    ...patch,
  }) as Climb;

const day = (climbs: Climb[], completed = true): Session =>
  newSession('2026-01-09', 0, { completed, climbs } as never);

/** `ENOUGH` routes of one style, so the split is not thin. */
const many = (style: 'lead' | 'toprope', grade: string): Climb[] =>
  Array.from({ length: ENOUGH }, () => climb(grade, { ropeStyle: style }));

describe('counting what was said', () => {
  it('counts only the routes that say which', () => {
    const split = ropeSplit([day([climb('5.11a', { ropeStyle: 'lead' }), climb('5.11b')])]);
    expect(split.said).toBe(1);
    expect(split.total).toBe(2);
  });

  it('counts a row of four as four', () => {
    const split = ropeSplit([day([climb('5.10a', { ropeStyle: 'lead', count: 4 })])]);
    expect(split.said).toBe(4);
  });

  it('ignores boulders entirely', () => {
    // A rope style on a boulder is a typo, and reading it would put V grades
    // through a YDS ladder.
    const split = ropeSplit([day([climb('V5', { ropeStyle: 'lead' } as never)])]);
    expect(split.total).toBe(0);
    expect(split.sides).toEqual([]);
  });

  it('ignores a session that was never finished', () => {
    expect(ropeSplit([day([climb('5.11a', { ropeStyle: 'lead' })], false)]).said).toBe(0);
  });

  it('puts lead first, whichever order it was logged in', () => {
    const split = ropeSplit([
      day([climb('5.10a', { ropeStyle: 'toprope' }), climb('5.11a', { ropeStyle: 'lead' })]),
    ]);
    expect(split.sides.map((s) => s.style)).toEqual(['lead', 'toprope']);
  });

  it('leaves out a style nobody logged', () => {
    const split = ropeSplit([day([climb('5.11a', { ropeStyle: 'lead' })])]);
    expect(split.sides.map((s) => s.style)).toEqual(['lead']);
  });
});

describe('what it will say, and what it refuses to', () => {
  it('says nothing at all when no route says which', () => {
    expect(describeRopeSplit(ropeSplit([day([climb('5.11a')])]))).toBeNull();
  });

  it('states coverage before anything else', () => {
    const said = describeRopeSplit(ropeSplit([day([climb('5.11a', { ropeStyle: 'lead' }), climb('5.11b')])]));
    expect(said).toMatch(/^1 of your 2 routes say whether/);
  });

  it('refuses the comparison until there is enough of it', () => {
    const said = describeRopeSplit(ropeSplit([day([climb('5.11a', { ropeStyle: 'lead' })])]));
    expect(said).toMatch(/Not enough yet/);
  });

  it('names both ceilings and the rungs between them', () => {
    const said = describeRopeSplit(
      ropeSplit([day([...many('lead', '5.10d'), ...many('toprope', '5.12a')])]),
    );
    expect(said).toMatch(/5\.10d led, 5\.12a top-roped/);
    expect(said).toMatch(/rungs between them/);
  });

  it('never calls the gap a weakness', () => {
    const said = describeRopeSplit(
      ropeSplit([day([...many('lead', '5.10d'), ...many('toprope', '5.12a')])]),
    );
    expect(said).not.toMatch(/weak|should|need to|problem/i);
    expect(said).toMatch(/yours to judge/);
  });

  it('says so when the harder one was led', () => {
    const said = describeRopeSplit(
      ropeSplit([day([...many('lead', '5.12a'), ...many('toprope', '5.10d')])]),
    );
    expect(said).toMatch(/the hardest thing you have done, you led/);
  });

  it('says so when they are level', () => {
    const said = describeRopeSplit(
      ropeSplit([day([...many('lead', '5.11a'), ...many('toprope', '5.11a')])]),
    );
    expect(said).toMatch(/the same grade either way/);
  });

  it('says nothing has been led when nothing has', () => {
    const said = describeRopeSplit(ropeSplit([day(many('toprope', '5.11a'))]));
    expect(said).toMatch(/nothing in the log has been led/);
  });

  it('says so when there are tries and no sends', () => {
    const tried = many('lead', '5.13a').map((c) => ({ ...c, result: 'attempt' }) as Climb);
    expect(describeRopeSplit(ropeSplit([day(tried)]))).toMatch(/none of them were sent/);
  });
});
