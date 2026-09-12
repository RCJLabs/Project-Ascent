import { describe, expect, it } from 'vitest';
import {
  FINGER_ANSWERS,
  FINGER_CHIP,
  FINGER_LABEL,
  SLEEP_CHIP,
  SLEEP_ANSWERS,
  SLEEP_LABEL,
  readinessFor,
  tissueLabel,
  type CheckIn,
  type FingerFeel,
  type ReadinessCall,
  type SleepFeel,
  type TissueFeel,
} from './readiness';
import { STALE_DAYS } from './assessments';

/**
 * The readiness rules (PLAN.md M72).
 *
 * Nine combinations, all of them checked, because nine is small enough to
 * check and a rules engine nobody has read end to end is a rules engine with
 * a hole in it.
 */

const check = (fingers: FingerFeel, sleep: SleepFeel): CheckIn => ({ fingers, sleep });
const every = FINGER_ANSWERS.flatMap((f) => SLEEP_ANSWERS.map((s) => check(f, s)));

describe('the whole table', () => {
  const calls: Record<string, ReadinessCall> = {
    'good/good': 'full',
    'good/short': 'adjusted',
    'good/none': 'adjusted',
    'tender/good': 'adjusted',
    'tender/short': 'adjusted',
    'tender/none': 'easy',
    'sore/good': 'adjusted',
    'sore/short': 'easy',
    'sore/none': 'easy',
  };

  it('calls every combination, and only one of them is a full day', () => {
    for (const c of every) {
      expect(readinessFor(c).call, `${c.fingers}/${c.sleep}`).toBe(calls[`${c.fingers}/${c.sleep}`]);
    }
    expect(every.filter((c) => readinessFor(c).call === 'full')).toHaveLength(1);
  });

  it('never leaves an answer that is not fine without something to do', () => {
    for (const c of every) {
      const out = readinessFor(c, { test: true });
      if (out.call === 'full') continue;
      // The whole point of the milestone: a call with no consequence is a
      // mood word. Something has to change — a flag, a ceiling, a deferred
      // test, or a piece of advice.
      const changes = out.advice.length + out.flag.length + (out.cap === null ? 0 : 1) + (out.deferTest ? 1 : 0);
      expect(changes, `${c.fingers}/${c.sleep}`).toBeGreaterThan(0);
    }
  });

  it('says nothing to do on the one day there is nothing to say', () => {
    const fine = readinessFor(check('good', 'good'), { test: true });
    expect(fine.advice).toEqual([]);
    expect(fine.flag).toEqual([]);
    expect(fine.cap).toBeNull();
    expect(fine.deferTest).toBeNull();
    expect(fine.because).toBe('Nothing flagged.');
  });
});

describe('the second question earns its place', () => {
  it('gives different advice for bad fingers than for bad sleep', () => {
    const fingers = readinessFor(check('sore', 'good'));
    const sleep = readinessFor(check('good', 'none'));
    // Same call, different day.
    expect(fingers.call).toBe(sleep.call);
    expect(fingers.advice).not.toEqual(sleep.advice);
    // One takes the fingerboard away and leaves the volume.
    expect(fingers.flag).toContain('fingers');
    // The other leaves the fingerboard and takes the intensity.
    expect(sleep.flag).toEqual([]);
  });

  it('moves the call on the fingers alone', () => {
    for (const sleep of SLEEP_ANSWERS) {
      const good = readinessFor(check('good', sleep));
      const sore = readinessFor(check('sore', sleep));
      expect(sore.advice.length, sleep).toBeGreaterThan(good.advice.length);
    }
  });

  it('moves the call on the sleep alone', () => {
    for (const fingers of FINGER_ANSWERS) {
      const good = readinessFor(check(fingers, 'good'));
      const none = readinessFor(check(fingers, 'none'));
      expect(none.advice.length, fingers).toBeGreaterThan(good.advice.length);
    }
  });
});

describe('the words on screen', () => {
  it('gives every answer a chip label and a sentence label', () => {
    for (const answer of FINGER_ANSWERS) {
      expect(FINGER_CHIP[answer]).toBeTruthy();
      expect(FINGER_LABEL[answer]).toBeTruthy();
    }
    for (const answer of SLEEP_ANSWERS) {
      expect(SLEEP_CHIP[answer]).toBeTruthy();
      expect(SLEEP_LABEL[answer]).toBeTruthy();
    }
  });

  it('keeps the chips the same sort of length as each other', () => {
    // The first version cut the chip out of the sentence, and
    // 'Barely slept'.replace('Slept ', '') is still 'Barely slept' — so one
    // chip in six came out at twice the width of its neighbours.
    const chips = [
      ...FINGER_ANSWERS.map((a) => FINGER_CHIP[a]),
      ...SLEEP_ANSWERS.map((a) => SLEEP_CHIP[a]),
    ];
    for (const chip of chips) {
      expect(chip.split(' '), chip).toHaveLength(1);
    }
  });

  it('keeps the sentence labels naming what they are about', () => {
    for (const answer of FINGER_ANSWERS) expect(FINGER_LABEL[answer]).toMatch(/^Fingers /);
  });
});

describe('naming the reason', () => {
  it('names only the answers that drove it', () => {
    expect(readinessFor(check('sore', 'good')).because).toBe(FINGER_LABEL.sore);
    expect(readinessFor(check('good', 'none')).because).toBe(SLEEP_LABEL.none);
  });

  it('names both when both did', () => {
    expect(readinessFor(check('tender', 'short')).because).toBe(
      `${FINGER_LABEL.tender} · ${SLEEP_LABEL.short}`,
    );
  });
});

describe('advice that fits the day', () => {
  it('does not talk about the fingerboard on a day with no finger work in it', () => {
    const legs = readinessFor(check('sore', 'good'), { loads: ['hip', 'knee'] });
    expect(legs.advice).toEqual([]);
    // The call stands, though: sore fingers are still sore.
    expect(legs.call).toBe('adjusted');
    expect(legs.cap).toBe(7);
  });

  it('still says it when the day is unknown — a climber with no program gets the advice', () => {
    expect(readinessFor(check('sore', 'good')).advice.length).toBe(1);
  });

  it('keeps the advice that does not depend on what today loads', () => {
    const legs = readinessFor(check('good', 'none'), { loads: ['hip'] });
    expect(legs.advice).toHaveLength(1);
  });

  it('flags the part whatever today loads, so the marking is left to the lines themselves', () => {
    expect(readinessFor(check('sore', 'good'), { loads: [] }).flag).toEqual(['fingers', 'pulley']);
  });
});

describe('the flag says which answer put it there', () => {
  it('names the fingers, not the sleep that happened to be bad too', () => {
    const out = readinessFor(check('sore', 'none'));
    expect(out.flagBecause).toBe(FINGER_LABEL.sore);
    // The overall reason names both; the flag on a line names one.
    expect(out.because).toContain(SLEEP_LABEL.none);
  });

  it('has nothing to name when nothing is flagged', () => {
    expect(readinessFor(check('good', 'none')).flagBecause).toBeNull();
    expect(readinessFor(check('good', 'good')).flagBecause).toBeNull();
  });

  it('names an answer whenever there is a flag, and never otherwise', () => {
    for (const c of every) {
      const out = readinessFor(c);
      expect(out.flag.length > 0, `${c.fingers}/${c.sleep}`).toBe(out.flagBecause !== null);
    }
  });
});

describe('the effort ceiling', () => {
  it('sets none on a good day and lowers it as the day gets worse', () => {
    expect(readinessFor(check('good', 'good')).cap).toBeNull();
    expect(readinessFor(check('tender', 'good')).cap).toBe(7);
    expect(readinessFor(check('sore', 'none')).cap).toBe(5);
  });
});

describe('a test scheduled for today', () => {
  it('is left alone when there is no test', () => {
    expect(readinessFor(check('sore', 'none')).deferTest).toBeNull();
  });

  it('is left alone on a good day', () => {
    expect(readinessFor(check('good', 'good'), { test: true }).deferTest).toBeNull();
  });

  it('waits on tender fingers, and says what it would cost', () => {
    const out = readinessFor(check('tender', 'good'), { test: true });
    expect(out.deferTest).toMatch(new RegExp(`${STALE_DAYS / 7} weeks`));
  });

  it('waits on no sleep, for the number rather than for the safety', () => {
    expect(readinessFor(check('good', 'none'), { test: true }).deferTest).toMatch(/record as your strength/);
  });

  it('quotes the staleness the app actually uses', () => {
    // The sentence is only worth reading because of the figure in it.
    for (const c of every) {
      const out = readinessFor(c, { test: true });
      if (out.deferTest?.includes('weeks')) expect(out.deferTest).toContain(`${STALE_DAYS / 7} weeks`);
    }
  });

  it('gives the fingers the first word when both would defer', () => {
    // The one that is a safety question as well as a data question.
    expect(readinessFor(check('sore', 'none'), { test: true }).deferTest).toMatch(/sore/);
  });
});

/**
 * An injured part the fingers question does not cover (PLAN.md M103).
 *
 * The same rule the milestone was built on: every answer that is not "fine"
 * has to produce something you can point at. For a part that is not the
 * fingers that means the part named in the advice, the part flagged on the
 * lines that load it, and a test that loads it told to wait.
 */
describe('an injured part', () => {
  const elbow = (feel: TissueFeel, loads?: string[]) =>
    readinessFor({ fingers: 'good', sleep: 'good', parts: { elbow: feel } }, {
      test: true,
      ...(loads ? { loads: loads as never } : {}),
    });

  it('costs a good day nothing', () => {
    const out = elbow('good');
    expect(out.call).toBe('full');
    expect(out.advice).toEqual([]);
    expect(out.flag).toEqual([]);
    expect(out.because).toBe('Nothing flagged.');
    expect(out.deferTest).toBeNull();
  });

  it('flags the part, either way it is answered', () => {
    expect(elbow('tender').flag).toEqual(['elbow']);
    expect(elbow('sore').flag).toEqual(['elbow']);
  });

  // "Keep the load off it" is advice about nothing. The part is the whole
  // content of the sentence, because an elbow, a knee and a hip do not
  // share a prescription.
  it('names the part in the advice, either way it is answered', () => {
    expect(elbow('tender').advice.join(' ')).toMatch(/elbow/);
    expect(elbow('sore').advice.join(' ')).toMatch(/elbow/);
  });

  it('says which answer it is reacting to', () => {
    expect(elbow('sore').because).toBe(tissueLabel('elbow', 'sore'));
    expect(elbow('tender').flagBecause).toBe(tissueLabel('elbow', 'tender'));
  });

  it('holds a test that would load it', () => {
    expect(elbow('sore').deferTest).toMatch(/elbow/);
    expect(elbow('tender').deferTest).toBeNull();
  });

  // Advice about a part today does not load is noise, and the same rule
  // already governs the fingers.
  it('keeps quiet about a part the day does not load', () => {
    expect(elbow('sore', ['shoulder']).advice).toEqual([]);
    expect(elbow('sore', ['elbow']).advice.length).toBe(1);
  });

  it('moves the call on the part alone', () => {
    expect(elbow('good').call).toBe('full');
    expect(elbow('tender').call).toBe('adjusted');
    expect(elbow('sore').call).toBe('adjusted');
  });
});
