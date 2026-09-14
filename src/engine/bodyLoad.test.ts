import { describe, expect, it } from 'vitest';
import { DRILLS } from '@/content/drills';
import { PROTOCOLS } from '@/content/protocols';
import { PROGRAMS } from '@/content/programs';
import type { Drill, Exercise, SessionType } from '@/content/types';
import {
  LOAD_RULES,
  describeParts,
  drillConflict,
  exerciseConflict,
  dayLoad,
  describeDayLoad,
  partsInText,
  partsNamedIn,
  protocolSafety,
  drillFindings,
  drillLoads,
  scanText,
  sessionConflicts,
} from './bodyLoad';

const ex = (name: string, patch: Partial<Exercise> = {}): Exercise => ({ name, ...patch });

describe('reading what an exercise loads', () => {
  it('finds fingers in the obvious places', () => {
    expect(partsInText('Max Hangs')).toContain('fingers');
    expect(partsInText('7/3 Repeaters')).toContain('pulley');
    expect(partsInText('Min Edge')).toContain('fingers');
    expect(partsInText('Crimp ladders')).toContain('fingers');
  });

  it('treats campus as loading the whole chain', () => {
    expect(partsInText('Campus laddering').sort()).toEqual(['elbow', 'fingers', 'pulley', 'shoulder']);
  });

  it('finds pulling in the elbow and shoulder', () => {
    expect(partsInText('Weighted Pull-Ups')).toContain('elbow');
    expect(partsInText('Lock-off holds')).toContain('shoulder');
    expect(partsInText('Front Lever Progression')).toContain('back');
  });

  it('finds the lower body', () => {
    expect(partsInText('Heel hook drills')).toContain('knee');
    expect(partsInText('Box jump landings')).toContain('ankle');
    expect(partsInText('Pigeon stretch')).toContain('hip');
  });

  it('says nothing about something that loads nothing in particular', () => {
    expect(partsInText('Read the route from the ground')).toEqual([]);
    expect(partsInText('')).toEqual([]);
  });

  // The reason a climber sees should be the most serious one that applies.
  it('reports the hardest matching rule first', () => {
    const findings = scanText('One-arm max hangs on a campus rung');
    expect(findings[0]!.because).toMatch(/campus/);
  });

  it('reads an exercise’s notes and load, not only its name', () => {
    const finding = exerciseConflict(ex('Session work', { notes: 'on the campus board' }), ['elbow']);
    expect(finding?.parts).toEqual(['elbow']);
  });
});

describe('conflicts against an injury', () => {
  it('finds nothing when nothing is hurt', () => {
    expect(exerciseConflict(ex('Max Hangs'), [])).toBeNull();
  });

  it('finds nothing when the injury is elsewhere', () => {
    expect(exerciseConflict(ex('Max Hangs'), ['ankle'])).toBeNull();
  });

  it('reports only the parts that actually clash', () => {
    const finding = exerciseConflict(ex('Campus laddering'), ['elbow', 'ankle']);
    expect(finding?.parts).toEqual(['elbow']);
    expect(finding?.because).toMatch(/campus/);
  });

  // A drill's equipment loads the tissue whatever its prose says.
  it('flags a hangboard drill by its equipment alone', () => {
    const drill: Drill = {
      id: 'x', name: 'Quiet session', loads: [], duration: '30 min',
      focus: 'General', category: 'technique', discipline: 'both', level: 'V0-V17',
      equipment: ['hangboard'], sources: [],
    };
    expect(drillConflict(drill, ['pulley'])?.because).toMatch(/hangboard/);
    expect(drillConflict(drill, ['knee'])).toBeNull();
  });

  it('reads a drill’s name on its own, with nothing in its loads', () => {
    // The name and focus are scanned live; only the text travels as data.
    const drill: Drill = {
      id: 'c', name: 'Campus laddering', loads: [], duration: '20 min',
      focus: 'Power', category: 'power', discipline: 'both', level: 'V5+',
      equipment: ['wall'], sources: [],
    };
    expect(drillConflict(drill, ['elbow'])?.because).toMatch(/campus/);
  });

  it('lists what a drill loads once each, however many rules say so', () => {
    const drill: Drill = {
      id: 'd', name: 'Session', loads: ['fingers', 'sustained'], duration: '20 min',
      focus: 'Endurance', category: 'endurance', discipline: 'both', level: 'V0-V17',
      equipment: ['hangboard'], sources: [],
    };
    // Three findings name the fingers and the pulleys; the list says each once.
    expect(drillLoads(drill)).toEqual(['fingers', 'pulley']);
  });

  it('reads what a drill’s text loads, as well as its name', () => {
    // The text itself is out of the entry chunk (PLAN.md M137); what it
    // said about load travels as `loads`, derived from it and pinned by
    // `drillText.test.ts`.
    const drill: Drill = {
      id: 'y', name: 'Session', loads: ['hook'], duration: '30 min',
      focus: 'Footwork', category: 'technique', discipline: 'both', level: 'V0-V17',
      equipment: ['wall'], sources: [],
    };
    expect(drillConflict(drill, ['knee'])?.parts).toEqual(['knee']);
  });
});

describe('across a whole session type', () => {
  const type: SessionType = {
    id: 'fp', name: 'Finger power', icon: '', description: '',
    blocks: [
      { id: 'hb', name: 'Hangboard', perPhase: { p1: { rationale: '', exercises: [ex('Max Hangs'), ex('Min Edge')] } } },
      { id: 'pull', name: 'Pull', perPhase: { p1: { rationale: '', exercises: [ex('Weighted Pull-Ups')] } } },
      { id: 'core', name: 'Core', perPhase: { p1: { rationale: '', exercises: [ex('Plank')] } } },
    ],
  };

  // "Four exercises here load your elbow" is a decision. "This one does"
  // is a shrug.
  it('counts every line that clashes, with its block', () => {
    const found = sessionConflicts(type, 'p1', ['fingers']);
    expect(found.map((c) => c.exercise)).toEqual(['Max Hangs', 'Min Edge']);
    expect(found[0]!.block).toBe('Hangboard');
  });

  it('looks only at the phase it was asked about', () => {
    expect(sessionConflicts(type, 'p2', ['fingers'])).toEqual([]);
  });

  it('finds nothing when nothing is hurt', () => {
    expect(sessionConflicts(type, 'p1', [])).toEqual([]);
  });
});

describe('the scan against the real catalog', () => {
  // Not an assertion about correctness — it cannot be, it is a keyword scan.
  // It guards the thing that actually matters: the categories that load
  // tissue are seen, and the ones that do not are left alone. A technique
  // drill about footwork precision should be quiet; an ARC lap should not.
  const seen = (d: (typeof DRILLS)[number]) =>
    drillFindings(d).length > 0;
  const share = (categories: string[]) => {
    const inScope = DRILLS.filter((d) => categories.includes(d.category));
    return inScope.filter(seen).length / inScope.length;
  };

  it('sees the drills that load tissue', () => {
    expect(share(['finger-strength'])).toBeGreaterThan(0.9);
    expect(share(['power', 'power-endurance', 'endurance'])).toBeGreaterThan(0.75);
  });

  it('stays quiet on the ones that do not', () => {
    expect(share(['mental', 'strategy'])).toBeLessThan(0.5);
  });

  it('flags finger work in the finger-strength program', () => {
    const ironGrip = PROGRAMS.find((p) => p.id === 'iron_grip')!;
    const phase = ironGrip.phases[0]!.id;
    const conflicts = ironGrip.sessionTypes.flatMap((t) => sessionConflicts(t, phase, ['pulley']));
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('leaves an ankle alone in a finger program', () => {
    const ironGrip = PROGRAMS.find((p) => p.id === 'iron_grip')!;
    const phase = ironGrip.phases[0]!.id;
    const conflicts = ironGrip.sessionTypes.flatMap((t) => sessionConflicts(t, phase, ['ankle']));
    expect(conflicts.length).toBeLessThan(3);
  });

  it('has no rule that matches everything', () => {
    for (const rule of LOAD_RULES) {
      expect(rule.pattern.test('read the route from the ground')).toBe(false);
    }
  });

  it('gives every rule a reason worth showing', () => {
    for (const rule of LOAD_RULES) {
      expect(rule.because.length).toBeGreaterThan(10);
      expect(rule.parts.length).toBeGreaterThan(0);
    }
  });
});

describe('wording', () => {
  it('lists parts the way a sentence would', () => {
    expect(describeParts(['elbow'])).toBe('your elbow');
    expect(describeParts(['elbow', 'shoulder'])).toBe('your elbow and shoulder');
    expect(describeParts(['fingers', 'elbow', 'shoulder'])).toBe('your fingers, elbow and shoulder');
    expect(describeParts([])).toBe('');
  });
});

/**
 * The count, where the decision is made (PLAN.md M89).
 *
 * `sessionConflicts` reads a session type's blocks and nothing else, so it
 * cannot see the drill — which is a real piece of a day and, in several
 * programs, the piece that torques a knee.
 */
describe('what a whole planned day loads', () => {
  const type: SessionType = {
    id: 'fp', name: 'Finger power', icon: '', description: '',
    blocks: [
      { id: 'hb', name: 'Hangboard', perPhase: { p1: { rationale: '', exercises: [ex('Max Hangs'), ex('Min Edge')] } } },
      { id: 'core', name: 'Core', perPhase: { p1: { rationale: '', exercises: [ex('Plank')] } } },
    ],
  };
  const heels: Drill = {
    id: 'h', name: 'Heel practice', loads: ['hook'], duration: '20 min',
    focus: 'Footwork', category: 'technique', discipline: 'both', level: 'V0-V17',
    equipment: ['wall'], sources: [],
  };

  it('counts the exercises the session prescribes', () => {
    expect(dayLoad({ sessionType: type, phase: { id: 'p1' } }, ['fingers']).conflicts).toHaveLength(2);
  });

  it('counts the drill, which the session type does not carry', () => {
    const withDrill = dayLoad({ sessionType: type, phase: { id: 'p1' }, drill: heels }, ['fingers', 'knee']);
    expect(withDrill.conflicts).toHaveLength(3);
    expect(withDrill.conflicts.filter((c) => c.kind === 'drill').map((c) => c.exercise)).toEqual([
      'Heel practice',
    ]);
  });

  it('counts a drill on a day that prescribes no session', () => {
    expect(dayLoad({ drill: heels }, ['knee']).conflicts).toHaveLength(1);
  });

  // A rest day resolves to nothing on its own: no session type, no drill.
  it('finds nothing in a day with nothing in it', () => {
    expect(dayLoad({}, ['fingers']).conflicts).toEqual([]);
    expect(dayLoad({}, ['fingers']).parts).toEqual([]);
  });

  it('finds nothing when nothing is hurt', () => {
    expect(dayLoad({ sessionType: type, phase: { id: 'p1' }, drill: heels }, []).conflicts).toEqual([]);
  });

  // Without a phase there is no prescription to read, and guessing one
  // would report a day's load from a block it is not in.
  it('reads no exercises for a day outside the program’s weeks', () => {
    expect(dayLoad({ sessionType: type }, ['fingers']).conflicts).toEqual([]);
  });

  it('names each hurt part once, however many lines load it', () => {
    expect(dayLoad({ sessionType: type, phase: { id: 'p1' } }, ['fingers', 'pulley']).parts).toEqual([
      'fingers',
      'pulley',
    ]);
  });

  describe('said out loud', () => {
    const say = (day: Parameters<typeof dayLoad>[0], injured: Parameters<typeof dayLoad>[1]) =>
      describeDayLoad(dayLoad(day, injured));

    it('says nothing when nothing clashes', () => {
      expect(say({}, ['fingers'])).toBeNull();
    });

    it('counts, because the count is what makes it a decision', () => {
      expect(say({ sessionType: type, phase: { id: 'p1' } }, ['fingers'])).toBe(
        '2 exercises load your fingers',
      );
    });

    it('agrees with itself when only one line clashes', () => {
      expect(say({ sessionType: type, phase: { id: 'p1' } }, ['back'])).toBe('1 exercise loads your back');
    });

    it('calls the drill the drill rather than an exercise', () => {
      expect(say({ drill: heels }, ['knee'])).toBe('the drill loads your knee');
    });

    it('adds the drill to the count without losing the verb', () => {
      expect(say({ sessionType: type, phase: { id: 'p1' }, drill: heels }, ['back', 'knee'])).toBe(
        '1 exercise and the drill load your back and knee',
      );
    });
  });
});

/**
 * The rules the author wrote down (PLAN.md M153).
 *
 * `LOAD_RULES` answers *what does this activity load*; this answers *what
 * part does this sentence talk about*. Keeping them apart is the whole
 * design, and the tests either side of that line are what hold it.
 */
describe('the parts a sentence names outright', () => {
  it('reads the part the author wrote', () => {
    expect(partsNamedIn('Never campus with any existing finger or elbow symptom.')).toEqual([
      'fingers',
      'pulley',
      'elbow',
    ]);
  });

  it('does not answer the activity question by mistake', () => {
    // The same sentence through the load scan reports four parts, three of
    // which the author never mentioned — because it matched "campus".
    expect(partsInText('Never campus with any existing finger or elbow symptom.')).toEqual([
      'fingers',
      'pulley',
      'elbow',
      'shoulder',
    ]);
  });

  it('counts a pulley as a finger and a finger as a pulley', () => {
    expect(partsNamedIn('a pulley strain')).toEqual(['fingers', 'pulley']);
    expect(partsNamedIn('sharp finger pain')).toEqual(['fingers', 'pulley']);
  });

  it('names nothing in a rule that is about conduct', () => {
    expect(partsNamedIn('Miss a rung twice in a row and the session is over.')).toEqual([]);
    expect(partsNamedIn('If you pump out, you went too hard.')).toEqual([]);
  });

  it('does not match a word inside a longer one', () => {
    expect(partsNamedIn('backcountry approach')).toEqual([]);
  });
});

describe("a protocol's safety rules, split by whether they are about you", () => {
  const campus = PROTOCOLS['campus_ladder']!;
  const oneArm = PROTOCOLS['one_arm_negatives']!;

  it('leads with the rule that names the injury the app was told about', () => {
    const { urgent, standing } = protocolSafety(campus, ['elbow']);
    expect(urgent).toEqual(['Never campus with any existing finger or elbow symptom.']);
    expect(standing).toHaveLength(2);
  });

  it('holds every rule when nothing is hurt', () => {
    const { urgent, standing } = protocolSafety(campus, []);
    expect(urgent).toEqual([]);
    expect(standing).toEqual(campus.safety);
  });

  it('loses nothing: every rule comes back in one half or the other', () => {
    for (const protocol of Object.values(PROTOCOLS)) {
      for (const injured of [[], ['elbow'], ['fingers'], ['knee']] as const) {
        const { urgent, standing } = protocolSafety(protocol, injured);
        expect([...urgent, ...standing].sort()).toEqual([...(protocol.safety ?? [])].sort());
      }
    }
  });

  it('says nothing about a protocol with no rules, or no protocol at all', () => {
    expect(protocolSafety(PROTOCOLS['front_lever'], ['elbow'])).toEqual({ urgent: [], standing: [] });
    expect(protocolSafety(undefined, ['elbow'])).toEqual({ urgent: [], standing: [] });
  });

  it('does not raise a rule about a part that is not hurt', () => {
    expect(protocolSafety(oneArm, ['knee']).urgent).toEqual([]);
    expect(protocolSafety(oneArm, ['elbow']).urgent).toHaveLength(1);
  });

  /**
   * The catalogue's own count, pinned. If a protocol gains a rule this
   * number moves and the milestone's claim moves with it.
   */
  it('covers seven authored rules across five protocols', () => {
    const withRules = Object.values(PROTOCOLS).filter((p) => (p.safety ?? []).length > 0);
    expect(withRules).toHaveLength(5);
    expect(withRules.flatMap((p) => p.safety!)).toHaveLength(7);
  });

  /**
   * The half that no injury path could ever have reached, which is why
   * rendering the rules rather than ranking them is the design.
   */
  it('has three rules that name no body part at all', () => {
    const all = Object.values(PROTOCOLS).flatMap((p) => p.safety ?? []);
    expect(all.filter((rule) => partsNamedIn(rule).length === 0)).toEqual([
      'The highest injury-risk protocol in any program here.',
      'Miss a rung twice in a row and the session is over.',
      'If you pump out, you went too hard — drop a grade rather than pushing through.',
    ]);
  });
});
