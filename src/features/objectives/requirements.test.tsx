// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { METRICS } from '@/content/metrics';
import { benchmarkFor } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { renderAt, reset } from '@/test/render';
import { ObjectiveDetailPage } from './ObjectiveDetailPage';

/**
 * Every requirement the engine can measure, something can author
 * (PLAN.md M222).
 *
 * `wired.test.ts` holds the app to "nothing is built and left unreachable"
 * and M199 did the same for the game. The requirement vocabulary had no
 * such rule, and it had drifted: of fifteen kinds, **two were authored
 * nowhere at all** and **three more were used freely by the skill trees and
 * offerable by nobody** — so an objective could ask for sixty sessions and
 * not for a number on a hangboard, on the one screen whose claim is that it
 * tracks what has to be true.
 */

const PAGE = readFileSync('src/features/objectives/ObjectiveDetailPage.tsx', 'utf8');
const TREES = readFileSync('src/content/skills.ts', 'utf8');
const ENGINE = readFileSync('src/engine/skills.ts', 'utf8');

/**
 * The kinds the union actually declares, read off the type.
 *
 * Line by line rather than by slicing to the first `;` — each member has one
 * of its own, inside the braces, so a slice keeps exactly one kind and the
 * rule passes over nothing. Found by the controls below.
 */
function declared(source: string): string[] {
  const lines = source.split('\n');
  const from = lines.findIndex((l) => l.startsWith('export type SkillRequirement ='));
  const out: string[] = [];
  for (const line of lines.slice(from + 1)) {
    if (!line.trim().startsWith('|')) break;
    const kind = /kind: '([a-z-]+)'/.exec(line);
    if (kind !== null) out.push(kind[1]!);
  }
  return out;
}

const KINDS = declared(ENGINE);
const ADDABLE = PAGE.slice(PAGE.indexOf('const ADDABLE'), PAGE.indexOf('export function ObjectiveDetailPage'));

const authored = (kind: string) => new RegExp(`kind: '${kind}'`).test(TREES);
const offerable = (kind: string) =>
  new RegExp(`kind: '${kind}'`).test(ADDABLE) ||
  // The benchmark option builds `metric` or `metric-under` from the chosen
  // metric's own direction rather than naming either kind (see `benchmarkFor`).
  ((kind === 'metric' || kind === 'metric-under') && ADDABLE.includes('benchmarkFor('));

describe('the requirement vocabulary', () => {
  it('reads the kinds off the type rather than a list beside it', () => {
    // A hand-kept list here would go stale the first time a kind was added,
    // which is the failure this whole file is about.
    expect(KINDS.length).toBeGreaterThan(10);
    expect(KINDS).toContain('sends');
    expect(KINDS).toContain('metric-under');
  });

  it('has no kind the climber cannot ask for', () => {
    expect(KINDS.filter((kind) => !offerable(kind))).toEqual([]);
  });

  it('has no kind with no editor', () => {
    // Before M222 the switch ended in `default: return null` with a comment
    // saying level, height, metric and stat "have no sensible editor here
    // yet" — so a tree-granted requirement rendered with nothing to change.
    const fields = PAGE.slice(PAGE.indexOf('function RequirementFields'));
    for (const kind of KINDS) {
      expect(fields.includes(`case '${kind}':`), kind).toBe(true);
    }
    expect(fields).not.toContain('default:');
  });

  it('keeps no kind the game pays into', () => {
    // `level` measured XP, which the game lane feeds. An objective gated on
    // it would make playing the arcade a prerequisite for a climbing goal —
    // M218's wall, pointed the wrong way.
    expect(KINDS).not.toContain('level');
    expect(ENGINE).not.toContain("kind: 'level'");
  });

  it('can name every metric, in the direction that metric improves', () => {
    // The two where lower is better are the whole reason `metric-under`
    // exists, and nothing could author one before M222.
    const lower = Object.values(METRICS).filter((m) => !m.higherIsBetter);
    expect(lower.length).toBeGreaterThan(0);
    expect(lower.map((m) => m.id)).toContain('min_edge');
    expect(offerable('metric-under')).toBe(true);
  });

  it('still lets the trees author what they always did', () => {
    // The control: a rule about reachability must not pass by having
    // emptied the trees, and it must not pass over one kind because the
    // parser stopped early — which is exactly what the first version did.
    const used = KINDS.filter(authored);
    expect(KINDS.length).toBe(14);
    expect(used.length).toBeGreaterThanOrEqual(12);
  });
});

describe('a benchmark requirement points the way the benchmark improves', () => {
  it('asks for at least on one that goes up, and at most on one that comes down', () => {
    expect(benchmarkFor('max_hang_20mm_7s', 40)).toEqual({
      kind: 'metric',
      metricId: 'max_hang_20mm_7s',
      atLeast: 40,
    });
    expect(benchmarkFor('min_edge', 12)).toEqual({
      kind: 'metric-under',
      metricId: 'min_edge',
      atMost: 12,
    });
  });
});

/**
 * The editor itself, because the rules above read source and source is not
 * behaviour (PLAN.md M222).
 *
 * M222's battery changed the benchmark's metric through a *patch* rather
 * than rebuilding the requirement, and every rule in this file still
 * passed — a `metric` requirement kept `kind: 'metric'` with `atLeast` when
 * the climber picked `Min Edge`, which asks for **at least** twelve
 * millimetres of edge. Backwards, and invisible to a source sweep.
 */
describe('changing the benchmark changes the direction', () => {
  it('flips to at-most when the metric is one that comes down', async () => {
    await reset();
    await useObjectives.getState().save({
      id: 'o1',
      name: 'A thing',
      kind: 'boulder',
      status: 'training',
      requirements: [
        { id: 'r1', requirement: benchmarkFor('max_hang_20mm_7s', 30) },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    const select = await screen.findByLabelText('Benchmark');
    fireEvent.change(select, { target: { value: 'min_edge' } });

    await waitFor(() => {
      const kept = useObjectives.getState().objectives[0]!.requirements[0]!.requirement;
      expect(kept).toEqual({ kind: 'metric-under', metricId: 'min_edge', atMost: 30 });
    });
  });

  it('flips back to at-least on one that goes up', async () => {
    await reset();
    await useObjectives.getState().save({
      id: 'o2',
      name: 'A thing',
      kind: 'boulder',
      status: 'training',
      requirements: [{ id: 'r1', requirement: benchmarkFor('min_edge', 12) }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderAt('/objectives/o2', <ObjectiveDetailPage params={{ id: 'o2' }} />);

    fireEvent.change(await screen.findByLabelText('Benchmark'), {
      target: { value: 'max_hang_20mm_7s' },
    });
    await waitFor(() => {
      const kept = useObjectives.getState().objectives[0]!.requirements[0]!.requirement;
      expect(kept).toEqual({ kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: 12 });
    });
  });

  it('keeps the direction when only the number changes', async () => {
    // The other half, and M222's battery found it open: editing the number
    // through a patch put an `atLeast` beside the `atMost` and left the kind
    // alone. Both fields on one requirement is a requirement that means two
    // things.
    await reset();
    await useObjectives.getState().save({
      id: 'o4',
      name: 'A thing',
      kind: 'boulder',
      status: 'training',
      requirements: [{ id: 'r1', requirement: benchmarkFor('min_edge', 14) }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderAt('/objectives/o4', <ObjectiveDetailPage params={{ id: 'o4' }} />);

    fireEvent.change(await screen.findByLabelText('At most'), { target: { value: '10' } });
    await waitFor(() => {
      const kept = useObjectives.getState().objectives[0]!.requirements[0]!.requirement;
      expect(kept).toEqual({ kind: 'metric-under', metricId: 'min_edge', atMost: 10 });
    });
  });

  it('gives the altimeter and the stat requirements an editor too', async () => {
    await reset();
    await useObjectives.getState().save({
      id: 'o3',
      name: 'A thing',
      kind: 'other',
      status: 'training',
      requirements: [
        { id: 'r1', requirement: { kind: 'height', feet: 29_032 } },
        { id: 'r2', requirement: { kind: 'stat', stat: 'STR', atLeast: 60 } },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderAt('/objectives/o3', <ObjectiveDetailPage params={{ id: 'o3' }} />);
    expect(await screen.findByLabelText('Feet')).toBeTruthy();
    expect(screen.getByLabelText('Stat')).toBeTruthy();
  });
});
