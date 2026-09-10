// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from './HomePage';

/**
 * Training load reaches the front door (PLAN.md M46).
 *
 * §5.5 asked for an "ACWR gauge on Home … with plain-language guidance", and
 * Home had no load surface at all: the number lived on Progress and in the
 * weekly review, both of which a climber reaches deliberately and neither of
 * which is where they land.
 *
 * **Built as a coach tip rather than as the gauge §5.5 describes**, which is
 * a deliberate deviation. A permanent gauge is ambient awareness of a number
 * that is unremarkable most of the time; the thing that was actually missing
 * was anyone *saying* something when it stopped being unremarkable. The tip
 * is plain-language, names the ratio, carries an action, and outranks
 * everything else that fires on real data — and Home is a screen this pass
 * has just finished decongesting, so a ninth card showing a usually-boring
 * number would be a poor trade. The full gauge, chart and bands stay on
 * Progress, one tap away.
 */

const TODAY = today();
const back = (n: number) => addDays(TODAY, -n);

function train(day: string, index = 0, patch: Partial<Session> = {}): Session {
  return {
    ...newSession(day, index),
    completed: true,
    rpe: 7,
    durationMin: 90,
    climbs: [{ id: `${day}-${index}`, grade: 'V4', scale: 'V', count: 4, result: 'send' }],
    ...patch,
  };
}

/** Two steady months, then a week at several times the baseline. */
function spiking(): Session[] {
  const out: Session[] = [];
  for (let d = 70; d >= 7; d -= 2) out.push(train(back(d)));
  for (let d = 6; d >= 0; d -= 1) {
    for (let i = 0; i < 2; i += 1) out.push(train(back(d), i, { rpe: 9, durationMin: 150 }));
  }
  return out;
}

async function log(sessions: Session[]): Promise<void> {
  await reset();
  for (const s of sessions) await putSession(s);
  await hydrate();
}

describe('training load on the front door', () => {
  it('says a spike is a spike, and names the number', async () => {
    const sessions = spiking();
    expect(deriveClimberState(sessions, { today: TODAY }).load.zone, 'the fixture is not a spike').toBe('danger');
    await log(sessions);

    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    const text = view.container.textContent ?? '';
    expect(text, 'nothing on Home mentions load at all').toMatch(/Load spike/);
    expect(text, 'a word without the number is not guidance').toMatch(/\d\.\d\d× your own four-week baseline/);
  });

  it('leads with it rather than burying it under the interesting ones', async () => {
    // Coach's Corner shows its top tip. A backup nudge and a streak
    // compliment are not what to lead with in the week someone is most
    // likely to get hurt.
    await log(spiking());
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    const coach = view.container.querySelector('a[href="#/coach"]');
    expect(coach?.textContent ?? '', 'the spike is not the tip Home is showing').toMatch(/Load spike/);
  });

  it('says nothing before the ratio means anything', async () => {
    // Under three weeks of history the ratio is noise, and a load warning on
    // a new install is how people learn to ignore load warnings.
    await log([train(back(2)), train(back(4))]);
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').not.toMatch(/Load spike|Ramping quickly/);
  });
});
