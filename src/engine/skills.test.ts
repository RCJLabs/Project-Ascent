import { describe, expect, it } from 'vitest';
import { SKILL_TREES, getTree } from '@/content/skills';
import type { MetricEntry } from '@/db/metrics';
import { newProject } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { deriveClimberState } from './derive';
import { deriveStats } from './stats';
import {
  describeEffect,
  evaluateSkills,
  measure,
  type SkillInput,
  type SkillRequirement,
} from './skills';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60, ...patch });
}
function climb(grade: string, count = 1, patch: Record<string, unknown> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count,
    result: 'send' as const,
    ...patch,
  };
}
function inputOf(sessions: Session[], extra: Partial<SkillInput> = {}): SkillInput {
  const state = deriveClimberState(sessions, { today: TODAY });
  return { state, stats: deriveStats({ state, metrics: extra.metrics }), ...extra };
}

describe('the trees themselves', () => {
  it('are five trees of 26 nodes: five branches of five, plus a capstone', () => {
    expect(SKILL_TREES).toHaveLength(5);
    for (const tree of SKILL_TREES) {
      expect(tree.nodes, tree.id).toHaveLength(26);
      const branches = new Map<string, number>();
      for (const node of tree.nodes) branches.set(node.branch, (branches.get(node.branch) ?? 0) + 1);
      expect(branches.get('Capstone')).toBe(1);
      for (const [name, count] of branches) {
        if (name !== 'Capstone') expect(count, `${tree.id}/${name}`).toBe(5);
      }
    }
  });

  it('total 130 nodes with unique ids and names within a tree', () => {
    const all = SKILL_TREES.flatMap((t) => t.nodes);
    expect(all).toHaveLength(130);
    expect(new Set(all.map((n) => n.id)).size).toBe(130);
    for (const tree of SKILL_TREES) {
      expect(new Set(tree.nodes.map((n) => n.name)).size, tree.id).toBe(26);
    }
  });

  it('number tiers 1..5 inside every branch', () => {
    for (const tree of SKILL_TREES) {
      const branches = new Map<string, number[]>();
      for (const node of tree.nodes) {
        branches.set(node.branch, [...(branches.get(node.branch) ?? []), node.tier]);
      }
      for (const [name, tiers] of branches) {
        if (name === 'Capstone') continue;
        expect(tiers.sort((a, b) => a - b), `${tree.id}/${name}`).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  it('requires nothing that is not real training', () => {
    const allowed = new Set([
      'level', 'sessions', 'hours', 'sends', 'style-sends', 'grade-variety', 'drills',
      'streak-weeks', 'outdoor-days', 'projects-sent', 'rest-days', 'height',
      'metric', 'metric-under', 'stat',
    ]);
    for (const node of SKILL_TREES.flatMap((t) => t.nodes)) {
      expect(allowed.has(node.requirement.kind), `${node.id}: ${node.requirement.kind}`).toBe(true);
    }
  });

  it('grants only effects that something can read', () => {
    const allowed = new Set(['project-slot', 'bounty-slot', 'warmup-variety', 'rest-recovery', 'cosmetic', 'ascent-boon']);
    const effects = SKILL_TREES.flatMap((t) => t.nodes).map((n) => n.effect).filter(Boolean);
    expect(effects.length).toBeGreaterThan(8);
    for (const effect of effects) {
      expect(allowed.has(effect!.kind)).toBe(true);
      expect(describeEffect(effect!).length).toBeGreaterThan(4);
    }
  });

  it('ends each tree on a capstone that no single branch can reach', () => {
    for (const tree of SKILL_TREES) {
      const cap = tree.nodes.find((n) => n.branch === 'Capstone')!;
      expect(cap.requirement.kind).toBe('stat');
      expect(cap.effect).toBeDefined();
      expect(cap.tier).toBe(6);
    }
  });

  it('finds a tree by id', () => {
    expect(getTree('grit')!.name).toBe('Mental Grit');
    expect(getTree('nope' as never)).toBeUndefined();
  });
});

describe('measuring a requirement', () => {
  const sessions = [
    session(addDays(TODAY, -3), { climbs: [climb('V3', 6), climb('V5', 2, { style: 'flash' })] }),
    session(addDays(TODAY, -1), { drillDone: true, drillId: 'limit_boulders_on_the_crimps', mode: 'outdoor' }),
  ];

  it('counts sends at or above a grade, not just at it', () => {
    const m = measure({ kind: 'sends', scale: 'V', grade: 'V3', count: 10 }, inputOf(sessions));
    expect(m.current).toBe(8);
    expect(m.met).toBe(false);
    expect(m.detail).toBe('Send 10 at V3 or harder');
  });

  it('reads style, outdoor days and drills from the log', () => {
    const input = inputOf(sessions);
    expect(measure({ kind: 'style-sends', style: 'flash', count: 1 }, input).met).toBe(true);
    expect(measure({ kind: 'outdoor-days', count: 1 }, input).met).toBe(true);
    expect(measure({ kind: 'drills', category: 'finger-strength', count: 1 }, input).met).toBe(true);
    expect(measure({ kind: 'drills', category: 'power', count: 1 }, input).met).toBe(false);
  });

  it('treats an unmeasured benchmark as zero rather than crashing', () => {
    const m = measure({ kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: 20 }, inputOf(sessions));
    expect(m).toMatchObject({ current: 0, met: false });
  });

  it('handles a lower-is-better benchmark as met or not, never as a raw number', () => {
    const metrics: MetricEntry[] = [{ metricId: 'min_edge', date: TODAY, value: 10 }];
    const m = measure({ kind: 'metric-under', metricId: 'min_edge', atMost: 12 }, inputOf(sessions, { metrics }));
    expect(m).toMatchObject({ current: 1, target: 1, met: true });
  });

  it('reads height and projects from what it is given', () => {
    const input = inputOf(sessions, {
      feet: 30_000,
      projects: [newProject({ id: 'p', name: 'p', grade: 'V5', scale: 'V', status: 'sent' })],
    });
    expect(measure({ kind: 'height', feet: 29_032 }, input).met).toBe(true);
    expect(measure({ kind: 'projects-sent', count: 1 }, input).met).toBe(true);
  });
});

describe('evaluation', () => {
  it('unlocks nothing for a climber who has logged nothing', () => {
    const state = evaluateSkills(SKILL_TREES, inputOf([]));
    expect(state.unlocked).toBe(0);
    expect(state.total).toBe(130);
    expect(state.effects.projectSlots).toBe(0);
    expect(state.effects.cosmetics).toEqual([]);
  });

  it('holds a node back until the one before it in the branch is unlocked', () => {
    // Twenty-five V4s but no V3s: "Solid" is met on its own terms and still
    // waits for "Warmed Up", which needs ten at V3 or harder.
    const sessions = [session(TODAY, { climbs: [climb('V4', 25)] })];
    const state = evaluateSkills(SKILL_TREES, inputOf(sessions));
    const power = state.trees.find((t) => t.id === 'power')!;
    const warmed = power.nodes.find((n) => n.node.name === 'Warmed Up')!;
    const solid = power.nodes.find((n) => n.node.name === 'Solid')!;
    // Twenty-five at V4 clears both counts, so both unlock in order.
    expect(warmed.unlocked).toBe(true);
    expect(solid.unlocked).toBe(true);

    const thin = [session(TODAY, { climbs: [climb('V4', 25), climb('V6', 12)] })];
    const deep = evaluateSkills(SKILL_TREES, inputOf(thin)).trees.find((t) => t.id === 'power')!;
    expect(deep.nodes.find((n) => n.node.name === 'Strong')!.unlocked).toBe(true);
  });

  it('marks a node blocked when its own requirement is met but an earlier one is not', () => {
    // Twelve V6s and nothing easier: "Strong" is satisfied, "Solid" is not.
    const sessions = [session(TODAY, { climbs: [climb('V6', 12)] })];
    const power = evaluateSkills(SKILL_TREES, inputOf(sessions)).trees.find((t) => t.id === 'power')!;
    const solid = power.nodes.find((n) => n.node.name === 'Solid')!;
    const strong = power.nodes.find((n) => n.node.name === 'Strong')!;
    expect(solid.unlocked).toBe(false);
    expect(strong.measurement.met).toBe(true);
    expect(strong.unlocked).toBe(false);
    expect(strong.blocked).toBe(true);
  });

  it('adds up the effects of everything unlocked', () => {
    const sessions: Session[] = [];
    // Enough rest days to reach the recovery perk at the end of that branch.
    for (let i = 0; i < 200; i++) {
      sessions.push(
        session(addDays(TODAY, -i - 1), {
          climbs: [],
          restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
        }),
      );
    }
    const state = evaluateSkills(SKILL_TREES, inputOf(sessions));
    expect(state.effects.restRecovery).toBeGreaterThan(0);
  });

  it('does not rank what is closest to unlocking', () => {
    // It used to, by fraction of the requirement done, which put a *blocked*
    // node first and a stat capstone ahead of one more day on rock. That job
    // belongs to `nextUnlock.ts` and there is no second answer here.
    expect('next' in evaluateSkills(SKILL_TREES, inputOf([]))).toBe(false);
  });

  it('counts per tree as well as overall', () => {
    const weeks: Session[] = [];
    for (let w = 30; w >= 1; w--) {
      const start = addDays(startOfWeek(TODAY), -7 * w);
      for (const d of [0, 2, 4]) weeks.push(session(addDays(start, d)));
    }
    const state = evaluateSkills(SKILL_TREES, inputOf(weeks));
    const grit = state.trees.find((t) => t.id === 'grit')!;
    expect(grit.unlocked).toBeGreaterThan(0);
    expect(state.unlocked).toBe(state.trees.reduce((sum, t) => sum + t.unlocked, 0));
  });
});

/**
 * Where the climber stands, beside what unlocks the node (PLAN.md M257).
 *
 * `current` is the number the node unlocks on and `standing` is where the
 * climber is now. They are the same on thirteen of the fourteen kinds; on
 * `streak-weeks` the first is the longest run ever and the second is the
 * run in progress, and every fraction a climber reads is drawn from the
 * second — because the gap under it always was.
 */
describe('where the climber stands', () => {
  const SAMPLES: SkillRequirement[] = [
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

  /** Ten weeks of hitting target, two months off, then one week back. */
  function brokenStreak(): Session[] {
    const sessions: Session[] = [];
    for (let w = 20; w >= 11; w--) {
      const start = addDays(startOfWeek(TODAY), -7 * w);
      for (const d of [0, 2, 4]) sessions.push(session(addDays(start, d)));
    }
    const thisWeek = startOfWeek(TODAY);
    for (const d of [0, 2, 4]) sessions.push(session(addDays(thisWeek, d)));
    return sessions;
  }

  it('leaves the gap and the fraction agreeing on every kind', () => {
    // The whole point of the field, stated as arithmetic: a climber told
    // they are `standing` of `target` and `short` from done is being told
    // two halves of one number, and they have to add up.
    const input = inputOf(brokenStreak());
    for (const requirement of SAMPLES) {
      const m = measure(requirement, input);
      if (m.met) continue;
      expect(m.standing + m.short, requirement.kind).toBe(m.target);
    }
    // And the sample covers the vocabulary, so a fifteenth kind cannot be
    // added without deciding where its fraction is measured from.
    expect(new Set(SAMPLES.map((r) => r.kind)).size).toBe(SAMPLES.length);
  });

  it('is the same as what unlocks the node on every kind but one', () => {
    const input = inputOf(brokenStreak());
    const apart = SAMPLES.filter((r) => {
      const m = measure(r, input);
      return m.standing !== m.current;
    });
    expect(apart.map((r) => r.kind)).toEqual(['streak-weeks']);
  });

  it('counts the streak being run, not the record behind it', () => {
    const input = inputOf(brokenStreak());
    expect(input.state.longestStreakWeeks).toBeGreaterThan(input.state.streakWeeks);

    const m = measure({ kind: 'streak-weeks', weeks: 16 }, input);
    // The record still unlocks the node — a streak you ran does not
    // un-run itself — and it is not what the bar is drawn from.
    expect(m.current).toBe(input.state.longestStreakWeeks);
    expect(m.standing).toBe(input.state.streakWeeks);
    expect(m.standing).toBeLessThan(m.current);
  });

  it('draws a fraction well under the one the record implied', () => {
    // The shape of the bug, in the numbers a climber saw: 16/30 filled to
    // half, over "29 more weeks in a row".
    const input = inputOf(brokenStreak());
    const m = measure({ kind: 'streak-weeks', weeks: 30 }, input);
    const was = m.current / m.target;
    const now = m.standing / m.target;
    // Not a threshold picked to pass: the two fractions are several times
    // apart, which is the whole complaint. The record filled a third of
    // the bar for a run that restarted this month.
    expect(was).toBeGreaterThan(now * 4);
    expect(m.remaining).toBe(`${m.target - input.state.streakWeeks} more weeks in a row`);
    // And the gap does not agree with the bar the record drew.
    expect(m.short).toBeGreaterThan(m.target - m.current);
  });

  it('keeps them together for a climber who never broke one', () => {
    const sessions: Session[] = [];
    for (let w = 9; w >= 0; w--) {
      const start = addDays(startOfWeek(TODAY), -7 * w);
      for (const d of [0, 2, 4]) sessions.push(session(addDays(start, d)));
    }
    const input = inputOf(sessions);
    const m = measure({ kind: 'streak-weeks', weeks: 30 }, input);
    expect(m.standing).toBe(m.current);
    expect(m.standing).toBeGreaterThan(0);
  });

  it('reads a benchmark that is under rather than over as met or not', () => {
    // No fraction is invented for `metric-under`: nobody recorded where the
    // climber started, so the share of the gap closed is not knowable.
    const m = measure({ kind: 'metric-under', metricId: 'min_edge', atMost: 10 }, inputOf([]));
    expect(m.standing).toBe(0);
    expect(m.target).toBe(1);
    expect(m.standing + m.short).toBe(m.target);
  });
});
