/**
 * Lead against top-rope, which nothing read until now (PLAN.md M133).
 *
 * M108 asked two questions of a climb and built an engine for one of them.
 * `angle` got `angles.ts`, a Progress card and a sentence that refuses to
 * call a gap a weakness. `ropeStyle` got a chip in the logger, a field on
 * `Climb`, a doc comment saying *"the same route is a different climb on
 * each"* — and no reader at all. It was typed, stored, and never once asked
 * a question of.
 *
 * For a route climber it is the difference that defines the ascent. A 5.12
 * on top-rope is a 5.12 you have done the moves on; the same grade led is a
 * different achievement, and a climber whose hardest is on a top-rope has a
 * lead ceiling somewhere below it that nothing in the app could see.
 *
 * ## The same three rules `angles.ts` follows, for the same reasons
 *
 * **Nothing is inferred.** An absent `ropeStyle` is a climb logged by
 * someone who did not answer, not a top-rope. Every log written before M108
 * is entirely absent, and most written since.
 *
 * **Coverage first.** How many of the climbs on this ladder say which, before
 * anything at all about the split of them.
 *
 * **The gap is a fact and not a verdict.** Leading is a skill with its own
 * fear in it, and there are real reasons a log is all top-rope — an autobelay
 * gym, a partner who does not lead, a shoulder. The app states the two
 * numbers and the rungs between them, and says nothing about which of them
 * is the problem.
 *
 * Routes only. Rope style is a question about a rope, the logger only offers
 * the chips on the YDS ladder, and a boulder that carries one is a typo.
 *
 * Pure: sessions in, a reading out.
 */

import type { Climb, RopeStyle, Session } from '@/db/sessions';
import { addClimb, emptyTally, type GradeTally } from './derive';
import { DEFAULT_DISPLAY, displayGrade, gradeOrdinal, type GradeDisplay } from './grades';

/** Lead first: it is the harder question and the one a climber sorts on. */
export const ROPE_ORDER: RopeStyle[] = ['lead', 'toprope'];

export const ROPE_LABEL: Record<RopeStyle, string> = {
  lead: 'Lead',
  toprope: 'Top-rope',
};

/** Routes carrying a rope style before any of this is worth reading. */
export const ENOUGH_ROUTES = 8;

export interface RopeSide {
  style: RopeStyle;
  tally: GradeTally;
}

export interface RopeSplit {
  /** Only the styles actually logged, lead first. */
  sides: RopeSide[];
  /** Routes that say which. */
  said: number;
  /** Routes in total, so coverage can be honest. */
  total: number;
  /** True until enough routes say which for the split to mean anything. */
  thin: boolean;
}

export function ropeSplit(sessions: readonly Session[]): RopeSplit {
  const tallies = new Map<RopeStyle, GradeTally>();
  let said = 0;
  let total = 0;

  for (const session of sessions) {
    if (!session.completed) continue;
    for (const climb of (session.climbs ?? []) as Climb[]) {
      if (climb.scale !== 'YDS') continue;
      total += climb.count;
      if (climb.ropeStyle === undefined) continue;
      said += climb.count;
      const tally = tallies.get(climb.ropeStyle) ?? emptyTally();
      addClimb(tally, climb);
      tallies.set(climb.ropeStyle, tally);
    }
  }

  return {
    sides: ROPE_ORDER.filter((s) => tallies.has(s)).map((s) => ({ style: s, tally: tallies.get(s)! })),
    said,
    total,
    thin: said < ENOUGH_ROUTES,
  };
}

/** The side, if it is there and has a send on it. */
function best(split: RopeSplit, style: RopeStyle): string | null {
  return split.sides.find((s) => s.style === style)?.tally.best ?? null;
}

/**
 * The split, in a sentence, or nothing.
 *
 * Coverage first. Then the two ceilings and the rungs between them — and no
 * word about which of them is the problem.
 */
export function describeRopeSplit(
  split: RopeSplit,
  display: GradeDisplay = DEFAULT_DISPLAY,
): string | null {
  if (split.said === 0) return null;
  // The noun and the verb that follows it, both (PLAN.md M262). `said === 0`
  // is the only guard here, so a climber with a single tagged route read
  // *“1 of your 1 routes say whether…”*. The rung count at the foot of this
  // function has agreed with itself since it was written.
  const coverage = `${split.said} of your ${split.total} ${
    split.total === 1 ? 'route says' : 'routes say'
  } whether they were led or top-roped`;
  if (split.thin) {
    return `${coverage}. Not enough yet to read a split from — tag a few more and this will say something.`;
  }

  const lead = best(split, 'lead');
  const rope = best(split, 'toprope');
  const show = (grade: string) => displayGrade('YDS', grade, display);

  if (lead === null && rope === null) return `${coverage}, and none of them were sent.`;
  if (rope === null) return `${coverage}. Every send is led, hardest ${show(lead!)}.`;
  if (lead === null) {
    return `${coverage}. Every send is on a top-rope, hardest ${show(rope)} — nothing in the log has been led.`;
  }

  const gap = gradeOrdinal('YDS', rope) - gradeOrdinal('YDS', lead);
  const both = `${show(lead)} led, ${show(rope)} top-roped`;
  if (gap === 0) return `${coverage}. ${both} — the same grade either way.`;
  if (gap < 0) return `${coverage}. ${both}, so the hardest thing you have done, you led.`;
  return `${coverage}. ${both} — ${gap} ${gap === 1 ? 'rung' : 'rungs'} between them. What that is worth is yours to judge: leading has its own fear in it, and a log with no leads in it is as likely to be a gym with no lead wall.`;
}

/**
 * Whether the split is about leading, or about the company (PLAN.md M276).
 *
 * The sentence above ends by refusing to say which: *"leading has its own
 * fear in it, and a log with no leads in it is as likely to be a gym with no
 * lead wall."* The header names three reasons a log is all top-rope — an
 * autobelay gym, **a partner who does not lead**, a shoulder — and `partners.ts`
 * quotes that line back and says the app *"then says nothing, because it has
 * no way to know."*
 *
 * M237 gave the log partners. The way to know has existed since, and nothing
 * joined the two.
 *
 * ## What this deliberately does not do
 *
 * `partners.ts` sets the rule and it is load-bearing: *"It reports and never
 * scores. How often you climb with someone is a fact about your log; who you
 * climb **best** with is a judgement about a person who is not here to answer
 * it."* A per-partner lead rate — *with Alex you lead, with Sam you never do*
 * — is exactly that judgement, about somebody who never installed this app and
 * was never asked.
 *
 * **So this names nobody, and counts nobody.** It reports one property of the
 * climber's own log: whether the two sides of the split fall in the same
 * sessions or in different ones, and whether that lines up with the sessions
 * they filled the partner field on. The climber can see who from their own
 * data. The app does not say it.
 *
 * ## An empty field is an empty field
 *
 * The rule `partners.ts` states and this follows: a session naming nobody is
 * *"a field nobody filled"*, not a session climbed alone — and most sessions
 * in every log will be exactly that. So the partner half only speaks when the
 * log holds both kinds of session, and the sentence says which fact it is
 * built on rather than implying solitude.
 */

/** Sessions carrying a tagged route, before the company is worth reading. */
export const ENOUGH_ROPE_SESSIONS = 6;

/**
 * Sessions naming somebody before their absence means anything.
 *
 * Three, because one or two is a climber who tried the field once. Below it
 * the named sessions are a sample rather than a pattern, and the *unnamed*
 * ones are the whole log.
 */
export const ENOUGH_NAMED = 3;

export interface RopeContext {
  /** Sessions carrying at least one tagged route. */
  sessions: number;
  /** Of those, sessions carrying both styles at once. */
  mixed: number;
  /** Of those, sessions that named somebody. */
  named: number;
  /** Tagged lead routes in total, and how many were on a named session. */
  led: number;
  ledNamed: number;
  /** The same for top-rope. */
  roped: number;
  ropedNamed: number;
}

export function ropeContext(sessions: readonly Session[]): RopeContext {
  const out: RopeContext = {
    sessions: 0,
    mixed: 0,
    named: 0,
    led: 0,
    ledNamed: 0,
    roped: 0,
    ropedNamed: 0,
  };

  for (const session of sessions) {
    if (!session.completed) continue;
    let lead = 0;
    let toprope = 0;
    for (const climb of (session.climbs ?? []) as Climb[]) {
      if (climb.scale !== 'YDS') continue;
      if (climb.ropeStyle === 'lead') lead += climb.count;
      else if (climb.ropeStyle === 'toprope') toprope += climb.count;
    }
    if (lead === 0 && toprope === 0) continue;

    // Named on the session, which is where the field lives: `partners.ts`
    // settled that at M237 — per-climb would be twenty fields on a bouldering
    // session and nobody would fill one.
    const named = (session.partners ?? []).length > 0;
    out.sessions += 1;
    if (lead > 0 && toprope > 0) out.mixed += 1;
    if (named) out.named += 1;
    out.led += lead;
    out.roped += toprope;
    if (named) {
      out.ledNamed += lead;
      out.ropedNamed += toprope;
    }
  }

  return out;
}

/**
 * The context, in a sentence, or nothing.
 *
 * Follows the same order the split above does: it speaks only where the log
 * supports it, and every clause is a fact about the log rather than a verdict
 * about the climber or anyone else.
 */
export function describeRopeContext(split: RopeSplit, context: RopeContext): string | null {
  // Nothing to explain unless there is a split to explain. One style, or too
  // few tagged routes, and the sentence above has already said so.
  if (split.thin || split.sides.length < 2) return null;
  if (context.sessions < ENOUGH_ROPE_SESSIONS) return null;

  /**
   * Both styles inside one session rules the circumstances out for it.
   *
   * You cannot have led and top-roped on the same afternoon at a gym with no
   * lead wall, or with a partner who will not belay a lead. So a log that
   * mixes them is a log where the split is a choice made route by route, and
   * that is worth saying on its own — it is the one reading here that needs no
   * partner field at all.
   */
  if (context.mixed > 0) {
    return `You have led and top-roped in the same session ${context.mixed} ${
      context.mixed === 1 ? 'time' : 'times'
    }, so at least some of this split is a choice you make route by route rather than a matter of where you were or who you were with.`;
  }

  const separated =
    'Every session in your log is all lead or all top-rope — the two sides never appear together.';

  /**
   * The partner half. Enough named sessions for their absence elsewhere to be
   * a pattern rather than a gap in the habit.
   *
   * **One condition, where the draft had two.** The second was `named <
   * sessions` — both kinds of session present, so the field distinguishes
   * something — and the battery showed it could never fire. If every session
   * is named then `ledNamed === led` and `ropedNamed === roped`, and the
   * total line-up below needs one of those to be zero, which needs one of the
   * two styles to be absent, which the `sides.length < 2` guard has already
   * returned on. The totality test does the work by itself.
   *
   * That is the shape M143, M158, M167, M178 and M185 each found: a guard
   * spelling out a condition an earlier one already made impossible.
   */
  if (context.named < ENOUGH_NAMED) return separated;

  const ledUnnamed = context.led - context.ledNamed;
  const ropedUnnamed = context.roped - context.ropedNamed;

  // Stated only where it is total, which is what makes it a fact rather than a
  // correlation: a rate per side would be the scoring `partners.ts` refuses.
  const leadIsNamed = context.led > 0 && ledUnnamed === 0 && context.ropedNamed === 0;
  const leadIsUnnamed = context.led > 0 && context.ledNamed === 0 && ropedUnnamed === 0;
  if (!leadIsNamed && !leadIsUnnamed) return separated;

  const which = leadIsNamed
    ? 'every route you led was on a session you named somebody on, and none of your top-rope routes were'
    : 'none of the routes you led were on a session you named somebody on, and all of your top-rope routes were';

  return `${separated} And ${which}. That is the partner field and not a record of who was there — a session naming nobody is one where nothing was typed, not one climbed alone — but it does mean the split lines up with something other than the climbing.`;
}
