import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/content/programs/catalogue';
import type { Program, SessionType } from '@/content/types';
import { ISSUE_RANK, blankProgram, canRun, validateProgram } from './customProgram';
import { partsInText } from './bodyLoad';
import { FINGER_GAP_HOURS } from './fingerGap';
import { DELOAD_FROM_WEEKS, NO_REST_DAY_AT, fingerTypes, safetyIssues } from './programSafety';

/**
 * The builder checked that a program was complete and never that it was safe
 * (PLAN.md M167).
 */

const REST: SessionType = { id: 'rest', name: 'Rest', icon: '😴', isRest: true } as SessionType;

/**
 * A finger type as the catalogue actually expresses one: the *exercises*
 * carry the words, not the name. "Finger Protocol" on its own matches no
 * load rule — the `fingers` pattern is about movements (max hang, repeater,
 * crimp, edge) rather than the word "finger" — which is right, or a drill
 * saying *"keep your fingers relaxed"* would read as finger loading. A
 * half-built type with a name and no exercises is missed, and already trips
 * `contentIssues` for having nothing prescribed.
 */
const HANG: SessionType = {
  id: 'fp',
  name: 'Finger Protocol',
  icon: '✋',
  blocks: [
    {
      id: 'hangs',
      name: 'Hangs',
      perPhase: { phase1: { exercises: [{ name: 'Max Hangs' }] } },
    },
  ],
} as unknown as SessionType;

/** A program that trips nothing, to vary one thing at a time from. */
function sound(over: Partial<Program> = {}): Program {
  return {
    ...blankProgram(),
    weeks: 12,
    deloadWeeks: [4, 8],
    sessionTypes: [REST, HANG],
    constraints: [
      { kind: 'sessions-per-week', min: 3, max: 4, note: '' },
      { kind: 'min-gap-hours', between: ['fp'], hours: FINGER_GAP_HOURS, note: '' },
    ],
    ...over,
  } as Program;
}

const messages = (p: Program) => safetyIssues(p).map((i) => i.message).join(' | ');

describe('the rules are the catalogue’s own practice', () => {
  /**
   * The whole case for each check: every shipped block already does it. A
   * rule that fired on the app's own programs would be an opinion with a
   * warning icon.
   */
  it('says nothing about eleven of the thirteen shipped programs', () => {
    const noisy = CATALOGUE.filter((p) => safetyIssues(p).length > 0).map((p) => p.id);
    expect(noisy).toEqual(['general_training']);
  });

  /**
   * And the one it does flag is M160's finding, found again from the other
   * end: General Training ships a *Hangboard / Finger* session type, states
   * *"48 hours between hangboard sessions"* in its own prose, and declares
   * no constraint at all. The builder rule reaches it without being told.
   */
  it('flags General Training for the gap M160 had to work around', () => {
    const gt = CATALOGUE.find((p) => p.id === 'general_training')!;
    expect(fingerTypes(gt).map((t) => t.id)).toEqual(['hb']);
    expect(messages(gt)).toMatch(/Hangboard \/ Finger loads the fingers directly/);
    expect(messages(gt)).toContain(`${FINGER_GAP_HOURS} hours`);
  });

  it('holds the numbers it quotes against the catalogue', () => {
    const gaps = CATALOGUE.flatMap((p) =>
      p.constraints.flatMap((c) => (c.kind === 'min-gap-hours' ? [c.hours] : [])),
    );
    expect([...new Set(gaps)]).toEqual([FINGER_GAP_HOURS]);

    // "The busiest program here asks for five."
    const perWeek = CATALOGUE.flatMap((p) =>
      p.constraints.flatMap((c) => (c.kind === 'sessions-per-week' ? [c.max ?? c.min] : [])),
    );
    expect(Math.max(...perWeek)).toBe(5);
    expect(Math.max(...perWeek)).toBeLessThan(NO_REST_DAY_AT);

    // "All thirteen programs here have one."
    expect(CATALOGUE.every((p) => p.sessionTypes.some((t) => t.isRest === true))).toBe(true);

    // "Every block here of twelve weeks takes one, usually two."
    const twelve = CATALOGUE.filter((p) => p.kind === 'program' && p.weeks === 12);
    expect(twelve.length).toBeGreaterThanOrEqual(10);
    expect(twelve.every((p) => (p.deloadWeeks ?? []).length > 0)).toBe(true);
    // And the only shipped block without one is four weeks, which is why
    // DELOAD_FROM_WEEKS is a judgement rather than a measurement.
    const without = CATALOGUE.filter((p) => p.kind === 'program' && (p.deloadWeeks ?? []).length === 0);
    expect(without.map((p) => p.weeks)).toEqual([4]);
    expect(DELOAD_FROM_WEEKS).toBeGreaterThan(4);
    expect(DELOAD_FROM_WEEKS).toBeLessThanOrEqual(12);
  });
});

describe('what it says, one thing at a time', () => {
  it('is silent on a sound program', () => {
    expect(safetyIssues(sound())).toEqual([]);
  });

  it('notices finger work with no gap declared', () => {
    const p = sound({ constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }] });
    expect(messages(p)).toMatch(/nothing sets a gap between sessions/);
  });

  /**
   * A rest type named "Recovery hangs" is still a rest day. Scanning it
   * would make a program that spells its rest day carefully read as one
   * that fingerboards on it.
   */
  it('does not read a rest type as finger work, whatever it is called', () => {
    const p = sound({
      sessionTypes: [{ ...HANG, id: 'rest', name: 'Rest', isRest: true } as SessionType],
      constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }],
    });
    expect(fingerTypes(p)).toEqual([]);
    expect(messages(p)).not.toMatch(/gap between sessions/);
  });

  /**
   * And it reads the description, not only the name. A type called "Tuesday"
   * described as *"max hangs on a 20mm edge"* is finger work by every
   * measure except its title.
   */
  it('reads a type that only its description gives away', () => {
    const vague = {
      id: 'tue',
      name: 'Tuesday',
      icon: '📅',
      description: 'Max hangs on a 20mm edge, half crimp.',
    } as unknown as SessionType;
    const p = sound({
      sessionTypes: [REST, vague],
      constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }],
    });
    expect(fingerTypes(p).map((t) => t.id)).toEqual(['tue']);
    expect(messages(p)).toMatch(/Tuesday loads the fingers directly/);
  });

  it('says nothing about a program with no finger work in it', () => {
    const p = sound({
      sessionTypes: [REST, { id: 'cardio', name: 'Easy Aerobic', icon: '🏃' } as SessionType],
      constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }],
    });
    expect(safetyIssues(p)).toEqual([]);
  });

  it('notices a gap shorter than every program here asks for', () => {
    const p = sound({
      constraints: [
        { kind: 'sessions-per-week', min: 3, max: 4, note: '' },
        { kind: 'min-gap-hours', between: ['fp'], hours: 12, note: '' },
      ],
    });
    expect(messages(p)).toMatch(/is 12 hours/);
  });

  it('leaves a short gap alone when it is not about the fingers', () => {
    const p = sound({
      sessionTypes: [REST, HANG, { id: 'core', name: 'Core', icon: '🧘' } as SessionType],
      constraints: [
        { kind: 'sessions-per-week', min: 3, max: 4, note: '' },
        { kind: 'min-gap-hours', between: ['fp'], hours: FINGER_GAP_HOURS, note: '' },
        { kind: 'min-gap-hours', between: ['core'], hours: 12, note: '' },
      ],
    });
    expect(safetyIssues(p)).toEqual([]);
  });

  it('notices no rest type at all', () => {
    expect(messages(sound({ sessionTypes: [HANG] }))).toMatch(/No rest session type/);
  });

  it('notices a week with no room for a day off', () => {
    const p = sound({
      constraints: [
        { kind: 'sessions-per-week', min: NO_REST_DAY_AT, max: NO_REST_DAY_AT, note: '' },
        { kind: 'min-gap-hours', between: ['fp'], hours: FINGER_GAP_HOURS, note: '' },
      ],
    });
    expect(messages(p)).toMatch(/leaves no day off/);
  });

  it('accepts the busiest week the catalogue actually asks for', () => {
    const p = sound({
      constraints: [
        { kind: 'sessions-per-week', min: 4, max: 5, note: '' },
        { kind: 'min-gap-hours', between: ['fp'], hours: FINGER_GAP_HOURS, note: '' },
      ],
    });
    expect(safetyIssues(p)).toEqual([]);
  });

  it('notices a long block with no deload', () => {
    expect(messages(sound({ deloadWeeks: [] }))).toMatch(/no deload week/);
  });

  it('leaves a short block alone', () => {
    expect(safetyIssues(sound({ weeks: 4, deloadWeeks: [] }))).toEqual([]);
  });

  it('leaves a mode alone, which has no progression to deload from', () => {
    const p = sound({ kind: 'mode', weeks: 52, deloadWeeks: [] });
    expect(messages(p)).not.toMatch(/deload/);
  });

  it('reads as English for one finger type and for several', () => {
    const one = sound({ constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }] });
    expect(messages(one)).toMatch(/Finger Protocol loads the fingers/);

    const two = sound({
      sessionTypes: [
        REST,
        HANG,
        { ...HANG, id: 'cb', name: 'Campus Board' } as SessionType,
      ],
      constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }],
    });
    expect(messages(two)).toMatch(/Finger Protocol and Campus Board load the fingers/);
  });
});

describe('a warning, never a refusal', () => {
  it('never stops a program running', () => {
    const reckless = sound({ deloadWeeks: [], sessionTypes: [HANG], constraints: [] });
    expect(safetyIssues(reckless).length).toBeGreaterThan(2);
    expect(safetyIssues(reckless).every((i) => i.level === 'safety')).toBe(true);
    // `canRun` reads `validateProgram` and keys on errors, so none of this
    // can block. A coach writing a brutal block for themselves is allowed to.
    expect(validateProgram(reckless).some((i) => i.level === 'safety')).toBe(false);
    expect(canRun(sound())).toBe(canRun(sound({ deloadWeeks: [] })));
  });

  it('sorts above a nit and below a fault', () => {
    expect(ISSUE_RANK.error).toBeLessThan(ISSUE_RANK.safety);
    expect(ISSUE_RANK.safety).toBeLessThan(ISSUE_RANK.warning);
  });

  it('points the climber at the part of the builder that fixes it', () => {
    const p = sound({ deloadWeeks: [], sessionTypes: [HANG], constraints: [] });
    const fields = safetyIssues(p).map((i) => i.field);
    expect(fields).toContain('constraints');
    expect(fields).toContain('sessions');
    expect(fields).toContain('weeks');
  });
});

describe('the one-arm rule the builder found', () => {
  /**
   * Widening the scan to a program's prose surfaced a false positive in the
   * shared injury engine: `/one[- ]?arm/` matched "One-Arm Row (DB)" and
   * claimed it loads the fingers and the pulley, so a climber with a pulley
   * injury was warned off dumbbell rows. The exclusion is the implement,
   * not the movement — a first narrowing keyed on "hang or lock-off" lost
   * "one-armed pulling" on overhanging terrain, where the fingers are the
   * thing under load.
   */
  it.each([
    ['One-Arm Row (DB)', false],
    ['Single-arm press', false],
    ['One-arm farmer carry', false],
    ['one-armed pulling strength', true],
    ['One-arm hang', true],
    ['1-arm lock-off', true],
    ['Unilateral hang', true],
  ])('%s loads the fingers: %s', (text, expected) => {
    expect(partsInText(text).includes('fingers')).toBe(expected);
  });

  it('still reads a row as what a row is', () => {
    expect(partsInText('One-Arm Row (DB)')).toEqual(expect.arrayContaining(['elbow', 'shoulder', 'back']));
  });
});
