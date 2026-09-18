import { describe, expect, it } from 'vitest';
import { newSession, type Climb, type Session } from '@/db/sessions';
import {
  describeRopeContext,
  describeRopeSplit,
  ENOUGH_ROUTES,
  ropeContext,
  ropeSplit,
} from './ropeStyle';

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

/** `ENOUGH_ROUTES` routes of one style, so the split is not thin. */
const many = (style: 'lead' | 'toprope', grade: string): Climb[] =>
  Array.from({ length: ENOUGH_ROUTES }, () => climb(grade, { ropeStyle: style }));

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

/**
 * Whether the split is about leading, or about the company (PLAN.md M276).
 *
 * `describeRopeSplit` ends by refusing to say which — *"a log with no leads in
 * it is as likely to be a gym with no lead wall"* — and `partners.ts` quotes
 * that back: the app *"then says nothing, because it has no way to know."*
 * M237 gave it the way to know.
 */
describe('where the split came from', () => {
  /** A session on a given date, with a partner or without. */
  const sess = (date: string, climbs: Climb[], partners?: string[]): Session =>
    newSession(date, 0, { completed: true, climbs, ...(partners ? { partners } : {}) } as never);

  const routes = (style: 'lead' | 'toprope', n: number, grade = '5.11a'): Climb[] =>
    Array.from({ length: n }, () => climb(grade, { ropeStyle: style }));

  const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-0${1 + (i % 9)}-0${1 + (i % 9)}`);

  /** Six separated sessions: three led with a name, three top-roped without. */
  const separated = (): Session[] => {
    const d = dates(6);
    return [
      sess(d[0]!, routes('lead', 2), ['Alex']),
      sess(d[1]!, routes('lead', 2), ['Alex']),
      sess(d[2]!, routes('lead', 2), ['Alex']),
      sess(d[3]!, routes('toprope', 2, '5.12a')),
      sess(d[4]!, routes('toprope', 2, '5.12a')),
      sess(d[5]!, routes('toprope', 2, '5.12a')),
    ];
  };

  const say = (sessions: Session[]) =>
    describeRopeContext(ropeSplit(sessions), ropeContext(sessions));

  describe('the tally', () => {
    it('counts only sessions carrying a tagged route', () => {
      const context = ropeContext([
        sess('2026-01-01', routes('lead', 2)),
        sess('2026-01-02', [climb('5.10a')]),
        sess('2026-01-03', [climb('V4')]),
      ]);
      expect(context.sessions).toBe(1);
    });

    it('counts a session holding both styles as mixed', () => {
      const context = ropeContext([
        sess('2026-01-01', [...routes('lead', 1), ...routes('toprope', 1)]),
      ]);
      expect(context.mixed).toBe(1);
    });

    it('counts rows of climbs, not rows', () => {
      const context = ropeContext([
        sess('2026-01-01', [climb('5.11a', { ropeStyle: 'lead', count: 4 })], ['Alex']),
      ]);
      expect(context.led).toBe(4);
      expect(context.ledNamed).toBe(4);
    });

    it('never counts an unfinished session', () => {
      const s = newSession('2026-01-01', 0, {
        completed: false,
        climbs: routes('lead', 4),
      } as never);
      expect(ropeContext([s]).sessions).toBe(0);
    });
  });

  describe('when it says nothing at all', () => {
    it('is silent on a thin log, which the split has already explained', () => {
      expect(say([sess('2026-01-01', [...routes('lead', 1), ...routes('toprope', 1)])])).toBeNull();
    });

    it('is silent with only one style: there is no split to account for', () => {
      const d = dates(8);
      const only = d.map((date) => sess(date, routes('lead', 2), ['Alex']));
      expect(ropeSplit(only).thin).toBe(false);
      expect(say(only)).toBeNull();
    });

    it('is silent below enough sessions, however many routes they hold', () => {
      const few = [
        sess('2026-01-01', routes('lead', 8), ['Alex']),
        sess('2026-01-02', routes('toprope', 8, '5.12a')),
      ];
      expect(ropeSplit(few).thin).toBe(false);
      expect(say(few)).toBeNull();
    });
  });

  /**
   * You cannot have led and top-roped on the same afternoon at a gym with no
   * lead wall, or with a partner who will not belay a lead. So a log that
   * mixes them rules the circumstances out — the one reading here that needs
   * no partner field at all.
   */
  describe('a session holding both', () => {
    it('reads the split as a choice made route by route', () => {
      const d = dates(6);
      const mixed = d.map((date) => sess(date, [...routes('lead', 1), ...routes('toprope', 1, '5.12a')]));
      const said = say(mixed);
      expect(said).toContain('same session');
      expect(said).toContain('route by route');
    });

    it('counts the sessions it is talking about', () => {
      const d = dates(6);
      const mixed = d.map((date) => sess(date, [...routes('lead', 1), ...routes('toprope', 1, '5.12a')]));
      expect(say(mixed)).toContain('6 times');
    });

    it('speaks before the partner field is consulted, and names nobody', () => {
      const d = dates(6);
      const mixed = d.map((date) =>
        sess(date, [...routes('lead', 1), ...routes('toprope', 1, '5.12a')], ['Alex']),
      );
      expect(say(mixed)).not.toContain('Alex');
      expect(say(mixed)).toContain('route by route');
    });
  });

  describe('sessions that are all one style', () => {
    it('says so', () => {
      expect(say(separated())).toContain('all lead or all top-rope');
    });

    /**
     * The whole design. `partners.ts`: *"It reports and never scores. How
     * often you climb with someone is a fact about your log; who you climb
     * **best** with is a judgement about a person who is not here to answer
     * it."*
     */
    it('names nobody and counts nobody', () => {
      const said = say(separated())!;
      expect(said).not.toContain('Alex');
      expect(said).not.toMatch(/\bwith [A-Z]/);
    });

    it('joins the partner field when it lines up', () => {
      const said = say(separated())!;
      expect(said).toContain('every route you led was on a session you named somebody on');
      expect(said).toContain('none of your top-rope routes were');
    });

    /** The converse shape, which is rarer and just as true. */
    it('reads the other way round too', () => {
      const d = dates(6);
      const other = [
        sess(d[0]!, routes('lead', 2)),
        sess(d[1]!, routes('lead', 2)),
        sess(d[2]!, routes('lead', 2)),
        sess(d[3]!, routes('toprope', 2, '5.12a'), ['Alex']),
        sess(d[4]!, routes('toprope', 2, '5.12a'), ['Alex']),
        sess(d[5]!, routes('toprope', 2, '5.12a'), ['Alex']),
      ];
      expect(say(other)).toContain('none of the routes you led were');
    });

    /**
     * An empty field is an empty field. `partners.ts` sets the rule: a session
     * naming nobody is *"a field nobody filled"*, not one climbed alone — and
     * the sentence has to say so or it implies solitude.
     */
    it('says which fact it is built on, rather than implying solitude', () => {
      const said = say(separated())!;
      expect(said).toContain('a session naming nobody is one where nothing was typed');
      // "alone" appears exactly once, and only inside the denial. A first
      // draft asserted the word was absent and caught the disclaimer that
      // exists to prevent the implication.
      expect(said.match(/alone/g)).toHaveLength(1);
      expect(said).toContain('not one climbed alone');
    });
  });

  describe('when the partner field cannot carry it', () => {
    it('stops at the separation when nothing is named', () => {
      const d = dates(6);
      const none = [
        sess(d[0]!, routes('lead', 2)),
        sess(d[1]!, routes('lead', 2)),
        sess(d[2]!, routes('lead', 2)),
        sess(d[3]!, routes('toprope', 2, '5.12a')),
        sess(d[4]!, routes('toprope', 2, '5.12a')),
        sess(d[5]!, routes('toprope', 2, '5.12a')),
      ];
      const said = say(none)!;
      expect(said).toContain('all lead or all top-rope');
      expect(said).not.toContain('named somebody');
    });

    /**
     * Below three, the named sessions are a climber who tried the field once.
     *
     * The line-up here is **total** — every led route named, no top-rope route
     * named — so `ENOUGH_NAMED` is the only thing that can stop it. A first
     * draft used a partial line-up and the later totality test stopped it
     * first, which let a mutant on this floor survive.
     */
    it('stops at the separation below enough named sessions', () => {
      const d = dates(6);
      const thin = [
        sess(d[0]!, routes('lead', 2), ['Alex']),
        sess(d[1]!, routes('lead', 2), ['Alex']),
        sess(d[2]!, routes('toprope', 2, '5.12a')),
        sess(d[3]!, routes('toprope', 2, '5.12a')),
        sess(d[4]!, routes('toprope', 2, '5.12a')),
        sess(d[5]!, routes('toprope', 2, '5.12a')),
      ];
      const context = ropeContext(thin);
      expect(context.named).toBe(2);
      // Total, so nothing downstream is what stops it.
      expect(context.ledNamed).toBe(context.led);
      expect(context.ropedNamed).toBe(0);
      expect(say(thin)).not.toContain('named somebody');
    });

    /**
     * Named on everything, which the draft guarded against explicitly and did
     * not need to.
     *
     * If every session is named then `ledNamed === led` and `ropedNamed ===
     * roped`, so a *total* line-up needs one of the two styles to hold no
     * routes at all — and a log like that never reaches here, because
     * `sides.length < 2` has already returned. The totality test does the
     * work, and the extra clause was a guard that could not fire.
     */
    it('stops at the separation when every session is named', () => {
      const d = dates(6);
      const all = [
        sess(d[0]!, routes('lead', 2), ['Alex']),
        sess(d[1]!, routes('lead', 2), ['Alex']),
        sess(d[2]!, routes('lead', 2), ['Alex']),
        sess(d[3]!, routes('toprope', 2, '5.12a'), ['Sam']),
        sess(d[4]!, routes('toprope', 2, '5.12a'), ['Sam']),
        sess(d[5]!, routes('toprope', 2, '5.12a'), ['Sam']),
      ];
      const context = ropeContext(all);
      expect(context.named).toBe(context.sessions);
      expect(say(all)).not.toContain('named somebody');
    });

    /**
     * A fact and not a correlation: stated only where it is total. One led
     * route on an unnamed session and the claim is no longer true.
     */
    it('stops at the separation when the line-up is only partial', () => {
      const d = dates(7);
      const partial = [
        sess(d[0]!, routes('lead', 2), ['Alex']),
        sess(d[1]!, routes('lead', 2), ['Alex']),
        sess(d[2]!, routes('lead', 2), ['Alex']),
        sess(d[3]!, routes('lead', 2)),
        sess(d[4]!, routes('toprope', 2, '5.12a')),
        sess(d[5]!, routes('toprope', 2, '5.12a')),
        sess(d[6]!, routes('toprope', 2, '5.12a')),
      ];
      expect(say(partial)).not.toContain('named somebody');
    });
  });
});
