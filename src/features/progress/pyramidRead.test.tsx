// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Climb, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useSettings } from '@/store/settings';
import { ProgressPage } from './ProgressPage';

/**
 * The reading is where the drawing is (PLAN.md M165).
 *
 * `engine/pyramidShape.test.ts` holds the rule. This holds it to the screen,
 * which four milestones this session have now shipped a battery survivor for:
 * a reading that is imported and never rendered passes every name-based test
 * while the climber sees the same silent bars they always did.
 */

const DAY = today();

const send = (grade: string, i: number): Climb => ({
  id: `c${grade}-${i}`,
  scale: 'V',
  grade,
  style: 'redpoint',
  result: 'send',
  count: 1,
} as Climb);

/** A log whose pyramid has the shape asked for: grade → number of sends. */
async function logWith(shape: [string, number][], mode: 'indoor' | 'outdoor' = 'indoor'): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  let day = 0;
  for (const [grade, count] of shape) {
    const climbs: Climb[] = [];
    for (let i = 0; i < count; i += 1) climbs.push(send(grade, i));
    const session: Session = {
      ...newSession(addDays(DAY, -(day + 1)), 0),
      completed: true,
      rpe: 7,
      durationMin: 90,
      mode,
      climbs,
    };
    await putSession(session);
    day += 1;
  }
  await hydrate();
  useSettings.setState({ progressView: 'grades' });
}

const body = () => document.body.textContent ?? '';

async function open(): Promise<void> {
  renderAt('/progress', <ProgressPage />);
  await screen.findByText('Grade pyramid');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the pyramid card, which now reads itself', () => {
  it('says what the shape shows when it is upside down', async () => {
    await logWith([['V6', 12], ['V5', 4], ['V4', 30]]);
    await open();
    expect(body(), 'the bars are drawn and still say nothing').toMatch(
      /12 sends at V6 and 4 at V5/,
    );
    expect(body()).toMatch(/the pyramid the other way up/);
  });

  it('names both readings, and calls neither of them a weakness', async () => {
    await logWith([['V6', 12], ['V5', 4], ['V4', 30]]);
    await open();
    expect(body()).toMatch(/moved past before consolidating/);
    expect(body()).toMatch(/stopped writing down/);
    expect(body()).toMatch(/only you know which/);
    expect(body()).not.toMatch(/\bweakness\b/i);
  });

  it('still draws the bars and keeps the line that was always under them', async () => {
    await logWith([['V6', 12], ['V5', 4], ['V4', 30]]);
    await open();
    expect(body()).toMatch(/Every grade you have touched, hardest first/);
  });

  it('says nothing about an ordinary pyramid', async () => {
    await logWith([['V6', 3], ['V5', 12], ['V4', 30]]);
    await open();
    expect(body()).toMatch(/Every grade you have touched/);
    expect(body()).not.toMatch(/the pyramid the other way up/);
  });

  it('says nothing about a log too small to have a shape', async () => {
    await logWith([['V5', 8], ['V4', 2]]);
    await open();
    expect(body()).not.toMatch(/the pyramid the other way up/);
  });
});

describe('and reads the ladder the climber is looking at', () => {
  /**
   * M106 drew two pyramids and a toggle between them. A reading taken from
   * the all-time tally while the climber is looking at their outdoor bars
   * would be a sentence about a different chart — which is the bug this test
   * exists to prevent rather than one it found.
   */
  it('changes with the indoor and outdoor toggle', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await loadPrograms();
    // Indoors: a clean pyramid. On rock: inverted. Together: clean.
    const write = async (grade: string, count: number, mode: 'indoor' | 'outdoor', day: number) => {
      const climbs: Climb[] = [];
      for (let i = 0; i < count; i += 1) climbs.push(send(grade, i));
      await putSession({
        ...newSession(addDays(DAY, -day), 0),
        completed: true, rpe: 7, durationMin: 90, mode, climbs,
      });
    };
    await write('V6', 4, 'indoor', 1);
    await write('V5', 30, 'indoor', 2);
    await write('V4', 40, 'indoor', 3);
    await write('V6', 6, 'outdoor', 4);
    await write('V5', 1, 'outdoor', 5);
    await write('V4', 20, 'outdoor', 6);
    await hydrate();
    useSettings.setState({ progressView: 'grades' });
    await open();

    // Everything: the indoor base swamps it, so there is nothing to say.
    expect(body()).not.toMatch(/the pyramid the other way up/);

    fireEvent.click(screen.getByRole('button', { name: 'On rock' }));
    expect(body(), 'the outdoor ladder is inverted and the card is silent').toMatch(
      /6 sends at V6 and 1 at V5/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Indoors' }));
    expect(body()).not.toMatch(/the pyramid the other way up/);
  });

  /**
   * And it counts the ladder it is reading, not the log.
   *
   * A climber with a full indoor season and four days on rock has plenty of
   * sends all told and almost none outdoors — so the floor has to be applied
   * to the tally on screen. Reading the all-time total instead passes every
   * other test in this file, because every other fixture clears the floor on
   * both sides, and reports a shape from five sends.
   */
  it('applies the floor to the ladder on screen, not to the whole log', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await loadPrograms();
    const write = async (grade: string, count: number, mode: 'indoor' | 'outdoor', day: number) => {
      const climbs: Climb[] = [];
      for (let i = 0; i < count; i += 1) climbs.push(send(grade, i));
      await putSession({
        ...newSession(addDays(DAY, -day), 0),
        completed: true, rpe: 7, durationMin: 90, mode, climbs,
      });
    };
    // A big indoor log, and five sends on rock in an inverted shape.
    await write('V5', 60, 'indoor', 1);
    await write('V4', 80, 'indoor', 2);
    await write('V6', 4, 'outdoor', 3);
    await write('V5', 1, 'outdoor', 4);
    await hydrate();
    useSettings.setState({ progressView: 'grades' });
    await open();

    fireEvent.click(screen.getByRole('button', { name: 'On rock' }));
    expect(body(), 'five sends on rock is not a pyramid').not.toMatch(
      /the pyramid the other way up/,
    );
  });
});
