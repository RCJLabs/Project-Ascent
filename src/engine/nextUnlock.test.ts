import { describe, expect, it } from 'vitest';
import { SKILL_TREES } from '@/content/skills';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { deriveStats } from './stats';
import { EFFORT, describeNext, effortFor, nextUnlock, nextUnlocks, reachable } from './nextUnlock';
import { evaluateSkills, measure, type SkillInput, type SkillRequirement } from './skills';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 90, ...patch });
}
function climb(grade: string, count = 1) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count,
    result: 'send' as const,
  };
}
function inputOf(sessions: Session[], extra: Partial<SkillInput> = {}): SkillInput {
  const state = deriveClimberState(sessions, { today: TODAY });
  return { state, stats: deriveStats({ state, metrics: extra.metrics }), ...extra };
}
const evaluate = (sessions: Session[], extra: Partial<SkillInput> = {}) =>
  evaluateSkills(SKILL_TREES, inputOf(sessions, extra));

/** A year of steady indoor bouldering with the occasional day out. */
function aYear(): Session[] {
  return Array.from({ length: 150 }, (_, i) =>
    session(addDays(TODAY, -Math.floor(i * 2.4)), {
      climbs: [climb('V3', 4), climb('V4', 3), climb('V5', i % 3 === 0 ? 1 : 0)],
      mode: i % 12 === 0 ? 'outdoor' : 'indoor',
    }),
  );
}

describe('what can unlock next', () => {
  it('takes the first locked rung of every branch and nothing above it', () => {
    const state = evaluate(aYear());
    const first = reachable(state);
    for (const entry of first) {
      const branch = state.trees
        .flatMap((t) => t.nodes)
        .filter((n) => n.node.tree === entry.node.tree && n.node.branch === entry.node.branch);
      const below = branch.filter((n) => n.node.tier < entry.node.tier);
      expect(below.every((n) => n.unlocked), `${entry.node.id}`).toBe(true);
      expect(entry.unlocked).toBe(false);
    }
  });

  it('never names a node with a locked rung under it', () => {
    // Not the same check as the blocked one: a node partway through its own
    // requirement is not `blocked`, and is still gated behind the rung below
    // it. Dropping the reachability filter left every other test passing.
    const state = evaluate(aYear());
    const byId = new Map(state.trees.flatMap((t) => t.nodes).map((n) => [n.node.id, n]));
    for (const named of nextUnlocks(state, 130)) {
      const below = [...byId.values()].filter(
        (n) =>
          n.node.tree === named.node.tree &&
          n.node.branch === named.node.branch &&
          n.node.tier < named.node.tier,
      );
      expect(below.every((n) => n.unlocked), `${named.node.id} over ${below.length} rungs`).toBe(
        true,
      );
    }
  });

  it('offers one per branch at most', () => {
    const state = evaluate(aYear());
    const keys = reachable(state).map((e) => `${e.node.tree}/${e.node.branch}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never names a node that is already done and waiting on the rung below', () => {
    // Twelve V6s and nothing easier: "Strong" is satisfied and cannot unlock
    // until "Solid" (25 at V4) does. Ranking by fraction put it first, at
    // ratio 1, and quoted a requirement the climber had already met.
    const state = evaluate([session(TODAY, { climbs: [climb('V6', 12)] })]);
    const strong = state.trees
      .flatMap((t) => t.nodes)
      .find((n) => n.node.name === 'Strong')!;
    expect(strong.blocked).toBe(true);
    expect(nextUnlocks(state, 20).some((n) => n.node.name === 'Strong')).toBe(false);
    expect(reachable(state).every((e) => !e.blocked)).toBe(true);
  });
});

describe('the order', () => {
  it('ranks by what is left rather than by what fraction is behind you', () => {
    // The old ranking put "Reach END 70" first at 67/70 — a capstone, and
    // nothing a climber can go and do — ahead of one more grade and two more
    // days on rock.
    const state = evaluate(aYear());
    const top = nextUnlock(state)!;
    const all = nextUnlocks(state, 130);
    const capstone = all.find((n) => n.node.branch === 'Capstone');
    expect(top.node.branch).not.toBe('Capstone');
    if (capstone) expect(top.effort).toBeLessThan(capstone.effort);

    // And it really is the least work of anything reachable.
    expect(top.effort).toBe(Math.min(...all.map((n) => n.effort)));
  });

  it('prefers one send to fifty sessions even though the fraction says otherwise', () => {
    const state = evaluate(aYear());
    const ordered = nextUnlocks(state, 130);
    const fractions = ordered.map((n) => n.measurement.current / n.measurement.target);
    // If effort and fraction agreed, this ranking would not be worth having.
    expect(fractions).not.toEqual([...fractions].sort((a, b) => b - a));
  });

  it('is stable between two evaluations of the same log', () => {
    const sessions = aYear();
    const a = nextUnlocks(evaluate(sessions), 5).map((n) => n.node.id);
    const b = nextUnlocks(evaluate(sessions), 5).map((n) => n.node.id);
    expect(a).toEqual(b);
  });

  it('weighs every requirement kind', () => {
    // A kind with no weight would sort as free and win every time.
    const kinds = new Set(SKILL_TREES.flatMap((t) => t.nodes).map((n) => n.requirement.kind));
    for (const kind of kinds) expect(EFFORT[kind], kind).toBeGreaterThan(0);
    for (const weight of Object.values(EFFORT)) expect(weight).toBeGreaterThan(0);
  });

  it('does not let an assessment number outrank a session count by unit size', () => {
    // "7 more kilos" and "7 more sessions" are not the same seven, which is
    // why the two assessment kinds are scaled by the fraction still to close
    // rather than multiplied by a gap in arbitrary units.
    const node = SKILL_TREES.flatMap((t) => t.nodes).find((n) => n.requirement.kind === 'metric')!;
    const input = inputOf([]);
    const nothing = measure(node.requirement, input);
    expect(effortFor(node, nothing)).toBeCloseTo(EFFORT.metric, 5);

    // Two assessments half closed cost the same, whatever they are measured
    // in: half of 45 kilos and half of 1,000 anything are the same half.
    const half = { ...nothing, current: nothing.target / 2, short: nothing.target / 2 };
    const big = { current: 500, target: 1000, met: false, detail: '', short: 500, remaining: 'x' };
    expect(effortFor(node, half)).toBeCloseTo(EFFORT.metric / 2, 5);
    expect(effortFor(node, big)).toBeCloseTo(effortFor(node, half), 5);
  });
});

describe('the words', () => {
  it('says the gap, not the requirement', () => {
    const state = evaluate(aYear());
    const top = nextUnlock(state)!;
    expect(top.remaining).not.toBe(top.measurement.detail);
    expect(top.remaining).toMatch(/\d/);
  });

  it('gives every unmet requirement kind something to say', () => {
    const input = inputOf([]);
    const samples: SkillRequirement[] = [
      { kind: 'level', level: 5 },
      { kind: 'sessions', count: 10 },
      { kind: 'hours', hours: 20 },
      { kind: 'sends', scale: 'V', grade: 'V5', count: 3 },
      { kind: 'style-sends', style: 'flash', count: 4 },
      { kind: 'grade-variety', count: 4 },
      { kind: 'drills', category: 'technique', count: 2 },
      { kind: 'streak-weeks', weeks: 8 },
      { kind: 'outdoor-days', count: 15 },
      { kind: 'projects-sent', count: 1 },
      { kind: 'rest-days', count: 6 },
      { kind: 'height', feet: 5000 },
      { kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: 45 },
      { kind: 'metric-under', metricId: 'min_edge', atMost: 10 },
      { kind: 'stat', stat: 'STR', atLeast: 70 },
    ];
    for (const requirement of samples) {
      const m = measure(requirement, input);
      expect(m.met, requirement.kind).toBe(false);
      expect(m.remaining, requirement.kind).not.toBe('');
      expect(m.short, requirement.kind).toBeGreaterThan(0);
    }
    expect(samples.map((r) => r.kind).sort()).toEqual(Object.keys(EFFORT).sort());
  });

  it('says nothing is left once a requirement is met', () => {
    const m = measure({ kind: 'sessions', count: 1 }, inputOf([session(TODAY)]));
    expect(m.met).toBe(true);
    expect(m.remaining).toBe('');
    expect(m.short).toBe(0);
  });

  it('counts a streak from the one you are on, not from your best', () => {
    // Ten weeks of hitting target, then two months off, then one week back.
    const sessions: Session[] = [];
    for (let w = 20; w >= 11; w--) {
      for (const d of [0, 2, 4]) sessions.push(session(addDays(TODAY, -7 * w + d)));
    }
    for (const d of [0, 2, 4]) sessions.push(session(addDays(TODAY, -6 + d)));
    const input = inputOf(sessions);
    expect(input.state.longestStreakWeeks).toBeGreaterThan(input.state.streakWeeks);

    const m = measure({ kind: 'streak-weeks', weeks: 16 }, input);
    expect(m.current).toBe(input.state.longestStreakWeeks);
    // The gap is what is left from here, which is more than the bar implies.
    expect(m.short).toBe(16 - input.state.streakWeeks);
    expect(m.short).toBeGreaterThan(16 - input.state.longestStreakWeeks);
  });

  it('reads as one sentence', () => {
    const line = describeNext(nextUnlock(evaluate(aYear())));
    expect(line).toMatch(/^[A-Z0-9]/);
    expect(line).toMatch(/unlocks\.$/);
    expect(line.length).toBeLessThan(72);
  });

  it('has something for a climber who has logged one session', () => {
    const next = nextUnlock(evaluate([session(TODAY, { climbs: [climb('V2', 3)] })]));
    expect(next).not.toBeNull();
    expect(next!.remaining).not.toBe('');
  });

  it('has nothing to say when the log is empty of everything it measures', () => {
    // Still a real answer: the cheapest first rungs, not a blank.
    const next = nextUnlock(evaluate([]));
    expect(next).not.toBeNull();
    expect(next!.effort).toBeGreaterThan(0);
  });
});

describe('what counts as started', () => {
  it('does not treat the base every stat is handed as training done', () => {
    // Stats start at BASE_STAT so a maxed one lands on exactly 100. Counted
    // as progress, it made a capstone the closest thing for a climber who
    // had logged nothing: "60 more END", three hundred sessions of work.
    const state = evaluate([]);
    const top = nextUnlock(state)!;
    expect(top.node.branch).not.toBe('Capstone');
    expect(top.node.requirement.kind).not.toBe('stat');
    expect(top.effort).toBeLessThan(EFFORT.sessions * 10);
  });

  it('points at what a climber is already doing rather than a box never ticked', () => {
    // A grades-only logger never on-sights and never runs a program's
    // drills, so those one-unit first rungs stay one unit away forever.
    // Ranked on remaining work alone they won every time, and 150 sessions
    // in the prompt was still the one an empty log got.
    const fresh = nextUnlock(evaluate([]))!;
    const seasoned = nextUnlock(evaluate(aYear()))!;
    expect(seasoned.node.id).not.toBe(fresh.node.id);
    expect(seasoned.measurement.current).toBeGreaterThan(0);
  });

  it('falls back to the untouched rungs only when nothing has been started', () => {
    const empty = nextUnlock(evaluate([]))!;
    expect(empty.measurement.current).toBe(0);

    const one = nextUnlock(evaluate([session(TODAY, { climbs: [climb('V2', 3)], durationMin: 90 })]))!;
    expect(one.measurement.current).toBeGreaterThan(0);
  });
});
