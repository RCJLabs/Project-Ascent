/**
 * The reward pipeline: one chronological fold over everything you did.
 *
 * Real XP is *derived*, not banked. The prototype paid each session once and
 * set a `rewarded` flag to stop it paying twice (AUDIT.md §4); that works
 * until a session is edited, imported, or replayed, and it means the number
 * on screen can disagree with the log that produced it. Folding instead
 * makes double-paying structurally impossible — there is no payment, only a
 * total — and an edited session immediately corrects the level.
 *
 * It is a fold rather than a sum because three things depend on order: a
 * record has to be strictly harder than everything *before* it, the drill
 * streak counts consecutive sessions, and a level-up belongs to the event
 * that crossed it.
 *
 * Pure: records in, state out.
 */

import type { LedgerEntry } from '@/db/game';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import {
  AWARDS,
  GAME_ACTION_CAP,
  MULTIPLIERS,
  levelFor,
  levelProgress,
  nextRank,
  rankFor,
  sessionReward,
  unitsToXp,
  type Award,
  type AwardSource,
  type LevelProgress,
  type Rank,
  type SessionReward,
} from './economy';
import { buildLoadIndex, zonesFor, type AcwrZone } from './derive';
import { gradeOrdinal, type GradeDisplay, type GradeScale } from './grades';
import { isRestSession } from './rest';

export interface XpLine {
  label: string;
  xp: number;
}

export interface SessionXp {
  sessionId: string;
  date: string;
  xp: number;
  lines: XpLine[];
  reward: SessionReward;
  levelBefore: number;
  levelAfter: number;
}

export interface XpEvent {
  key: string;
  date: string;
  kind: 'session' | 'project' | 'game' | 'challenge';
  label: string;
  xp: number;
  source: AwardSource;
  /** Level reached after this event, when it crossed one. */
  levelUp?: number;
}

export interface XpState {
  total: number;
  real: number;
  game: number;
  progress: LevelProgress;
  rank: Rank;
  next: Rank | null;
  /** Newest first. */
  events: XpEvent[];
  bySession: Record<string, SessionXp>;
  /** Soft currency earned over all time: XP × 0.25. */
  earned: number;
}

export const CURRENCY_RATE = 0.25;

export interface XpSources {
  sessions?: Session[];
  projects?: Project[];
  /** Game-lane awards and challenge claims. */
  ledger?: LedgerEntry[];
  /** Notation to write grades in. Defaults to the stored ladders. */
  display?: GradeDisplay;
}

/**
 * One result, reused while the inputs are identical.
 *
 * `useXp()` is called from nine places — the home page, the climber, the
 * logger, the review, objectives, the game, and the skills store — and each
 * had its own `useMemo`, so a single render of the home screen walked the
 * whole log several times over. The stores replace their arrays rather than
 * mutating them, so reference identity is a sound cache key here: if the
 * same four objects come back, the answer cannot have changed.
 *
 * One entry, not a map. Two different logs are never live at once, and an
 * unbounded cache of ten-year derivations is a memory leak wearing a
 * performance costume.
 */
let cached: { key: readonly unknown[]; value: XpState } | null = null;

function sameInputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function deriveXp(sources: XpSources): XpState {
  const key = [sources.sessions, sources.projects, sources.ledger, sources.display] as const;
  if (cached !== null && sameInputs(cached.key, key)) return cached.value;
  const value = deriveXpUncached(sources);
  cached = { key, value };
  return value;
}

/** Exported for tests and benchmarks that need to measure the real work. */
export function clearXpCache(): void {
  cached = null;
}

function deriveXpUncached(sources: XpSources): XpState {
  const sessions = (sources.sessions ?? [])
    .filter((s) => s.completed)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
  const loadIndex = buildLoadIndex(sessions);

  type Moment =
    | { date: string; order: number; key: string; kind: 'session'; session: Session }
    | { date: string; order: number; key: string; kind: 'project'; project: Project }
    | { date: string; order: number; key: string; kind: 'ledger'; entry: LedgerEntry };

  const moments: Moment[] = [
    ...sessions.map((session, i) => ({
      date: session.date,
      order: i,
      key: session.id,
      kind: 'session' as const,
      session,
    })),
    ...(sources.projects ?? [])
      .filter((p): p is Project & { sentDate: string } => typeof p.sentDate === 'string')
      .map((project) => ({
        date: project.sentDate,
        order: 0,
        key: `project:${project.id}`,
        kind: 'project' as const,
        project,
      })),
    ...(sources.ledger ?? []).map((entry) => ({
      date: entry.date,
      order: 0,
      key: `ledger:${entry.id}`,
      kind: 'ledger' as const,
      entry,
    })),
  ].sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date < b.date ? -1 : 1));

  // Every session's zone in one sliding pass. Asking per session meant a
  // 28-day walk each time, which was 46.6ms of a 59.5ms derivation at ten
  // years of logs — the app's single most expensive operation, running on
  // every session write.
  const zoneByDate = new Map<string, AcwrZone>();
  const sessionDates = [...new Set(sessions.map((session) => session.date))].sort();
  const zones = zonesFor(loadIndex, sessionDates);
  sessionDates.forEach((date, i) => zoneByDate.set(date, zones[i] ?? 'unknown'));

  const best: Record<GradeScale, number> = { V: -1, YDS: -1 };
  const events: XpEvent[] = [];
  const bySession: Record<string, SessionXp> = {};
  let total = 0;
  let real = 0;
  let game = 0;
  let drillStreak = 0;

  for (const moment of moments) {
    const levelBefore = levelFor(total);
    const toXp = unitsToXp;

    if (moment.kind === 'ledger') {
      // A challenge resolves from the log, so it counts as real climbing and
      // is not capped. Anything else is game-lane and is, whatever the
      // writer claimed.
      const source: AwardSource = moment.entry.source ?? 'game';
      const units = source === 'game' ? Math.min(moment.entry.units, GAME_ACTION_CAP) : moment.entry.units;
      const xp = toXp(units);
      total += xp;
      if (source === 'game') game += xp;
      else real += xp;
      events.push({
        key: moment.key,
        date: moment.date,
        kind: source === 'game' ? 'game' : 'challenge',
        label: moment.entry.label,
        xp,
        source,
        ...levelUp(levelBefore, total),
      });
      continue;
    }

    if (moment.kind === 'project') {
      const outdoor = moment.project.setting === 'outdoor' ? MULTIPLIERS.projectSendOutdoor : 1;
      const xp = toXp(AWARDS.projectSend * outdoor);
      total += xp;
      real += xp;
      events.push({
        key: moment.key,
        date: moment.date,
        kind: 'project',
        label: `Project sent: ${moment.project.name}`,
        xp,
        source: 'real',
        ...levelUp(levelBefore, total),
      });
      continue;
    }

    const { session } = moment;
    const isRest = isRestSession(session);

    // Records for the economy are strictly harder than anything sent
    // before on that ladder. `deriveClimberState` lists the first send of
    // every grade, which is right for a timeline and wrong for a bonus:
    // an easy problem climbed late is not a record.
    const records: { scale: GradeScale; grade: string }[] = [];
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      const ordinal = gradeOrdinal(climb.scale, climb.grade);
      if (ordinal > best[climb.scale]) {
        best[climb.scale] = ordinal;
        records.push({ scale: climb.scale, grade: climb.grade });
      }
    }

    if (!isRest) drillStreak = session.drillDone ? drillStreak + 1 : 0;

    const reward = sessionReward(session, {
      zone: zoneByDate.get(session.date) ?? 'unknown',
      drillStreak,
      records,
      ...(sources.display ? { display: sources.display } : {}),
    });

    const lines: XpLine[] = reward.awards.map((award) => ({
      label: award.label,
      xp: toXp(unitsOf(award) * (award.id.startsWith('pr-') ? 1 : reward.multiplier)),
    }));
    const xp = lines.reduce((sum, line) => sum + line.xp, 0);

    total += xp;
    real += xp;
    bySession[session.id] = {
      sessionId: session.id,
      date: session.date,
      xp,
      lines,
      reward,
      levelBefore,
      levelAfter: levelFor(total),
    };
    events.push({
      key: moment.key,
      date: moment.date,
      kind: 'session',
      label: isRest ? 'Rest day' : 'Session',
      xp,
      source: 'real',
      ...levelUp(levelBefore, total),
    });
  }

  const level = levelFor(total);
  return {
    total,
    real,
    game,
    progress: levelProgress(total),
    rank: rankFor(level),
    next: nextRank(level),
    events: events.reverse(),
    bySession,
    earned: Math.floor(total * CURRENCY_RATE),
  };
}

function unitsOf(award: Award): number {
  return award.units * (award.own ?? 1);
}

function levelUp(before: number, total: number): { levelUp?: number } {
  const after = levelFor(total);
  return after > before ? { levelUp: after } : {};
}
