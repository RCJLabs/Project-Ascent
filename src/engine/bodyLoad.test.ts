import { describe, expect, it } from 'vitest';
import { DRILLS } from '@/content/drills';
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
      id: 'x', name: 'Quiet session', description: 'Nothing in particular.', duration: '30 min',
      focus: 'General', category: 'technique', discipline: 'both', level: 'V0-V17',
      equipment: ['hangboard'], sources: [],
    };
    expect(drillConflict(drill, ['pulley'])?.because).toMatch(/hangboard/);
    expect(drillConflict(drill, ['knee'])).toBeNull();
  });

  it('reads a drill’s description as well as its name', () => {
    const drill: Drill = {
      id: 'y', name: 'Session', description: 'Work heel hooks on steep ground.', duration: '30 min',
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
    scanText(`${d.name} ${d.focus} ${d.description}`).length > 0;
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
    id: 'h', name: 'Heel practice', description: 'Work heel hooks on steep ground.', duration: '20 min',
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
