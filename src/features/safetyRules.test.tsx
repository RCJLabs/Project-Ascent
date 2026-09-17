// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { loadPrograms } from '@/content/programs';
import { DRILLS } from '@/content/drills';
import { PROTOCOLS } from '@/content/protocols';
import { partsNamedIn } from '@/engine/bodyLoad';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';

/**
 * Five safety rules the app was told and never read (PLAN.md M153).
 *
 * `Protocol.safety` carries seven rules across five protocols, including
 * *"Never campus with any existing finger or elbow symptom"*, and nothing in
 * the app had ever rendered the field.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** An elbow the climber has told the app about. */
const HURT_ELBOW = [{ part: 'elbow', since: TODAY, severity: 'niggle' }];

/**
 * Why the drill page is not a surface for this, written down.
 *
 * The first build put the protocol's definition and its rules on
 * `DrillPage` too, and looking at the render killed it: every one of the
 * eleven drills that names a protocol names **ARCing**, whose description
 * and whose single rule are already in the drill's own paragraph and in its
 * cues, word for word. Two more cards saying it a third time made the page
 * worse.
 *
 * That is a claim about the catalogue, so the catalogue holds it. If a drill
 * ever names a protocol whose rules say something its own text does not —
 * anything but ARCing — this fails and points back here.
 */
/**
 * Iron Grip's Finger Protocol, open in the logger, in week nine.
 *
 * The campus block lives in the Spark phase (weeks 9-12) of the
 * `finger_protocol` block and only on the `board` track — which is the
 * point: the three campus exercises are the highest-risk lines in the
 * catalogue and they sit behind two conditions.
 */
async function logger(injuries: unknown[] = []) {
  const start = startOfWeek(addDays(TODAY, -56));
  await putSession({
    ...newSession(TODAY, 0, { completed: false }),
    programId: 'iron_grip',
    sessionTypeId: 'fp',
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: start },
    plans: { iron_grip: { [dayOfWeek(TODAY)]: 'fp' } },
    weekOverrides: {},
    adaptations: {},
    tracks: { iron_grip: 'board' },
    injuries: injuries as never,
  });
  renderAt('/', <DayBody date={TODAY} />);
}

describe('why the rules live in the logger and not on the drill page', () => {
  it('has ARCing as the only protocol any drill names', () => {
    const named = [...new Set(DRILLS.map((d) => d.protocolId).filter((id): id is string => !!id))];
    expect(named).toEqual(['arcing']);
  });

  it('has that one rule restate a cue the page already renders', () => {
    // `DrillPage` has rendered `protocol.cues` since M107b, so every one of
    // the eleven already carries this — and the rule names no body part, so
    // nothing about the climber could ever raise it above the cue.
    const arcing = PROTOCOLS['arcing']!;
    expect(arcing.safety).toHaveLength(1);
    expect(partsNamedIn(arcing.safety![0]!)).toEqual([]);
    expect(arcing.safety![0]).toMatch(/pump/i);
    expect(arcing.cues.filter((cue) => /pump/i.test(cue)).length).toBeGreaterThan(0);
  });
});

describe('the logger, where the climber is about to pull on', () => {
  it('shows every rule on the protocol, not the worst one', async () => {
    await logger();
    expect(await screen.findByText(/The highest injury-risk protocol in any program here/)).toBeTruthy();
    expect(screen.getByText(/Miss a rung twice in a row/)).toBeTruthy();
    expect(screen.getByText(/Never campus with any existing finger or elbow symptom/)).toBeTruthy();
  });

  it('puts the rule about this climber first and in bold', async () => {
    await logger(HURT_ELBOW);
    const rules = [...(await screen.findByText('Campus Laddering — safety')).parentElement!
      .querySelectorAll('li')].map((li) => li.textContent);
    expect(rules[0]).toMatch(/Never campus with any existing finger or elbow symptom/);
    expect(rules).toHaveLength(3);
  });

  /** The row for one exercise, which is the `li` its checkbox sits in. */
  const row = (name: string): HTMLElement =>
    screen.getByText(`Mark ${name} done`).closest('li') as HTMLElement;

  /**
   * The rule this milestone adds to the row's "one warning a line" order:
   * an authored instruction about the climber's own injury outranks the
   * keyword scan's guess about the same injury.
   *
   * Scoped to the campus rows on purpose. Two exercises elsewhere in the
   * day — Explosive Pull-Ups and Push-Ups — say the word "campus" in their
   * notes and are flagged for it, which is the over-flagging `bodyLoad.ts`
   * declares in its own header and does not stop being correct here.
   */
  it('drops the derived flag on the lines the author already spoke about', async () => {
    await logger(HURT_ELBOW);
    await screen.findByText(/Never campus with any existing finger or elbow symptom/);
    for (const name of ['Campus Laddering', 'Campus Skips', 'Campus Double Dynos']) {
      expect(row(name).textContent, name).not.toMatch(/Loads your/);
    }
  });

  it('keeps the derived flag where no rule speaks to the injury', async () => {
    // Campus loads the shoulder and none of its three rules mentions one,
    // so the author has not spoken to this climber and the scan is the only
    // thing that has. The rules are still shown; they are just not hers.
    await logger([{ part: 'shoulder', since: TODAY, severity: 'niggle' }]);
    await screen.findByText(/The highest injury-risk protocol/);
    expect(row('Campus Laddering').textContent).toMatch(/Loads your shoulder/);
  });

  it('says the rules once for the method, not once for each line', async () => {
    await logger();
    // Three campus exercises, one campus safety note.
    expect(screen.getAllByText(/Miss a rung twice in a row/)).toHaveLength(1);
    expect(screen.getByText('Mark Campus Skips done')).toBeTruthy();
    expect(screen.getByText('Mark Campus Double Dynos done')).toBeTruthy();
  });

  it('names the method the rules belong to', async () => {
    await logger();
    expect(await screen.findByText('Campus Laddering — safety')).toBeTruthy();
  });
});
