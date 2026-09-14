/**
 * What a coach would say about a program, not what a parser would
 * (PLAN.md M167).
 *
 * `contentIssues` is a thorough structural validator: empty blocks, unnamed
 * blocks, a circuit with no rounds, a block folded into itself, a step
 * numbered past its phase, an exercise on a track the program does not have.
 * **Not one of its checks is about training.** So the app would help a
 * climber author a block it would refuse to schedule for them — a finger
 * session every day, no rest day in the week, no deload in twelve weeks —
 * and the same app that warns about a campus board in the logger (M153) and
 * about the 48-hour gap outside a block (M160) said nothing while the
 * program was being written.
 *
 * ## Every rule here is the catalogue's own practice, not an opinion
 *
 * A builder that lectured would be worse than one that stayed quiet, so each
 * check below is a thing **all eleven shipped programs do** — measured, and
 * held there by tests in `programSafety.test.ts`. The one number the
 * catalogue does not settle is `DELOAD_FROM_WEEKS`, and it says so.
 *
 * ## Warnings, never errors
 *
 * `canRun` keys on `level === 'error'`, and none of these are errors. A
 * coach writing a deliberately brutal four-week block for themselves is
 * allowed to; the app's job is to be sure they meant it. `returnToClimbing`
 * sets the house rule and it holds here: say what is unusual and why, and
 * prescribe nothing.
 */

import type { Program, SessionType } from '@/content/types';
import type { Issue } from './customProgram';
import { FINGER_GAP_HOURS, directFingerWork } from './fingerGap';
import { joinList } from './phrase';

/**
 * Blocks at or beyond this length carry a deload in every program the app
 * ships — and the app ships none between four weeks and twelve.
 *
 * So this number is a judgement rather than a measurement: twelve is proven
 * and four is proven the other way, and eight is where this milestone draws
 * the line between them. Named and stated rather than buried, because it is
 * the one rule here that a coach could reasonably disagree with.
 */
export const DELOAD_FROM_WEEKS = 8;

/** Sessions a week that leaves no day off. The catalogue's busiest asks five. */
export const NO_REST_DAY_AT = 7;

/** Everything a session type says about itself, for the load scan. */
export function sessionTypeText(type: SessionType): string {
  const blocks = type.blocks ?? [];
  return [
    type.name,
    type.description ?? '',
    ...blocks.flatMap((block) => [
      block.name,
      ...Object.values(block.perPhase).flatMap((phase) => [
        ...(phase?.exercises ?? []).map((exercise) => exercise.name),
        phase?.rationale ?? '',
      ]),
    ]),
  ].join(' ');
}

/** The session types in a program that load the fingers directly. */
export function fingerTypes(program: Program): SessionType[] {
  return program.sessionTypes.filter(
    (type) => type.isRest !== true && directFingerWork(sessionTypeText(type)),
  );
}

export function safetyIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (field: Issue['field'], message: string) =>
    issues.push({ level: 'safety', field, message });

  const fingers = fingerTypes(program);
  const gaps = program.constraints.filter((c) => c.kind === 'min-gap-hours');

  // ── The gap, which every program that fingerboards declares ────────────
  if (fingers.length > 0 && gaps.length === 0) {
    const named = joinList(fingers.map((t) => t.name));
    const verb = fingers.length === 1 ? 'loads' : 'load';
    add(
      'constraints',
      `${named} ${verb} the fingers directly and nothing sets a gap between sessions. Every program here that prescribes fingerboarding asks for ${FINGER_GAP_HOURS} hours — connective tissue adapts slower than the muscle that makes a hang feel easy.`,
    );
  }

  // ── And a gap shorter than the one they all ask for ────────────────────
  for (const gap of gaps) {
    if (gap.kind !== 'min-gap-hours' || gap.hours >= FINGER_GAP_HOURS) continue;
    const touchesFingers = gap.between.some((id) => fingers.some((t) => t.id === id));
    if (!touchesFingers) continue;
    add(
      'constraints',
      `The gap on ${gap.between.join(' and ')} is ${gap.hours} hours. Every program here asks for ${FINGER_GAP_HOURS} between sessions that load the fingers.`,
    );
  }

  // ── A rest day exists as a thing you can log ───────────────────────────
  if (!program.sessionTypes.some((type) => type.isRest === true)) {
    add(
      'sessions',
      'No rest session type, so a rest day cannot be logged or prescribed. All thirteen programs here have one — adaptation lands on the days off, and a block that cannot name one cannot place one.',
    );
  }

  // ── Or room for one ────────────────────────────────────────────────────
  const perWeek = program.constraints.find((c) => c.kind === 'sessions-per-week');
  if (perWeek?.kind === 'sessions-per-week' && perWeek.min >= NO_REST_DAY_AT) {
    add(
      'constraints',
      `${perWeek.min} sessions a week leaves no day off. The busiest program here asks for five.`,
    );
  }

  // ── And a deload, in a block long enough to need one ───────────────────
  // Modes are open-ended logging with no progression to deload from, which
  // is why `kind` is checked rather than only the length.
  if (
    program.kind === 'program' &&
    program.weeks >= DELOAD_FROM_WEEKS &&
    (program.deloadWeeks ?? []).length === 0
  ) {
    add(
      'weeks',
      `${program.weeks} weeks with no deload week. Every block here of twelve weeks takes one, usually two — the adaptation lands in the week the load comes off, and a block that never lets it land is the same hard week repeated.`,
    );
  }

  return issues;
}
