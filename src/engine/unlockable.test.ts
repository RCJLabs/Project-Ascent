import { beforeAll, describe, expect, it } from 'vitest';
import { SKILL_TREES } from '@/content/skills';
import { cosmeticSources, evaluateSkills } from './skills';
import { ACHIEVEMENT_COUNT, deriveAchievements, type AchievementInput } from './achievements';
import { OUTFITS } from './avatar';
import { deriveClimberState } from './derive';
import { loadPrograms } from '@/content/programs';
import { loadDrills } from '@/content/drills';
import { MAX_STAT, STAT_LABELS, type Stat, type StatId } from './stats';
import { V_GRADES, YDS_GRADES } from './grades';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';

/**
 * Everything the game offers can actually be got (PLAN.md M199).
 *
 * `wired.test.ts` holds the app to "nothing is built and left unreachable".
 * The game had no such rule, and it is the half of the app whose whole job
 * is to be chased: a badge nobody can earn costs a climber real sessions
 * before they work out it was never coming.
 */

const TODAY = '2026-09-15';
const DRILLS = ['lock_off_holds_on_wall','endurance_intervals_4x4','sticky_feet',
  'tlg_onsight_route_reading','deload_flow_rpe_5','box_breathing_projecting',
  'limit_boulders_on_the_crimps','tlg_linked_laps_doubles','send_week_foundations',
  'volume_build_mini_assessment'];

type Patch = Partial<Record<string, unknown>>;

function made(date: string, patch: Patch = {}): Session {
  return {
    id: `${date}#${String(patch.id ?? 'a')}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 120,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  } as unknown as Session;
}

const send = (grade: string, scale: 'V' | 'YDS' = 'V', count = 1, patch: Patch = {}) =>
  ({ id: `${grade}-${Math.random()}`, grade, scale, count, result: 'send', ...patch });
const tried = (grade: string, scale: 'V' | 'YDS' = 'V', count = 1) =>
  ({ id: `${grade}-a-${Math.random()}`, grade, scale, count, result: 'attempt' });

/** Two years of everything, every fourth day a rest day. */
function everything(): Session[] {
  return Array.from({ length: 1200 }, (_, i) => {
    const date = addDays(TODAY, -i);
    const rest = i % 4 === 3;
    const common = {
      id: String(i),
      mode: i % 3 === 0 ? 'outdoor' : 'indoor',
      rpe: rest ? 2 : 7,
      durationMin: 180,
      drillId: DRILLS[i % DRILLS.length],
      drillDone: true,
    };
    if (rest) return made(date, { ...common, restChecklist: {}, climbs: [] });
    return made(date, {
      ...common,
      climbs: [
        send(V_GRADES[i % V_GRADES.length]!, 'V', 6, { style: 'onsight', angle: 'overhang' }),
        send(YDS_GRADES[i % YDS_GRADES.length]!, 'YDS', 6, { ropeStyle: 'lead', style: 'flash' }),
        tried(V_GRADES[i % V_GRADES.length]!, 'V', 4),
      ],
    });
  });
}

const HARDEST = V_GRADES.at(-1)!;

/**
 * One scenario per shape the definitions ask for. They are shapes rather
 * than bigger numbers: a sixty-day gap, two sessions on one date, a week
 * holding both an easy session and a maximal one. A single log cannot be
 * all of those at once, which is why this is a list.
 */
const SCENARIOS: { name: string; input: AchievementInput }[] = [];

function scenario(name: string, sessions: Session[], projects: Project[] = []): void {
  SCENARIOS.push({ name, input: { sessions, projects, programWeeks: () => 12 } });
}

beforeAll(async () => {
  await Promise.all([loadPrograms(), loadDrills()]);

  scenario('two years of everything', everything());

  // A break, then a limit send inside the comeback window.
  scenario('a long way back', [
    made(addDays(TODAY, -400), { climbs: [send(HARDEST, 'V', 1)] }),
    made(addDays(TODAY, -300), { climbs: [send(HARDEST, 'V', 1)] }),
    made(addDays(TODAY, -290), { climbs: [send(HARDEST, 'V', 1)] }),
  ]);

  // Four days on rock in a row, the last of them a personal best.
  scenario('a trip', [
    made(addDays(TODAY, -200), { mode: 'outdoor', climbs: [send('V4')] }),
    ...[6, 5, 4, 3].map((d, i) =>
      made(addDays(TODAY, -d), { id: `t${i}`, mode: 'outdoor', climbs: [send(i === 3 ? HARDEST : 'V5')] }),
    ),
  ]);

  // Five grades in one session with nothing failed.
  scenario('the whole spread', [
    made(addDays(TODAY, -30), { climbs: V_GRADES.slice(0, 6).map((g) => send(g)) }),
  ]);

  // Two sessions on one date, and two projects sent that day.
  scenario('twice in a day', [
    made(addDays(TODAY, -20), { id: 'x', climbs: [send('V5')] }),
    made(addDays(TODAY, -20), { id: 'y', climbs: [send('V6')] }),
  ], [
    { id: 'p1', name: 'One', grade: 'V6', scale: 'V', status: 'sent', sentDate: addDays(TODAY, -20) },
    { id: 'p2', name: 'Two', grade: 'V6', scale: 'V', status: 'sent', sentDate: addDays(TODAY, -20) },
  ] as unknown as Project[]);

  // One week holding an easy session, a maximal one, and a rest day after it.
  scenario('both ends', [
    made('2026-08-31', { id: 'e', rpe: 2, climbs: [send('V2')] }),
    made('2026-09-02', { id: 'm', rpe: 9, climbs: [send('V6')] }),
    made('2026-09-03', { id: 'r', restChecklist: {}, climbs: [] }),
  ]);

  // Twenty burns, then the send.
  scenario('persistence', [
    ...Array.from({ length: 6 }, (_, i) =>
      made(addDays(TODAY, -60 + i), { id: `b${i}`, projectAttempts: [{ projectId: 'long', count: 4 }], climbs: [] }),
    ),
  ], [
    { id: 'long', name: 'Long', grade: 'V8', scale: 'V', status: 'sent', sentDate: addDays(TODAY, -54) },
  ] as unknown as Project[]);

  // A deload week: marked, two sessions, nothing above the cap.
  scenario('deload honoured', [
    made('2026-09-07', { id: 'd1', deload: true, rpe: 6, climbs: [send('V3')] }),
    made('2026-09-09', { id: 'd2', deload: true, rpe: 5, climbs: [send('V3')] }),
  ]);

  // A twelve-week block with a session in every week.
  scenario('a block finished', Array.from({ length: 12 }, (_, w) =>
    made(addDays('2026-06-01', w * 7), { id: `w${w}`, programId: 'iron_grip', climbs: [send('V4')] }),
  ));
});

describe('every achievement can be earned', () => {
  it('has scenarios to check', () => {
    expect(SCENARIOS.length).toBeGreaterThan(5);
    expect(ACHIEVEMENT_COUNT).toBeGreaterThan(20);
  });

  it('earns every one of them between them', () => {
    const earned = new Map<string, string>();
    for (const { name, input } of SCENARIOS) {
      for (const a of deriveAchievements(input)) {
        if (a.date !== null && !earned.has(a.id)) earned.set(a.id, name);
      }
    }
    const all = deriveAchievements({ sessions: [], projects: [], programWeeks: () => 12 });
    const missing = all.map((a) => a.id).filter((id) => !earned.has(id));
    expect(missing, `no scenario earns: ${missing.join(', ')}`).toEqual([]);
    expect(earned.size).toBe(ACHIEVEMENT_COUNT);
  });

  it('earns none of them from an empty log', () => {
    // The control: a rule that called everything earned would pass above.
    const none = deriveAchievements({ sessions: [], projects: [], programWeeks: () => 12 });
    expect(none.filter((a) => a.date !== null)).toEqual([]);
  });
});

describe('every skill node can be unlocked', () => {
  const maximal = () => {
    const sessions = everything();
    return {
      state: deriveClimberState(sessions),
      stats: Object.fromEntries(
        (Object.keys(STAT_LABELS) as StatId[]).map((id) => [
          id, { id, value: MAX_STAT, level: MAX_STAT } as unknown as Stat,
        ]),
      ) as Record<StatId, Stat>,
      metrics: ['arc_duration','core_plank','front_lever_hold','hollow_body','lock_off_90',
        'max_dynamic_grade','max_hang_20mm_7s','max_static_grade','weighted_pullup_3rm',
      ].map((metricId) => ({ metricId, date: TODAY, value: 100_000 })) as unknown as MetricEntry[],
      projects: Array.from({ length: 40 }, (_, i) => ({
        id: `pr${i}`, name: `p${i}`, grade: 'V12', scale: 'V', status: 'sent',
        sentDate: addDays(TODAY, -i),
      })) as unknown as Project[],
      level: 999,
      feet: 100_000_000,
    };
  };

  it('leaves nothing locked for a climber who has done everything', () => {
    const { trees } = evaluateSkills(SKILL_TREES, maximal());
    const nodes = trees.flatMap((t) => t.nodes);
    expect(nodes.length).toBeGreaterThan(100);
    const locked = nodes
      .filter((p) => !p.unlocked)
      .map((p) => `${p.node.id}: ${p.measurement.detail} (${p.measurement.current}/${p.measurement.target})`);
    expect(locked, `a maximal climber cannot unlock: ${locked.join('; ')}`).toEqual([]);
  });

  it('leaves everything locked for a climber who has done nothing', () => {
    // The control, and the reason the sweep above is worth reading: a
    // maximal fixture that silently degraded would unlock nothing, and
    // "nothing locked" is also what an empty node list returns.
    const { trees } = evaluateSkills(SKILL_TREES, { state: deriveClimberState([]) });
    const nodes = trees.flatMap((t) => t.nodes);
    expect(nodes.filter((p) => p.unlocked)).toEqual([]);
  });
});

describe('every cosmetic has a way to earn it', () => {
  it('sources each earned outfit from a named node', () => {
    const granted = cosmeticSources(SKILL_TREES);
    const earned = OUTFITS.filter((o) => o.unlock !== undefined);
    expect(earned.length).toBeGreaterThan(0);
    const orphans = earned.filter((o) => granted[o.unlock!] === undefined).map((o) => o.name);
    expect(orphans, 'an outfit no skill node unlocks').toEqual([]);
  });

  it('grants no cosmetic no outfit wears', () => {
    // The other direction: a node promising a kit that does not exist
    // reads as a reward and is a dead string.
    const worn = new Set(OUTFITS.map((o) => o.unlock).filter((u): u is string => u !== undefined));
    const unworn = Object.keys(cosmeticSources(SKILL_TREES)).filter((id) => !worn.has(id));
    expect(unworn).toEqual([]);
  });
});
