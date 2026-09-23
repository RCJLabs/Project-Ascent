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
  exerciseLoads,
  dayLoad,
  describeDayLoad,
  partsInText,
  partsNamedIn,
  protocolSafety,
  unspokenFor,
  drillFindings,
  drillLoads,
  rulesInText,
  scanText,
  sessionConflicts,
} from './bodyLoad';
import { sessionLoads } from './sessionLoads';
import { onTheWall } from './climbing';
import { readinessFor } from './readiness';

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

  it('reads an exercise’s load, not only its name', () => {
    const finding = exerciseConflict(ex('Session work', { load: 'on the campus board' }), ['elbow']);
    expect(finding?.parts).toEqual(['elbow']);
  });

  /**
   * And never its notes (PLAN.md M326). `notes` is a form cue or a caveat by
   * its own type, and a caveat names what not to do — these three are the
   * catalogue's own, and each used to load a part the line does not.
   */
  it.each([
    ['Push-Ups', 'Maintenance only. Skip entirely if sore from campus.', 'fingers'],
    ['Wrist Extensor Curls', 'Bump to 3x20 if elbows feel tight.', 'shoulder'],
    ['Inverted Rows or Pull-Ups', 'Drop to 3x5 if shoulders feel beat up.', 'knee'],
  ])('does not read %s’s notes as what it does', (name, notes, part) => {
    expect(exerciseLoads(ex(name, { notes }))).not.toContain(part);
  });
});

/**
 * Words inside other words, and words about something else (PLAN.md M326).
 *
 * Every case is one the sweep over the catalogue found — an exercise name, a
 * test's definition or a drill's paragraph — so each is a sentence a climber
 * has actually been shown a flag beside.
 */
describe('what the scan does not read as training', () => {
  it.each([
    ['Compression Planks', 'shoulder', '`press` inside Compression'],
    ['Lower back pressed into the floor', 'shoulder', '`press` inside pressed'],
    ['Self-scored mobility check', 'back', '`core` inside scored'],
    ["Refine, Don't Rehearse", 'shoulder', 'the `t` of Don\'t as a T-raise'],
    ['top arm tracing a slow arc from one side to the other', 'pulley', 'arc, lower case, as ARC'],
    ['End a problem after two ugly burns in a row', 'back', '"in a row" as a row'],
    ['Compression Planks (long-lever)', 'elbow', 'a long-lever plank as a lever'],
    ['Box Jumps', 'shoulder', 'a box jump as a catch'],
    ['Drop to 3x8 if shoulders feel grumpy', 'ankle', '"drop" as a drop landing'],
    ['Lead Fall Practice — The Fall Ladder', 'fingers', 'a fall ladder as campus laddering'],
    ['Dyno to an intermediate hold, then BUMP to the finish', 'pulley', 'a bump as campus work'],
    // Not from the catalogue: the kind of line a climber writes in a session
    // note, which `tissueLoad` reads with this same table.
    ['Chipped a hold on the warm-up, the setters were on it by lunch', 'hip', '`hip` inside chipped'],
  ])('%s — does not load the %s', (text, part) => {
    expect(partsInText(text)).not.toContain(part);
  });

  it.each([
    ['Very easy climbing only. No hangboard this week.'],
    ['Intentional easy week — no crimp focus, no limit attempts.'],
    ['Hardest boulder sent with no dynamic moves.'],
    ["I fell on the second-to-last move because I did not flag"],
  ])('reads a thing the sentence rules out as not done: %s', (text) => {
    expect(partsInText(text)).toEqual([]);
  });

  it('still reads the word when nothing rules it out', () => {
    expect(partsInText('Hangboard this week')).toContain('fingers');
    expect(partsInText('Not a max hang: a repeater')).toContain('fingers');
  });
});

describe('what the scan reads now that it did not', () => {
  it.each([
    ['Inverted Rows', 'elbow'],
    ['Archer Rows', 'shoulder'],
    ['Toes-to-Bar', 'back'],
    ['Step-Ups', 'knee'],
    ['Box Jumps', 'ankle'],
    ['Drop-Knee Isolation', 'knee'],
    ['Recruitment Hangs', 'fingers'],
    ['Recruitment Pulls', 'elbow'],
    ['I-Y-T Raises', 'shoulder'],
    ['ARC Pacing — 2x10 min', 'pulley'],
  ])('%s loads the %s', (text, part) => {
    expect(partsInText(text)).toContain(part);
  });

  it('gives the no-board track its own reason, not the campus board’s', () => {
    // Iron Grip offers *Foot-On Laddering* because campus is its highest
    // injury risk. The parts are the same four; the reason is not.
    const [first] = scanText('Foot-On Laddering');
    expect(first!.because).not.toMatch(/campus/);
    expect(first!.parts).toEqual(['fingers', 'pulley', 'elbow', 'shoulder']);
    expect(scanText('Campus Laddering')[0]!.because).toMatch(/campus/);
  });
});

describe('the campus rule, over everything authored', () => {
  it('fires only where the words say campus', () => {
    // The rule whose reason is "the highest-force protocol there is". Five of
    // its nine catalogue hits were false before M326; this holds it to the
    // word, across every name, every load, every test and every drill.
    const texts: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        texts.push(type.name);
        for (const block of type.blocks ?? []) {
          for (const entry of Object.values(block.perPhase)) {
            for (const e of entry.exercises) texts.push([e.name, e.load].filter(Boolean).join(' '));
          }
        }
      }
    }
    for (const drill of DRILLS) texts.push(`${drill.name} ${drill.focus}`);
    const campus = texts.filter((t) => rulesInText(t).includes('campus'));
    expect(campus.length).toBeGreaterThan(0);
    expect(campus.filter((t) => !/campus|double dyno/i.test(t))).toEqual([]);
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

  /**
   * The climbing itself (PLAN.md M327). The fixture above is a strength day
   * with no fields; a climbing day is one that records climbing.
   */
  describe('on a climbing day', () => {
    const climbing: SessionType = { id: 'perf', name: 'Limit bouldering', icon: '', description: '', fields: ['hardestGradeSent'] };
    const outside: SessionType = { id: 'crag', name: 'Crag day', icon: '', description: '', outdoor: true };

    it('counts the climbing for any of the four parts it loads', () => {
      for (const part of ['fingers', 'pulley', 'elbow', 'shoulder'] as const) {
        const load = dayLoad({ sessionType: climbing, phase: { id: 'p1' } }, [part]);
        expect(load.conflicts.map((c) => c.kind), part).toEqual(['climbing']);
        expect(load.parts).toEqual([part]);
      }
    });

    it('and only those four', () => {
      expect(dayLoad({ sessionType: climbing, phase: { id: 'p1' } }, ['knee', 'ankle', 'back', 'hip', 'wrist']).conflicts).toEqual([]);
    });

    it('counts a day on rock as climbing, whatever its fields', () => {
      expect(dayLoad({ sessionType: outside }, ['elbow']).conflicts.map((c) => c.kind)).toEqual(['climbing']);
    });

    it('counts it without a phase, which the climbing does not need', () => {
      expect(dayLoad({ sessionType: climbing }, ['fingers']).conflicts).toHaveLength(1);
    });

    it('does not count it on a day that is not climbing', () => {
      expect(dayLoad({ sessionType: type, phase: { id: 'p1' } }, ['shoulder']).conflicts.map((c) => c.kind)).not.toContain('climbing');
    });

    it('says the climbing first, then the rest', () => {
      const say = (day: Parameters<typeof dayLoad>[0], injured: Parameters<typeof dayLoad>[1]) =>
        describeDayLoad(dayLoad(day, injured));
      expect(say({ sessionType: climbing }, ['elbow'])).toBe('Climbing loads your elbow');
      expect(say({ sessionType: climbing, drill: heels }, ['fingers', 'knee'])).toBe(
        'Climbing and the drill load your fingers and knee',
      );
      const both: SessionType = { ...type, fields: ['sessionVolume'] };
      expect(say({ sessionType: both, phase: { id: 'p1' }, drill: heels }, ['fingers', 'knee'])).toBe(
        'Climbing, 2 exercises and the drill load your fingers and knee',
      );
    });
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
    // The same sentence through the load scan reported four parts, three of
    // which the author never mentioned — because it matched "campus". Since
    // M326 the load scan reads *"Never campus"* as a thing not done and
    // names nothing, which is still not the answer this table gives.
    expect(partsInText('Never campus with any existing finger or elbow symptom.')).toEqual([]);
    expect(partsInText('Campus with any existing finger or elbow symptom.')).toEqual([
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

  describe('what the author has not spoken about', () => {
    const maxHangs = PROTOCOLS['max_hangs_10s']!;

    it('is nothing when the rule names the injury', () => {
      expect(unspokenFor(campus, ['elbow'])).toEqual([]);
      expect(unspokenFor(campus, ['fingers'])).toEqual([]);
    });

    it('is the injury the rule never mentioned', () => {
      // The defect this exists for: one matching rule used to silence the
      // scan about every other part as well.
      expect(unspokenFor(campus, ['elbow', 'shoulder'])).toEqual(['shoulder']);
      expect(unspokenFor(maxHangs, ['fingers', 'shoulder'])).toEqual(['shoulder']);
      expect(unspokenFor(campus, ['fingers', 'knee', 'elbow'])).toEqual(['knee']);
    });

    it('is everything when there is no rule to speak', () => {
      expect(unspokenFor(undefined, ['elbow', 'knee'])).toEqual(['elbow', 'knee']);
      expect(unspokenFor(PROTOCOLS['front_lever'], ['elbow'])).toEqual(['elbow']);
      expect(unspokenFor(campus, ['knee'])).toEqual(['knee']);
    });

    it('is nothing when nothing is hurt', () => {
      expect(unspokenFor(campus, [])).toEqual([]);
    });

    it('keeps the order it was given and adds nothing', () => {
      const injured = ['shoulder', 'elbow', 'knee'] as const;
      expect(unspokenFor(campus, injured)).toEqual(['shoulder', 'knee']);
      for (const protocol of Object.values(PROTOCOLS)) {
        const left = unspokenFor(protocol, injured);
        expect(left.every((p) => injured.includes(p as never))).toBe(true);
        expect(new Set(left).size).toBe(left.length);
      }
    });

    /**
     * The two halves have to partition the injuries: a part is either
     * spoken for by an authored rule or left to the scan, never both and
     * never neither. Read off the catalogue rather than a fixture, so a
     * protocol that gains a rule is checked by this too.
     */
    it('leaves exactly the parts no urgent rule names, across the catalogue', () => {
      const parts = ['fingers', 'pulley', 'elbow', 'shoulder', 'knee', 'back'] as const;
      let spokenSomewhere = 0;
      for (const protocol of Object.values(PROTOCOLS)) {
        const left = unspokenFor(protocol, parts);
        const named = new Set(
          protocolSafety(protocol, parts).urgent.flatMap((rule) => partsNamedIn(rule)),
        );
        expect(left).toEqual(parts.filter((p) => !named.has(p)));
        spokenSomewhere += parts.length - left.length;
      }
      // A probe that can never find one is not a probe: some protocol in
      // the catalogue does speak to one of these parts.
      expect(spokenSomewhere).toBeGreaterThan(0);
    });
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

/**
 * What the check-in is told a session loads (PLAN.md M327).
 *
 * It leaves out advice about a part the session does not load, which is
 * right on a legs day and was wrong on every climbing day: the session was
 * described by its prescribed exercises alone, and a climbing session
 * prescribes none.
 */
describe('what the check-in is told a session loads', () => {
  const climbingDay: SessionType = { id: 'perf', name: 'Limit bouldering', icon: '', description: '', fields: ['hardestGradeSent'] };
  const legsDay: SessionType = { id: 'legs', name: 'Legs', icon: '', description: '' };
  const squat: Exercise = { name: 'Goblet Squats' };

  it('counts the climbing on a climbing day', () => {
    expect(sessionLoads({ type: climbingDay, exercises: [], climbed: false }).sort()).toEqual(
      ['elbow', 'fingers', 'pulley', 'shoulder'],
    );
  });

  it('counts climbs logged on a day that is not a climbing day', () => {
    expect(sessionLoads({ type: legsDay, exercises: [squat], climbed: true })).toContain('fingers');
  });

  it('leaves a legs day with no climbs on it as a legs day', () => {
    expect(sessionLoads({ type: legsDay, exercises: [squat], climbed: false }).sort()).toEqual(['ankle', 'knee']);
  });

  it('counts the drill, which it was never told about', () => {
    const heels: Drill = {
      id: 'h', name: 'Heel practice', loads: ['hook'], duration: '20 min',
      focus: 'Footwork', category: 'technique', discipline: 'both', level: 'V0-V17',
      equipment: ['wall'], sources: [],
    };
    expect(sessionLoads({ type: legsDay, exercises: [], drill: heels, climbed: false }).sort()).toEqual(['hip', 'knee']);
  });

  it('now lets sore fingers be answered on the way into a climbing day', () => {
    const loads = sessionLoads({ type: climbingDay, exercises: [], climbed: false });
    const said = readinessFor({ fingers: 'sore', sleep: 'good' }, { loads });
    expect(said.advice.join(' ')).toMatch(/will not tell you to push through/);
  });
});

describe('every climbing day in the catalogue', () => {
  it('tells a climber with a hurt finger, elbow or shoulder, every week', () => {
    // The sweep that found it: 224 of 308 climbing session-weeks said nothing
    // to a finger injury, 255 to an elbow and 261 to a shoulder. Every one of
    // them names the part now.
    let checked = 0;
    const silent: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        if (type.isRest === true || !onTheWall(type)) continue;
        for (const phase of program.phases) {
          checked += 1;
          for (const part of ['fingers', 'elbow', 'shoulder'] as const) {
            if (dayLoad({ sessionType: type, phase }, [part]).parts.length === 0) {
              silent.push(`${program.id}/${type.id} ${phase.id} ${part}`);
            }
          }
        }
      }
    }
    expect(checked, 'the sweep read almost nothing').toBeGreaterThan(40);
    expect(silent).toEqual([]);
  });
});
