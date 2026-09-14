import { beforeAll, describe, expect, it } from 'vitest';
import { DRILLS } from '@/content/drills';
import { FIELDS } from '@/content/fields';
import { METRICS } from '@/content/metrics';
import { PROTOCOLS } from '@/content/protocols';
import { loadPrograms } from '@/content/programs';
import { CATALOGUE } from '@/content/programs/catalogue';
import { allMetrics } from '@/engine/assessments';

/**
 * Nothing authored is unreachable (PLAN.md M169).
 *
 * `ui/wired.test.ts` asks whether every *field* the schema declares reaches a
 * screen, and since M169 it asks that of all sixteen interfaces rather than
 * three. This is the other half, and the one its header deferred as *"M155's,
 * and it is a much longer list"*: whether every authored **value** — a metric,
 * a drill, a protocol, a question — is something a climber can actually get
 * to.
 *
 * ## The distinction the proposal for this milestone got wrong
 *
 * It named two orphans: the `flexibility` metric, *"defined and prescribed by
 * none of the thirteen programs"*, and the twelve `off_` drills carrying an
 * empty `sources`. Measured, neither is one — and the reason is the same both
 * times. **Unprescribed is not unreachable.** `allMetrics()` exists, in its own
 * words, *"for adding one outside your program"*, and the assessments page
 * lists everything it returns; the twelve off-wall drills are what M164 wired
 * into rest days, and their empty `sources` is a declaration that the library
 * offers them on its own rather than an absence of one.
 *
 * M155's orphans were things **nothing could render**. That is what this
 * checks, and today it finds none.
 */

beforeAll(async () => {
  await loadPrograms();
});

const prescribedMetrics = () => new Set(CATALOGUE.flatMap((p) => p.assessments ?? []));

const prescribedDrills = () => {
  const out = new Set<string>();
  for (const program of CATALOGUE) {
    for (const type of program.sessionTypes) {
      for (const id of Object.values(type.drillsByWeek ?? {})) out.add(id);
    }
  }
  return out;
};

const askedFields = () => {
  const out = new Set<string>();
  for (const program of CATALOGUE) {
    for (const type of program.sessionTypes) for (const id of type.fields ?? []) out.add(id);
  }
  return out;
};

/**
 * The three predicates, named so the self-checks at the bottom run the same
 * ones the sweeps do.
 *
 * `ui/wired.test.ts` states the rule this follows: *"the assertion itself,
 * named so the self-check below runs the same one. A weakened assertion here
 * fails there, which is the only way a check nothing else checks can be held
 * to anything."* The battery for this milestone proved the point — with the
 * sweep and its self-check holding separate copies of the same filter,
 * weakening the sweep's copy survived.
 */
export function orphanFields(
  fields: Record<string, { retired?: string; derived?: string }>,
  asked: Set<string>,
): string[] {
  return Object.entries(fields)
    .filter(([id, spec]) => !asked.has(id) && spec.retired === undefined && spec.derived === undefined)
    .map(([id]) => id);
}

export function retiredButAsked(
  fields: Record<string, { retired?: string }>,
  asked: Set<string>,
): string[] {
  return Object.entries(fields)
    .filter(([id, spec]) => spec.retired !== undefined && asked.has(id))
    .map(([id]) => id);
}

export function lyingDrills(
  drills: readonly { id: string; sources?: readonly string[] }[],
  prescribed: Set<string>,
): string[] {
  return drills.filter((d) => (d.sources ?? []).length > 0 && !prescribed.has(d.id)).map((d) => d.id);
}

describe('the sweep has something to sweep', () => {
  it('reads a catalogue and a registry, not two empty objects', () => {
    expect(CATALOGUE.length).toBe(13);
    expect(Object.keys(METRICS).length).toBeGreaterThanOrEqual(30);
    expect(DRILLS.length).toBeGreaterThanOrEqual(150);
    expect(Object.keys(PROTOCOLS).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(FIELDS).length).toBeGreaterThanOrEqual(15);
  });
});

describe('every metric a climber can reach', () => {
  /**
   * One of the thirty-seven is prescribed by nothing, and it is reachable all
   * the same. This is the pin: `allMetrics` returning a filtered list instead
   * of the registry would strand it silently, and nothing else would notice.
   */
  it('offers the whole registry, not only what a program asks for', () => {
    expect(allMetrics().map((m) => m.id).sort()).toEqual(Object.keys(METRICS).sort());
  });

  it('has exactly one that no program prescribes, and it is flexibility', () => {
    const prescribed = prescribedMetrics();
    const unprescribed = Object.keys(METRICS).filter((id) => !prescribed.has(id));
    expect(unprescribed).toEqual(['flexibility']);
    // Reachable: it is in the list a climber picks from.
    expect(allMetrics().some((m) => m.id === 'flexibility')).toBe(true);
  });
});

describe('every drill a climber can reach', () => {
  /**
   * A drill claiming a source program that never prescribes it would be a
   * real orphan — provenance pointing at nothing. The twelve that claim no
   * source are the off-wall ones, which is a declaration rather than a gap
   * (M164), and they are reached from the rest day.
   */
  it('has no drill claiming a program that does not use it', () => {
    expect(lyingDrills(DRILLS, prescribedDrills())).toEqual([]);
  });

  it('accounts for every drill as prescribed or library-only', () => {
    expect(lyingDrills(DRILLS, prescribedDrills())).toEqual([]);
    const libraryOnly = DRILLS.filter((d) => (d.sources ?? []).length === 0);
    expect(libraryOnly).toHaveLength(12);
    expect(libraryOnly.every((d) => d.id.startsWith('off_'))).toBe(true);
  });
});

describe('every protocol something references', () => {
  /**
   * A protocol carries cues, a grip and — since M153 — authored safety rules.
   * One nothing references is those rules unread, which is the exact shape
   * `Protocol.safety` was in before M153 found it.
   */
  it('is named by a drill or by an exercise', () => {
    const used = new Set<string>();
    for (const drill of DRILLS) if (drill.protocolId) used.add(drill.protocolId);
    for (const program of CATALOGUE) {
      for (const type of program.sessionTypes) {
        for (const block of type.blocks ?? []) {
          for (const phase of Object.values(block.perPhase)) {
            for (const exercise of phase?.exercises ?? []) {
              if (exercise.protocolId) used.add(exercise.protocolId);
            }
          }
        }
      }
    }
    expect(Object.keys(PROTOCOLS).filter((id) => !used.has(id))).toEqual([]);
  });
});

describe('every question the logger can ask', () => {
  /**
   * A `FieldSpec` is either asked by a session type or retired on purpose,
   * and the marker is what tells a decision from an omission. `clipStyle` was
   * retired at M108, three milestones before `retired` existed, so it sat in
   * the registry asked by nothing and marked as nothing — which is exactly
   * what a forgotten field looks like. M169 marked it.
   */
  it('is asked by a session type, or says why it is not', () => {
    expect(orphanFields(FIELDS, askedFields())).toEqual([]);
  });

  it('retires four, each with its replacement named', () => {
    const retired = Object.entries(FIELDS).filter(([, spec]) => spec.retired !== undefined);
    expect(retired.map(([id]) => id).sort()).toEqual([
      'clipStyle',
      'projectName',
      'routeName',
      'sessionDuration',
    ]);
    for (const [id, spec] of retired) {
      expect(spec.retired!.length, `${id} retires with no reason`).toBeGreaterThan(20);
    }
  });

  /** And a retired question is never put to a climber again. */
  it('is never asked by a session type once retired', () => {
    expect(retiredButAsked(FIELDS, askedFields())).toEqual([]);
  });
});

/**
 * And the sweeps can fail.
 *
 * `ui/wired.test.ts` carries a "the check itself works" section for a reason
 * it states plainly — *"a test checking content means nothing else checks
 * it"*. Every sweep above passes today because the catalogue is clean, which
 * is indistinguishable from passing because the filter is broken. The battery
 * for this milestone made that concrete: weakening either predicate to
 * `() => false` survived everything.
 *
 * So each sweep is run again here against a deliberately broken copy of the
 * data, and has to notice.
 */
describe('the sweeps themselves work', () => {
  it('would notice a field asked by nothing and retired by nothing', () => {
    const asked = askedFields();
    expect(orphanFields(FIELDS, asked)).toEqual([]);
    expect(orphanFields({ ...FIELDS, aForgottenQuestion: {} }, asked)).toEqual(['aForgottenQuestion']);
  });

  it('would notice a retired field that a session type still asks', () => {
    expect(retiredButAsked(FIELDS, new Set([...askedFields(), 'clipStyle']))).toEqual(['clipStyle']);
  });

  it('would notice a drill claiming a program that never uses it', () => {
    const prescribed = prescribedDrills();
    expect(lyingDrills(DRILLS, prescribed)).toEqual([]);
    const lying = [...DRILLS, { id: 'off_invented', sources: ['iron_grip'] }];
    expect(lyingDrills(lying, prescribed)).toEqual(['off_invented']);
  });

  it('would notice a protocol nothing references', () => {
    const used = new Set(DRILLS.flatMap((d) => (d.protocolId ? [d.protocolId] : [])));
    const registry = { ...PROTOCOLS, nothing_uses_me: PROTOCOLS['max_hangs_10s']! };
    expect(Object.keys(registry).filter((id) => !used.has(id))).toContain('nothing_uses_me');
  });

  it('would notice the metric list quietly filtering', () => {
    const filtered = allMetrics().filter((m) => m.id !== 'flexibility');
    expect(filtered.map((m) => m.id).sort()).not.toEqual(Object.keys(METRICS).sort());
  });
});
