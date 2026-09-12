import type { Session, SessionMode } from '@/db/sessions';
import type { GradeScale } from './grades';
import { displayGrade, type GradeDisplay } from './grades';
import type { PersonalRecord } from './derive';

/**
 * What a session was, when it was more than a session (PLAN.md M26).
 *
 * A personal record pays half a level — the biggest single award in the
 * economy, worth more than three ordinary sessions — and the card shown
 * after logging listed it as one grey line among "3× V4" and "Warmed up".
 * The economy already knew it mattered; the screen did not say so.
 *
 * Pure, and given everything it needs rather than reaching for stores, so
 * the ranking is testable. The ranking is the substance here: a session can
 * set a grade record *and* level you up *and* be your first day outdoors,
 * and only one of those can be the headline.
 */

export type MilestoneKind =
  | 'grade-pr'
  | 'project-send'
  | 'rank-up'
  | 'level-up'
  | 'first-outdoor'
  | 'first-session';

export interface Milestone {
  kind: MilestoneKind;
  /** The thing itself, in three or four words. */
  headline: string;
  /** One sentence of context. Never congratulation — the fact is enough. */
  detail: string;
  /**
   * Worth a share card. A level-up is a number the app made up; a grade is
   * a thing the climber did, and only the second is worth handing to
   * someone else.
   */
  shareable: boolean;
  /** Set on a grade record, for the share card that names it. */
  record?: PersonalRecord;
}

/**
 * Rarest first, so the headline is the thing that happens least.
 *
 * A rank arrives roughly every few levels, so it outranks a level; a grade
 * record outranks both because it is the only one of the three that is
 * about climbing rather than about the app's own arithmetic.
 */
const ORDER: MilestoneKind[] = [
  'grade-pr',
  'project-send',
  'first-outdoor',
  'first-session',
  'rank-up',
  'level-up',
];

export interface MilestoneInput {
  session: Session;
  /** Personal records the app dated to this session. */
  records: readonly PersonalRecord[];
  /** Completed sessions logged before this one. */
  earlierSessions: number;
  /** Completed outdoor sessions logged before this one. */
  earlierOutdoor: number;
  levelBefore: number;
  levelAfter: number;
  rankBefore: string;
  rankAfter: string;
  /** Projects whose send landed on this session's date. */
  projectsSent: readonly { name: string; grade: string; scale: GradeScale }[];
  display: GradeDisplay;
}

/**
 * The records this session was actually *paid* for.
 *
 * Read back out of the reward breakdown rather than re-derived from the log.
 * Two reasons: re-deriving the whole climber state to name one grade is
 * expensive on a card that appears the moment a session is saved, and — more
 * importantly — the screen then names exactly what the economy paid, so the
 * headline and the XP line can never disagree about what happened.
 *
 * A test asserts this id shape against `economy.ts`, because the coupling is
 * a string.
 */
export function recordsInReward(
  awards: readonly { id: string }[],
  date: string,
  mode: SessionMode,
): PersonalRecord[] {
  return awards.flatMap((award) => {
    const match = /^pr-(V|YDS)-(.+)$/.exec(award.id);
    if (!match) return [];
    // The mode comes from the session rather than the award id, which
    // carries only the ladder and the grade. A record set on rock is a
    // different claim from the same grade indoors (PLAN.md M112d).
    return [{ scale: match[1] as GradeScale, grade: match[2]!, date, mode }];
  });
}

export function sessionMilestones(input: MilestoneInput): Milestone[] {
  const found: Milestone[] = [];
  const { display } = input;

  for (const record of input.records) {
    const grade = displayGrade(record.scale, record.grade, display);
    found.push({
      kind: 'grade-pr',
      headline: `First ${grade}`,
      detail:
        record.scale === 'V'
          ? 'Your hardest boulder so far, and the app worked that out from the log rather than being told.'
          : 'Your hardest route so far, and the app worked that out from the log rather than being told.',
      shareable: true,
      record,
    });
  }

  for (const project of input.projectsSent) {
    found.push({
      kind: 'project-send',
      headline: `${project.name} sent`,
      detail: `${displayGrade(project.scale, project.grade, display)} — off the project list.`,
      shareable: true,
    });
  }

  if (input.earlierOutdoor === 0 && input.session.mode === 'outdoor') {
    found.push({
      kind: 'first-outdoor',
      headline: 'First day on rock',
      detail: 'Days outside are their own axis here — the altimeter counts them separately.',
      shareable: false,
    });
  }

  if (input.earlierSessions === 0) {
    found.push({
      kind: 'first-session',
      headline: 'First session logged',
      detail: 'Everything the app knows about you grows from here.',
      shareable: false,
    });
  }

  if (input.rankAfter !== input.rankBefore) {
    found.push({
      kind: 'rank-up',
      headline: input.rankAfter,
      detail: `A new rank, at level ${input.levelAfter}.`,
      shareable: false,
    });
  } else if (input.levelAfter > input.levelBefore) {
    // Only when the rank did not also change: "Level 12" under "Boulderer"
    // is the same event described twice.
    found.push({
      kind: 'level-up',
      headline: `Level ${input.levelAfter}`,
      detail:
        input.levelAfter - input.levelBefore > 1
          ? `${input.levelAfter - input.levelBefore} levels in one session.`
          : 'One level up.',
      shareable: false,
    });
  }

  return found.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** The one to lead with, or null for an ordinary session. */
export function headlineMilestone(milestones: readonly Milestone[]): Milestone | null {
  return milestones[0] ?? null;
}

/**
 * What a screen reader is told when the card appears.
 *
 * The record comes first and the XP second, which is the opposite of the
 * order the card used to announce: "412 XP earned" told a climber nothing
 * about the fact that they had just climbed the hardest thing they ever
 * have.
 */
export function announcementFor(milestones: readonly Milestone[], xp: number): string {
  const lead = headlineMilestone(milestones);
  const earned = `${xp.toLocaleString()} XP earned.`;
  if (!lead) return `Session logged. ${earned}`;
  const rest = milestones.length > 1 ? ` And ${milestones.length - 1} more.` : '';
  return `${lead.headline}. ${lead.detail} ${earned}${rest}`;
}
