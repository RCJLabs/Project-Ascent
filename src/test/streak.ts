import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';

/**
 * A log whose record is ahead of the streak being run (PLAN.md M299).
 *
 * `skillsRow.test.tsx` and `standing.test.tsx` each held their own copy of
 * this, and both copies put the week back on **this** week, on the Sunday,
 * the Tuesday and the Thursday of it:
 *
 * ```ts
 * for (const d of [0, 2, 4]) {
 *   const date = addDays(THIS_WEEK, d);
 *   if (date <= TODAY) await put(date);
 * }
 * ```
 *
 * A calendar week here begins on Sunday, so that guard drops the Tuesday
 * and the Thursday on any day before Thursday — the week back on has one
 * session in it, `deriveStreak` wants three, and the streak the tests are
 * about is nought. The fixture only built the log it describes on a
 * Thursday, a Friday or a Saturday, which is three days in seven that the
 * two files agreed with their own comments.
 *
 * The week back on is the week **just gone** instead, which is whole on
 * every day of the week. `deriveStreak` never counts the current week
 * against a climber — it is still in progress — so a full week behind it
 * still reads as one week on, and the numbers the tests pin (one week run,
 * eight on record) are the numbers they always meant.
 */

let counter = 0;

/**
 * Eight weeks of three sessions, two months off, then last week back on.
 *
 * Returns what it wrote, so a test can hand the same sessions to
 * `deriveClimberState` and check the fixture before reading a page built
 * from it.
 */
export async function brokenStreak(): Promise<Session[]> {
  const thisWeek = startOfWeek(today());
  const written: Session[] = [];
  const put = async (date: string) => {
    const session = newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60 });
    written.push(session);
    await putSession(session);
  };
  for (let w = 20; w >= 13; w--) {
    for (const d of [0, 2, 4]) await put(addDays(thisWeek, -7 * w + d));
  }
  for (const d of [0, 2, 4]) await put(addDays(thisWeek, -7 + d));
  return written;
}
