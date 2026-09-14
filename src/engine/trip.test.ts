import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import { newSession, type Session } from '@/db/sessions';
import { buildTips } from './coach';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import type { Objective } from './objectives';
import { TRIP_WINDOW_DAYS, tripNow } from './trip';

/**
 * The strongest warning the app has, fired at the climber on the trip it
 * peaked them for (PLAN.md M163).
 */

const TODAY = '2026-05-04';

const trip = (over: Partial<Objective> = {}): Objective => ({
  id: 'obj-trip',
  name: 'Céüse',
  kind: 'trip',
  status: 'training',
  targetDate: TODAY,
  requirements: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeAll(async () => {
  await loadPrograms();
});

describe('which objective counts as a trip you are on', () => {
  it('is the one you said you would be on around now', () => {
    expect(tripNow([trip()], TODAY)?.name).toBe('Céüse');
  });

  it.each([
    ['the day before the target', addDays(TODAY, -1)],
    ['the far edge of the window', addDays(TODAY, -TRIP_WINDOW_DAYS)],
    ['the near edge of the window', addDays(TODAY, TRIP_WINDOW_DAYS)],
  ])('counts %s', (_label, today) => {
    expect(tripNow([trip()], today)).not.toBeNull();
  });

  it.each([
    ['a day past the window', addDays(TODAY, TRIP_WINDOW_DAYS + 1)],
    ['a day before the window', addDays(TODAY, -TRIP_WINDOW_DAYS - 1)],
    ['a season away', addDays(TODAY, 120)],
  ])('does not count %s', (_label, today) => {
    expect(tripNow([trip()], today)).toBeNull();
  });

  /**
   * A route or a boulder with a target date is a redpoint day, not a
   * fortnight of volume — and one day of trying hard is not what puts the
   * ratio at three.
   */
  it.each(['boulder', 'route', 'other'] as const)('is not a %s objective', (kind) => {
    expect(tripNow([trip({ kind })], TODAY)).toBeNull();
  });

  /**
   * `shelved` is the one status that means abandoned. A trip left on
   * `training` because nobody updates an objective from a campsite is the
   * common case, and one marked `sent` on day three is still a trip on day
   * four.
   */
  it.each(['planning', 'training', 'sent'] as const)('still counts while %s', (status) => {
    expect(tripNow([trip({ status })], TODAY)).not.toBeNull();
  });

  it('does not count a shelved one', () => {
    expect(tripNow([trip({ status: 'shelved' })], TODAY)).toBeNull();
  });

  it('says nothing about a trip with no date on it', () => {
    expect(tripNow([trip({ targetDate: undefined })], TODAY)).toBeNull();
  });

  /**
   * A half-typed date reaches the store from a text field, and `fromKey` of
   * one is an Invalid Date whose arithmetic is NaN. `NaN > 10` is false, so
   * without the `isDateKey` guard every malformed objective would read as a
   * trip you are on — the failure would be silent and permanent rather than
   * a throw.
   */
  it.each(['2026-5-4', 'soon', '', '2026-02-30'])('ignores %s as a date', (targetDate) => {
    expect(tripNow([trip({ targetDate })], TODAY)).toBeNull();
  });

  it('takes the nearest when two are in range', () => {
    const near = trip({ id: 'obj-near', name: 'Albarracín', targetDate: addDays(TODAY, 2) });
    const far = trip({ id: 'obj-far', name: 'Magic Wood', targetDate: addDays(TODAY, 9) });
    expect(tripNow([far, near], TODAY)?.name).toBe('Albarracín');
    expect(tripNow([near, far], TODAY)?.name).toBe('Albarracín');
  });

  it('handles no objectives at all, which is most climbers', () => {
    expect(tripNow([], TODAY)).toBeNull();
    expect(tripNow(undefined, TODAY)).toBeNull();
  });
});

/**
 * The spike itself. Built from a real log rather than a hand-set
 * `ClimberState`, because the number this tip quotes is the whole point of
 * it and a fixture that asserted the ratio would prove nothing about whether
 * the ratio gets that high.
 */
const at = (date: string, rpe: number, min: number): Session => ({
  ...newSession(date, 0),
  completed: true,
  rpe,
  durationMin: min,
});

/** Three sessions a week, for as long as you like. */
function steady(fromDaysAgo: number, toDaysAgo: number): Session[] {
  const out: Session[] = [];
  for (let d = fromDaysAgo; d >= toDaysAgo; d -= 1) {
    const date = addDays(TODAY, -d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 1 || dow === 3 || dow === 5) out.push(at(date, 7, 60));
  }
  return out;
}

/** Tapered, then four long days on rock — the shape that puts the ratio at 3. */
function onTheTrip(): { sessions: Session[]; today: string } {
  const before = [...steady(90, 8), at(addDays(TODAY, -7), 5, 45), at(addDays(TODAY, -4), 5, 40)];
  const days = [0, 1, 3, 4].map((d) => at(addDays(TODAY, d), 8, 300));
  return { sessions: [...before, ...days], today: addDays(TODAY, 4) };
}

function spikeTip(objectives: Objective[], log = onTheTrip()) {
  const state = deriveClimberState(log.sessions, { today: log.today });
  const tips = buildTips({ state, sessions: log.sessions, objectives, today: log.today });
  return { state, tip: tips.find((t) => t.id === 'load-spike') };
}

describe('the spike, on a trip and at home', () => {
  it('is a real danger-zone spike either way, not a fixture', () => {
    const { state } = spikeTip([]);
    expect(state.load.zone).toBe('danger');
    expect(state.load.acwr!).toBeGreaterThan(2);
  });

  /**
   * The proposal asked for one clause beside `inPlannedDeload` — silence.
   * This is the claim that it would have been wrong: a trip is where the
   * pattern usually lands, so the warning stays, at the same weight, under
   * the same headline.
   */
  it('still warns, at the same weight and headline as at home', () => {
    const away = spikeTip([trip()]).tip;
    const home = spikeTip([]).tip;
    expect(away, 'the trip silenced the spike').toBeTruthy();
    expect(away!.weight).toBe(home!.weight);
    expect(away!.headline).toBe(home!.headline);
    expect(away!.tone).toBe(home!.tone);
    expect(away!.id).toBe(home!.id);
  });

  it('quotes the same ratio it would at home', () => {
    const { state } = spikeTip([]);
    const ratio = state.load.acwr!.toFixed(2);
    expect(spikeTip([trip()]).tip!.body).toContain(`${ratio}×`);
  });

  /**
   * The actual defect: *"An easier week now costs a week"* and *Plan the
   * week → /calendar* are two things a climber four days into nine cannot
   * do. Both go, and what replaces them is the part of a trip still open to
   * choose.
   */
  it('drops the advice a climber on a trip cannot take', () => {
    const away = spikeTip([trip()]).tip!;
    expect(away.body).not.toMatch(/an easier week/i);
    expect(away.action, 'plan the week, from a campsite').toBeUndefined();
    expect(spikeTip([]).tip!.action).toEqual({ label: 'Plan the week', href: '/calendar' });
  });

  it('gives advice that fits the days that are left', () => {
    const body = spikeTip([trip()]).tip!.body;
    expect(body).toMatch(/rest day between the hard ones/);
    expect(body).toMatch(/skin/);
  });

  /**
   * It names the trip. That is what makes a wrong reading cheap: a climber
   * whose trip was cancelled sees which fact the app has wrong, and the
   * warning underneath it never went anywhere.
   */
  it('names the trip, so a wrong guess is visible and correctable', () => {
    expect(spikeTip([trip({ name: 'Magic Wood' })]).tip!.body).toContain('Magic Wood');
  });

  /**
   * And says the taper's part in the number, which is the app's own doing:
   * the taper takes the baseline down while the days on take the load up,
   * so peaking for a trip raises the ratio the app then alarms at.
   */
  it('owns the taper\'s share of the number', () => {
    expect(spikeTip([trip()]).tip!.body).toMatch(/taper took the baseline down/);
  });

  it('says nothing about a trip when there is no trip', () => {
    const home = spikeTip([]).tip!;
    expect(home.body).not.toMatch(/trip|taper|skin/i);
  });

  /**
   * Dismissing a spike at home must not hide one on a trip. The signature is
   * the triggering fact at its magnitude, and these are different facts.
   */
  it('signs a trip spike differently from one at home', () => {
    const away = spikeTip([trip()]).tip!;
    const home = spikeTip([]).tip!;
    expect(away.signature).not.toBe(home.signature);
    expect(away.signature).toContain('obj-trip');
  });

  it('signs two different trips differently', () => {
    const a = spikeTip([trip({ id: 'obj-a' })]).tip!;
    const b = spikeTip([trip({ id: 'obj-b' })]).tip!;
    expect(a.signature).not.toBe(b.signature);
  });
});

describe('the caution band, which on a trip means the opposite', () => {
  /** One hard day off a steady base: 1.3–1.5, the ramping-quickly band. */
  const gentle = () => ({ sessions: [...steady(90, 1), at(TODAY, 8, 150)], today: TODAY });

  it('is a real caution-zone reading', () => {
    expect(spikeTip([], gentle()).state.load.zone).toBe('caution');
  });

  it('reads a gentle trip as gentle rather than as a new baseline to hold', () => {
    const away = spikeTip([trip()], gentle()).tip!;
    expect(away.headline).toBe('Ramping quickly');
    expect(away.body).toMatch(/gentle start/);
    // "Holding here becomes the new baseline" is advice about a level you
    // keep. A trip ends, so there is nothing to make a baseline of.
    expect(away.body).not.toMatch(/new baseline safely/);
    expect(away.action).toBeUndefined();
  });

  it('leaves the same reading alone at home', () => {
    const home = spikeTip([], gentle()).tip!;
    expect(home.body).toMatch(/new baseline safely/);
    expect(home.action).toEqual({ label: 'Plan the week', href: '/calendar' });
  });
});

describe('what a trip does not change', () => {
  /** An optimal ratio is not a tip, trip or no trip. */
  it('does not invent a spike that is not there', () => {
    const log = { sessions: steady(90, 0), today: TODAY };
    expect(spikeTip([trip()], log).state.load.zone).toBe('optimal');
    expect(spikeTip([trip()], log).tip).toBeUndefined();
  });

  /**
   * A deload still silences it. The two readings are different — a deload's
   * ratio moves down and nothing is at risk while it does — and a trip must
   * not have quietly taken over the suppression that belongs to a deload.
   */
  it('leaves the deload suppression exactly where it was', () => {
    const log = onTheTrip();
    const state = deriveClimberState(log.sessions, { today: log.today });
    const deloading = { ...state, load: { ...state.load, inPlannedDeload: true } };
    for (const objectives of [[], [trip()]]) {
      const tips = buildTips({ state: deloading, sessions: log.sessions, objectives, today: log.today });
      expect(tips.find((t) => t.id === 'load-spike')).toBeUndefined();
    }
  });
});
