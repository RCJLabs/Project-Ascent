/**
 * What counts as a rest day (PLAN.md M112e).
 *
 * One definition, because there were **thirteen**. Two exported under
 * different names — `templates.isRestSession` and `sessionEdit.isRest` —
 * and eleven more written out by hand across `derive`, `review`, `economy`,
 * `coach`, `challenges`, `yearReview`, `xp`, `achievements` and `exportCsv`.
 * Nothing had drifted yet, which is the only reason this is tidying rather
 * than a bug hunt; the point is that the fourteenth copy cannot.
 *
 * It lives in its own file rather than in `templates.ts`, where five modules
 * were already importing it from. That module owns session templates and
 * merely defined this first, and `import { isRestSession } from './templates'`
 * in the XP engine is a line that makes a reader stop and check why.
 *
 * ## The rule
 *
 * A rest day is a session that carries a recovery checklist and no climbs.
 * Both halves matter: the checklist is what the climber filled in to say the
 * day was rest, and the climbs are what would contradict them.
 *
 * ## Two questions, not one (PLAN.md M191)
 *
 * This one is about the **record**: does this session count as a rest day
 * for the stats? `startedAsRest` below is about the **intent**, and the
 * logger asks that one — which editor to show. They are close enough to
 * look like a duplicate and they are not: adding a climb to a rest day
 * stops it counting, and must not swap the editor out from under the
 * climber mid-edit.
 *
 * Both live here so the difference is written down once, in the file named
 * after the question. The logger used to ask a third thing — `type?.isRest`,
 * the *plan* — and a climber with no program therefore had no way to log a
 * rest day at all, while the coach told them they never had.
 *
 * ## Why it tolerates a missing `climbs`
 *
 * `Session.climbs` is typed `Climb[]` and is not optional, so this guard
 * should be unreachable. It is not: M105b found that the spreadsheet writers
 * crashed on real records with no `climbs` array at all — a backup from an
 * older schema, or a row that came in through an import. `exportCsv.ts` was
 * the one copy of thirteen that knew, and defended itself with `listOf`. A
 * single definition means every reader gets that defence rather than the one
 * that happened to be written last.
 */

import type { Session } from '@/db/sessions';

export function isRestSession(session: Pick<Session, 'restChecklist' | 'climbs'>): boolean {
  if (session.restChecklist === undefined) return false;
  return !Array.isArray(session.climbs) || session.climbs.length === 0;
}

/**
 * What the climber set out to log, which is a different question.
 *
 * The checklist alone: a session started as a rest day keeps its rest
 * editor even once a boulder finds its way onto it, and `isRestSession`
 * above independently stops counting it. A logger that swapped its whole
 * layout on the first logged climb would be answering the stats' question
 * rather than the climber's.
 */
export function startedAsRest(session: Pick<Session, 'restChecklist'>): boolean {
  return session.restChecklist !== undefined;
}
