import { describe, expect, it } from 'vitest';
import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import { blankProgram } from './customProgram';
import { addDays } from './dates';
import { planVsLog, authoredSteps, type Finding, type FindingKind } from './planVsLog';

/**
 * The plan, checked against the log (PLAN.md M148).
 *
 * A hand-built program rather than a catalogue one, because every gate here
 * is a threshold and the point of the tests is to sit either side of it.
 * The catalogue is exercised by the shape tests at the bottom, which is
 * where a program the app actually ships belongs.
 */

// 2026-03-08 is a Sunday, so the block's own window opens there.
const START = '2026-03-08';
const FROM = '2026-03-08';

/** Week `w`, day `d` (0 = Sunday) of the block. */
const on = (w: number, d: number) => addDays(FROM, (w - 1) * 7 + d);

const PROGRAM: Program = {
  ...blankProgram('Fixture'),
  id: 'fixture',
  weeks: 8,
  deloadWeeks: [4, 8],
  phases: [
    { id: 'p1', name: 'Base', weekStart: 1, weekEnd: 4, description: '', goals: [] },
    { id: 'p2', name: 'Peak', weekStart: 5, weekEnd: 8, description: '', goals: [] },
  ],
  constraints: [
    { kind: 'min-gap-hours', between: ['fingers'], hours: 48, note: 'Fingers need two days.' },
    { kind: 'not-day-before', sessionTypeId: 'fingers', before: 'board', note: 'Never hang before a board day.' },
  ],
  sessionTypes: [
    {
      id: 'fingers',
      name: 'Finger Protocol',
      icon: '🪝',
      description: '',
      intensity: 'hard',
      blocks: [
        {
          id: 'hang',
          name: 'Hangs',
          perPhase: {
            p1: {
              rationale: '',
              exercises: [
                { name: 'Max Hangs', sets: '5', hold: '10 s', rest: '3 min' },
                { name: 'Pull-ups', sets: '4', reps: '5', rest: '2 min' },
              ],
              perWeek: [{ week: 3, step: 'Add 2.5 kg if last week felt solid.' }],
            },
            // A longer dose than phase one's, so a reading that ignored the
            // week would report the wrong estimate rather than the same one.
            p2: {
              rationale: '',
              exercises: [
                { name: 'Max Hangs', sets: '9', hold: '10 s', rest: '3 min' },
                { name: 'Pull-ups', sets: '4', reps: '5', rest: '2 min' },
              ],
              perWeek: [{ week: 2, step: 'One more kilo.' }],
            },
          },
        },
      ],
    },
    {
      id: 'board',
      name: 'Board',
      icon: '🧗',
      description: '',
      intensity: 'moderate',
      blocks: [
        {
          id: 'accessory',
          name: 'Accessory',
          perPhase: {
            p1: {
              rationale: '',
              selection: { pick: 2, note: 'Rotate the focus across sessions.' },
              exercises: [
                { name: 'Rows', sets: '3', reps: '8' },
                { name: 'Dips', sets: '3', reps: '8' },
                { name: 'Hip Flexor', sets: '3', reps: '8' },
                { name: 'Wrist Curls', sets: '3', reps: '8' },
              ],
            },
            p2: { rationale: '', exercises: [{ name: 'Rows', sets: '3', reps: '8' }] },
          },
        },
      ],
    },
    { id: 'long', name: 'Engine Room', icon: '🚂', description: '', intensity: 'moderate', duration: '45 min' },
    {
      // A "menu" with nothing to choose between: two options and both of
      // them prescribed. Picking the same two every week is the only thing
      // this block can mean.
      id: 'core',
      name: 'Core',
      icon: '🧱',
      description: '',
      intensity: 'easy',
      blocks: [
        {
          id: 'brace',
          name: 'Brace',
          perPhase: {
            p1: {
              rationale: '',
              selection: { pick: 2 },
              exercises: [
                { name: 'Plank', sets: '3', reps: '8' },
                { name: 'Hollow Hold', sets: '3', reps: '8' },
              ],
            },
          },
        },
      ],
    },
    { id: 'rest', name: 'Rest', icon: '😴', description: '', isRest: true },
  ],
  recommendedLayout: { name: 'Week', description: '', slots: { 1: 'fingers', 3: 'board', 5: 'long' } },
};

const did = (date: string, sessionTypeId: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#${sessionTypeId}`,
    date,
    planned: true,
    completed: true,
    rewarded: false,
    mode: 'indoor',
    climbs: [],
    programId: PROGRAM.id,
    sessionTypeId,
    ...patch,
  }) as Session;

function read(sessions: Session[], today = on(8, 6)): Finding[] {
  return planVsLog({ program: PROGRAM, startDate: START, sessions, today });
}

const kinds = (sessions: Session[], today?: string) =>
  read(sessions, today).map((f) => f.kind as FindingKind);

const of = (sessions: Session[], kind: FindingKind, today?: string) =>
  read(sessions, today).find((f) => f.kind === kind) ?? null;

// ── Spacing ───────────────────────────────────────────────────────────────

describe('spacing, checked on the dates rather than the layout', () => {
  /** Fingers on back-to-back days, `times` weeks running. */
  const tooClose = (times: number) =>
    Array.from({ length: times }, (_, i) => [
      did(on(i + 1, 1), 'fingers'),
      did(on(i + 1, 2), 'fingers'),
    ]).flat();

  it('names the breaches and the tightest gap', () => {
    const found = of(tooClose(3), 'spacing')!;
    expect(found.asked).toBe('48h apart');
    expect(found.did).toBe('24h, 3 times');
    expect(found.headline).toContain('3 times under the 48-hour gap');
    // The program's own words, because an opinion has to show its reasoning.
    expect(found.body).toContain('Fingers need two days.');
  });

  it('stays quiet at one breach, which is a week that went wrong', () => {
    expect(of(tooClose(1), 'spacing')).toBeNull();
    expect(of(tooClose(2), 'spacing')).not.toBeNull();
  });

  it('counts two on one day as no gap at all', () => {
    const sessions = [
      did(on(1, 1), 'fingers'),
      { ...did(on(1, 1), 'fingers'), id: `${on(1, 1)}#2` },
      did(on(3, 1), 'fingers'),
      { ...did(on(3, 1), 'fingers'), id: `${on(3, 1)}#2` },
    ];
    expect(of(sessions, 'spacing')!.did).toBe('0h, 2 times');
  });

  it('reads an ordering rule off consecutive dates', () => {
    // Fingers Tuesday, board Wednesday — a week apart each time, so the
    // gap rule is satisfied and only the ordering one fires.
    const sessions = [1, 3, 5].flatMap((w) => [did(on(w, 2), 'fingers'), did(on(w, 3), 'board')]);
    const found = of(sessions, 'spacing')!;
    expect(found.headline).toContain('3 times Finger Protocol landed the day before Board');
    expect(found.body).toContain('Never hang before a board day.');
  });

  it('does not count a rest day logged between them', () => {
    const sessions = [
      did(on(1, 1), 'fingers'),
      did(on(1, 2), 'rest'),
      did(on(3, 1), 'fingers'),
      did(on(5, 1), 'fingers'),
    ];
    expect(of(sessions, 'spacing')).toBeNull();
  });
});

// ── Deloads ───────────────────────────────────────────────────────────────

describe('a deload week where the load did not fall', () => {
  /** Three ordinary weeks, then week four at `share` of them. */
  const block = (share: number) => [
    ...[1, 2, 3].flatMap((w) => [
      did(on(w, 1), 'board', { rpe: 8, durationMin: 90 }),
      did(on(w, 3), 'board', { rpe: 8, durationMin: 90 }),
    ]),
    did(on(4, 1), 'board', { rpe: 8, durationMin: Math.round(180 * share), deload: true }),
  ];

  it('reports the ratio and the week', () => {
    const found = of(block(1), 'deload')!;
    expect(found.subject).toBe('Week 4');
    expect(found.did).toBe('1.00× the weeks before it');
    expect(found.headline).toContain('Week 4 was a deload and the load did not drop');
  });

  it('stays quiet when the load actually came off', () => {
    expect(of(block(0.6), 'deload')).toBeNull();
  });

  it('holds its tongue until the week has finished', () => {
    // Wednesday of week four: the week is two days old and reading it
    // against three whole ones would call every deload a success.
    expect(of(block(1), 'deload', on(4, 3))).toBeNull();
    expect(of(block(1), 'deload', on(4, 6))).not.toBeNull();
  });

  /**
   * A week with a session the climber never scored is a week whose load is
   * a floor rather than a total (PLAN.md M162). This finding is a ratio of
   * one week to the three before it, so a hole in either half moves it —
   * quiet where it should speak, or speaking on a comparison that is half
   * guesswork. Skipped rather than guessed.
   */
  it('skips a deload week with a session that was never scored', () => {
    const holed = [...block(1), did(on(4, 4), 'board', {})];
    expect(of(holed, 'deload')).toBeNull();
  });

  it('drops a holed baseline week and compares against the clean ones', () => {
    // Weeks 1 and 3 are still whole, which is a baseline. Excluding week 2
    // is the point — averaging a week that reads light because it was not
    // scored would make the deload look heavy against it.
    const holed = [...block(1), did(on(2, 5), 'board', {})];
    expect(of(holed, 'deload')).not.toBeNull();
  });

  it('goes quiet when dropping the holed weeks leaves too little', () => {
    const holed = [...block(1), did(on(2, 5), 'board', {}), did(on(3, 5), 'board', {})];
    expect(of(holed, 'deload')).toBeNull();
  });

  it('is unmoved by an unscored week outside the comparison', () => {
    // Week 5 is neither the deload nor one of the three before it.
    const elsewhere = [...block(1), did(on(5, 1), 'board', {})];
    expect(of(elsewhere, 'deload', on(5, 6))).not.toBeNull();
  });

  it('needs two weeks of baseline before it means anything', () => {
    const thin = [
      did(on(3, 1), 'board', { rpe: 8, durationMin: 90 }),
      did(on(4, 1), 'board', { rpe: 8, durationMin: 90, deload: true }),
    ];
    expect(of(thin, 'deload')).toBeNull();
  });

  /** Two sessions a week at RPE 8 for 90 minutes: 24 units of load. */
  const ordinary = (week: number) => [
    did(on(week, 1), 'board', { rpe: 8, durationMin: 90 }),
    did(on(week, 3), 'board', { rpe: 8, durationMin: 90 }),
  ];

  it('does not let one deload week become the baseline for the next', () => {
    // Weeks five to seven are empty, so week eight's baseline reaches back
    // past week four — and week four is itself a deload, which is not a
    // week anything should be measured against.
    const sessions = [
      ...ordinary(1),
      ...ordinary(2),
      ...ordinary(3),
      did(on(4, 1), 'board', { rpe: 8, durationMin: 90, deload: true }),
      did(on(8, 1), 'board', { rpe: 8, durationMin: 162, deload: true }),
    ];
    expect(of(sessions, 'deload')).toBeNull();
  });

  it('reports the worst deload week rather than the first', () => {
    const sessions = [
      ...[1, 2, 3, 5, 6, 7].flatMap(ordinary),
      did(on(4, 1), 'board', { rpe: 8, durationMin: 180, deload: true }),
      did(on(8, 1), 'board', { rpe: 8, durationMin: 270, deload: true }),
    ];
    const found = of(sessions, 'deload')!;
    expect(found.subject).toBe('Week 8');
    expect(found.did).toBe('1.50× the weeks before it');
  });

  it('says nothing about a climber who logs no RPE or duration', () => {
    const untimed = block(1).map((s) => ({ ...s, rpe: undefined, durationMin: undefined }));
    expect(of(untimed, 'deload')).toBeNull();
  });
});

// ── Effort ────────────────────────────────────────────────────────────────

describe('the intensity a day is written at, against the RPE it is logged at', () => {
  // Week four is the deload and is left out of this join on purpose, so
  // the fixtures step over it rather than quietly losing a session to it.
  const WEEKS = [1, 2, 3, 5, 6, 7, 8];
  const rated = (rpe: number, count = 4) =>
    WEEKS.slice(0, count).map((w) => did(on(w, 1), 'board', { rpe }));

  it('reports both numbers when the day is run harder than written', () => {
    const found = of(rated(9), 'effort')!;
    expect(found.asked).toBe('moderate as written');
    expect(found.did).toBe('RPE 9 logged');
    expect(found.tone).toBe('caution');
    expect(found.headline).toBe('Board is written moderate and you log it at 9');
  });

  it('says the quieter half too, and weighs it less', () => {
    const easy = of(rated(3), 'effort')!;
    expect(easy.did).toBe('RPE 3 logged');
    expect(easy.tone).toBe('neutral');
    expect(easy.weight).toBeLessThan(of(rated(9), 'effort')!.weight);
  });

  it('is silent when the log agrees with the program', () => {
    expect(of(rated(5), 'effort')).toBeNull();
    expect(of(rated(6), 'effort')).toBeNull();
  });

  it('waits for four rated sessions', () => {
    expect(of(rated(9, 3), 'effort')).toBeNull();
    expect(of(rated(9, 4), 'effort')).not.toBeNull();
  });

  it('leaves a deload week out, since the declared intensity knows nothing about deloads', () => {
    // Three hard weeks and the deload: four sessions, one of which is not
    // a fair reading of the type.
    const sessions = [...rated(9, 3), did(on(4, 1), 'board', { rpe: 9 })];
    expect(of(sessions, 'effort')).toBeNull();
  });

  it('needs three quarters of them to miss, not one of them', () => {
    const mostly = [9, 5, 5, 5].map((rpe, i) => did(on(WEEKS[i]!, 1), 'board', { rpe }));
    expect(of(mostly, 'effort')).toBeNull();
  });

  it('reports a median somebody actually typed', () => {
    // Four sessions, two sevens and two nines: the answer is a seven or a
    // nine, never the seven and a half that averaging would invent.
    const mixed = [7, 7, 9, 9].map((rpe, i) => did(on(WEEKS[i]!, 1), 'board', { rpe }));
    expect(of(mixed, 'effort')!.did).toBe('RPE 7 logged');
  });

  it('does not read a logged rest day as a session of the type it replaced', () => {
    // Planned as a board day, logged as a rest day. The type is still on
    // the record and the session is not one.
    const rested = WEEKS.slice(0, 4).map((w) =>
      did(on(w, 1), 'board', {
        rpe: 9,
        restChecklist: { hydration: true, mobility: true, zone1: false, sleep: true },
      }),
    );
    expect(of(rested, 'effort')).toBeNull();
  });

  it('does not read the rest type the program declares as training', () => {
    const naps = WEEKS.slice(0, 4).map((w) => did(on(w, 1), 'rest', { rpe: 9 }));
    expect(of(naps, 'effort')).toBeNull();
  });

  it('ignores a session with no RPE rather than treating it as easy', () => {
    const sessions = [...rated(9, 4), ...[1, 2, 3, 5].map((w) => did(on(w, 3), 'board'))];
    expect(of(sessions, 'effort')!.sample).toBe(4);
  });
});

// ── Length ────────────────────────────────────────────────────────────────

describe('how long the work should take, against how long it took', () => {
  const ran = (typeId: string, minutes: number, count = 4) =>
    Array.from({ length: count }, (_, i) => did(on(i + 1, 1), typeId, { durationMin: minutes }));

  it('says so when the prescribed work is not all happening', () => {
    const found = of(ran('fingers', 10), 'length')!;
    expect(found.did).toBe('10 min logged');
    expect(found.asked).toBe('about 21 min of work');
    expect(found.headline).toBe('Finger Protocol is coming in short');
  });

  /**
   * The reading the proposal asked for and the app is not entitled to.
   *
   * `sessionMinutes` counts the prescribed work and says at length that it
   * does not count the warm-up, the walk to the wall or the rest between
   * burns. Every real session runs over it. Reporting that as a divergence
   * would be the app calling its own omission the climber's fault.
   */
  it('refuses the long direction on a derived estimate', () => {
    expect(of(ran('fingers', 60), 'length')).toBeNull();
    expect(of(ran('fingers', 120), 'length')).toBeNull();
  });

  it('takes the long direction where the author wrote the whole session down', () => {
    const found = of(ran('long', 90), 'length')!;
    expect(found.asked).toBe('45 min as written');
    expect(found.did).toBe('90 min logged');
    expect(found.headline).toContain('half again as long');
  });

  it('waits for four timed sessions', () => {
    expect(of(ran('fingers', 10, 3), 'length')).toBeNull();
    expect(of(ran('fingers', 10, 4), 'length')).not.toBeNull();
  });

  it('leaves a session that is merely on the short side alone', () => {
    // Fifteen minutes against twenty-one is a quick evening, not a session
    // that did not happen. Four of them, all in phase one and none in the
    // deload week, so nothing but the ratio decides it.
    const brisk = [on(1, 1), on(1, 5), on(2, 1), on(3, 1)].map((date) =>
      did(date, 'fingers', { durationMin: 15 }),
    );
    expect(of(brisk, 'length')).toBeNull();
  });

  it('leaves an authored session that merely ran over alone', () => {
    expect(of(ran('long', 55), 'length')).toBeNull();
  });

  /**
   * The estimate is resolved against the week the session was in, which is
   * what makes it deload-aware and phase-aware. Both halves matter and
   * neither shows up in a fixture whose phases prescribe the same dose:
   * weeks four and eight are deloads, five and six are phase two's longer
   * prescription, and the estimate reported is the median of all four.
   */
  it('reads each session against its own week', () => {
    const spread = [4, 5, 6, 8].map((w) => did(on(w, 1), 'fingers', { durationMin: 17 }));
    expect(of(spread, 'length')!.asked).toBe('about 29 min of work');
  });

  it('is silent about sessions logged without a duration', () => {
    const sessions = ran('fingers', 10).map((s) => ({ ...s, durationMin: undefined }));
    expect(of(sessions, 'length')).toBeNull();
  });
});

// ── Progression ───────────────────────────────────────────────────────────

describe('a week that asked for a step up', () => {
  it('places each step on the program week its phase puts it in', () => {
    // Week 3 of phase one is program week 3; week 2 of phase two, which
    // opens on week five, is program week six.
    expect(authoredSteps(PROGRAM).map((s) => s.week)).toEqual([3, 6]);
  });

  /** The same reading every week, so no step is ever taken. */
  const flat = (load: number) =>
    [2, 3, 5, 6].map((w) =>
      did(on(w, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load }] }),
    );

  it('reports the step in the words the program wrote', () => {
    const found = of(flat(20), 'progression')!;
    expect(found.sample).toBe(2);
    expect(found.asked).toBe('One more kilo.');
    expect(found.body).toContain('Max Hangs');
    expect(found.headline).toContain('2 weeks asked for a step up');
  });

  it('stays quiet when the numbers moved', () => {
    const moved = [
      did(on(2, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }] }),
      did(on(3, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 25 }] }),
      did(on(5, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 25 }] }),
      did(on(6, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 30 }] }),
    ];
    expect(of(moved, 'progression')).toBeNull();
  });

  it('needs two flat steps, not one', () => {
    const one = [
      did(on(2, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }] }),
      did(on(3, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }] }),
    ];
    expect(of(one, 'progression')).toBeNull();
  });

  it('does not compare a dimension that is missing from either week', () => {
    // Sets one week and load the next is two things measured, not a change
    // — and equally not a flat reading.
    const mixed = [2, 3, 5, 6].map((w) =>
      did(on(w, 1), 'fingers', {
        exercises: [w % 2 === 0 ? { name: 'Max Hangs', sets: 5 } : { name: 'Max Hangs', load: 20 }],
      }),
    );
    expect(of(mixed, 'progression')).toBeNull();
  });

  it('reads nothing from a tick with no numbers on it', () => {
    const ticks = [2, 3, 5, 6].map((w) =>
      did(on(w, 1), 'fingers', { exercises: [{ name: 'Max Hangs' }] }),
    );
    expect(of(ticks, 'progression')).toBeNull();
  });

  it('does not let a bare tick later in the week wipe the reading', () => {
    // Monday's numbers and Thursday's tick, both of them "Max Hangs". The
    // tick is not a reading and must not take the place of one.
    const sessions = [2, 3, 5, 6].flatMap((w) => [
      did(on(w, 1), 'fingers', { exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }] }),
      { ...did(on(w, 4), 'fingers', { exercises: [{ name: 'Max Hangs' }] }), id: `${on(w, 4)}#b` },
    ]);
    expect(of(sessions, 'progression')!.sample).toBe(2);
  });

  it('needs every comparable line to be flat, not just one of them', () => {
    // Max Hangs stood still and Pull-ups moved. A week where something
    // went up is a week where the step was taken.
    const sessions = [2, 3, 5, 6].map((w, i) =>
      did(on(w, 1), 'fingers', {
        exercises: [
          { name: 'Max Hangs', sets: 5, load: 20 },
          { name: 'Pull-ups', sets: 4, reps: 5 + i },
        ],
      }),
    );
    expect(of(sessions, 'progression')).toBeNull();
  });
});

// ── Menus ─────────────────────────────────────────────────────────────────

describe('a menu that is never rotated', () => {
  const picked = (names: string[][], week = 1) =>
    names.map((chosen, i) =>
      did(on(week + i, 3), 'board', { exercises: chosen.map((name) => ({ name })) }),
    );

  const same = Array.from({ length: 4 }, () => ['Rows', 'Dips']);

  it('counts the ticks against the rule and quotes it', () => {
    const found = of(picked(same), 'menu')!;
    expect(found.asked).toBe('pick 2 of 4');
    expect(found.did).toBe('the same 2 across 4 sessions');
    expect(found.body).toContain('Rotate the focus across sessions.');
  });

  it('is satisfied by one line rotating', () => {
    const rotated = [['Rows', 'Dips'], ['Rows', 'Hip Flexor'], ['Rows', 'Dips'], ['Rows', 'Dips']];
    expect(of(picked(rotated), 'menu')).toBeNull();
  });

  it('says the other half when fewer lines are logged than the menu asks for', () => {
    const thin = Array.from({ length: 4 }, () => ['Rows']);
    const found = of(picked(thin), 'menu')!;
    expect(found.headline).toBe('Accessory asks for 2 and you are logging 1');
  });

  it('waits for four sessions of the type', () => {
    expect(of(picked(same.slice(0, 3)), 'menu')).toBeNull();
  });

  it('does not count lines that are not on the menu', () => {
    const elsewhere = Array.from({ length: 4 }, () => ['Deadlift', 'Squat']);
    expect(of(picked(elsewhere), 'menu')).toBeNull();
  });

  it('says nothing about a menu with nothing to choose between', () => {
    // Two options and both of them prescribed: picking the same two every
    // week is the only thing that block can mean.
    const both = [1, 2, 3, 4].map((w) =>
      did(on(w, 2), 'core', { exercises: [{ name: 'Plank' }, { name: 'Hollow Hold' }] }),
    );
    expect(of(both, 'menu')).toBeNull();
  });

  it('counts only the sessions inside the phase the rule belongs to', () => {
    // Three in phase one, where the rule is, and a fourth in phase two,
    // where it is not. Three is under the floor and stays quiet.
    const sessions = [
      ...[1, 2, 3].map((w) => did(on(w, 3), 'board', { exercises: [{ name: 'Rows' }, { name: 'Dips' }] })),
      did(on(5, 3), 'board', { exercises: [{ name: 'Rows' }] }),
    ];
    expect(of(sessions, 'menu')).toBeNull();
  });

  it('matches a tick whatever its capitals and spacing', () => {
    const sloppy = Array.from({ length: 4 }, () => ['  rows ', 'DIPS']);
    expect(of(picked(sloppy), 'menu')!.did).toBe('the same 2 across 4 sessions');
  });
});

// ── The whole reading ─────────────────────────────────────────────────────

describe('what comes back', () => {
  it('is empty for a climber who has logged nothing', () => {
    expect(read([])).toEqual([]);
    expect(read([did(on(1, 1), 'board')])).toEqual([]);
  });

  it('is empty before the block has started', () => {
    expect(read([did(on(1, 1), 'board', { rpe: 9 })], addDays(FROM, -1))).toEqual([]);
  });

  it('returns at most one subject per join', () => {
    // Both the Board and Engine Room run at nine; only one effort finding
    // comes back, because five things you are doing wrong is an indictment.
    const sessions = [1, 2, 3, 5].flatMap((w) => [
      did(on(w, 1), 'board', { rpe: 9 }),
      did(on(w, 5), 'long', { rpe: 9 }),
    ]);
    expect(kinds(sessions).filter((k) => k === 'effort')).toHaveLength(1);
  });

  it('puts the heaviest first', () => {
    const sessions = [
      // Two gap breaches and four moderate days at nine.
      ...[1, 3].flatMap((w) => [did(on(w, 1), 'fingers'), did(on(w, 2), 'fingers')]),
      ...[1, 2, 3, 5].map((w) => did(on(w, 5), 'board', { rpe: 9 })),
    ];
    const found = read(sessions);
    expect(found.map((f) => f.kind)).toEqual(['spacing', 'effort']);
    expect(found[0]!.weight).toBeGreaterThan(found[1]!.weight);
  });

  it('sorts by weight and not by the order the joins run in', () => {
    // Four board sessions in phase one, each logged at an RPE the day does
    // not ask for and each ticking the same two lines off a menu of four.
    // The effort join runs first and weighs less; the menu has to lead.
    const sessions = [on(1, 1), on(1, 5), on(2, 1), on(3, 1)].map((date) =>
      did(date, 'board', { rpe: 3, exercises: [{ name: 'Rows' }, { name: 'Dips' }] }),
    );
    expect(read(sessions).map((f) => f.kind)).toEqual(['menu', 'effort']);
  });

  it('gives every finding both of its numbers', () => {
    const sessions = [
      ...[1, 3].flatMap((w) => [did(on(w, 1), 'fingers'), did(on(w, 2), 'fingers')]),
      ...[1, 2, 3, 5].map((w) => did(on(w, 5), 'board', { rpe: 9 })),
    ];
    for (const finding of read(sessions)) {
      expect(finding.asked).not.toBe('');
      expect(finding.did).not.toBe('');
      expect(finding.sample).toBeGreaterThan(0);
    }
  });

  it('moves the signature when the fact moves, so a dismissal expires', () => {
    const two = [1, 3].flatMap((w) => [did(on(w, 1), 'fingers'), did(on(w, 2), 'fingers')]);
    const three = [...two, did(on(5, 1), 'fingers'), did(on(5, 2), 'fingers')];
    expect(of(two, 'spacing')!.id).toBe(of(three, 'spacing')!.id);
    expect(of(two, 'spacing')!.signature).not.toBe(of(three, 'spacing')!.signature);
  });
});
