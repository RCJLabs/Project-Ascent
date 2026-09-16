import { create } from 'zustand';
import { reportDbError } from '@/db/db';
import { enqueueWrite } from './writes';
import { getDb } from '@/db/db';
import { registerAdaptations } from '@/content/programs';
import type { BodyPart } from '@/content/bodyParts';
import type { Equipment } from '@/content/types';
import { addDays, today, isDateKey } from '@/engine/dates';
import { EMPTY_BASELINE, readBaseline, type BaselineAnswers } from '@/engine/onboarding';
import { closeBlock, openBlock, reconstructBlocks, type BlockRecord, moveBlockStart } from '@/engine/blocks';
import { getProgram } from '@/content/programs';
import { pruneOverrides, withOverride, type WeekOverrides } from '@/engine/reschedule';
import type { WeekPlan } from '@/engine/scheduler';
import { DEFAULT_PALETTE, type AvatarPalette } from '@/engine/avatar';

/** How much it changes what you can do, not how much it hurts. */
export type InjurySeverity = 'niggle' | 'managing' | 'serious';

/**
 * Where a healing part sits in its return.
 *
 * 'returning' is the state the prototype had no word for, and it is the one
 * that matters most: still healing, back to training, and needing the app to
 * warn rather than exclude. Everything downstream reads this rather than
 * inferring it from a date.
 */
export type InjuryStatus = 'active' | 'returning';

export type InjurySide = 'left' | 'right' | 'both';

export interface Injury {
  id: string;
  part: BodyPart;
  since: string;
  severity: InjurySeverity;
  status: InjuryStatus;
  /** Meaningless for a back; kept optional rather than faked. */
  side?: InjurySide;
  /** Return-to-climbing step id → ticked. Ticking earns nothing, by design. */
  checklist?: Record<string, boolean>;
  /** Steps the climber wrote, kept alongside the defaults. */
  ownSteps?: { id: string; text: string }[];
  /** Default step ids the climber removed, so they stay removed. */
  hiddenSteps?: string[];
  /**
   * The day it was marked healed (PLAN.md M177).
   *
   * Set only on a record in `healedInjuries`, which is the one list where it
   * means anything — a live injury has not ended.
   */
  healedAt?: string;
  /** What a clinician actually said, in their words rather than ours. */
  clinicalNote?: string;
  note?: string;
}

export const SEVERITY_LABEL: Record<InjurySeverity, { label: string; blurb: string }> = {
  niggle: { label: 'A niggle', blurb: 'Noticeable, not stopping you' },
  managing: { label: 'Managing it', blurb: 'Training around it deliberately' },
  serious: { label: 'Serious', blurb: 'Off it entirely for now' },
};

export const STATUS_LABEL: Record<InjuryStatus, { label: string; blurb: string }> = {
  active: { label: 'Healing', blurb: 'Keep load off it' },
  returning: { label: 'Coming back', blurb: 'Loading it again, carefully' },
};

/**
 * The climber's active plan. Start dates are kept per program so switching
 * away and back resumes your week instead of resetting it — one of the
 * prototype's genuinely good ideas (AUDIT.md §6.12).
 */
export interface ProfileState {
  hydrated: boolean;
  activeProgramId: string | null;
  /**
   * programId → ISO date the program was started.
   *
   * The live block's start, and only that. It cannot hold a history — one
   * entry per program, overwritten on a restart — which is what `blocks`
   * below is for (PLAN.md M87). Kept because every screen reads the running
   * block through it and `blocks` is the record of what has been run.
   */
  startDates: Record<string, string>;
  /**
   * Every block the climber has run, newest last. See engine/blocks.ts.
   *
   * Exactly one row is open at a time, and the open row is the same block
   * `activeProgramId` and `startDates` describe.
   */
  blocks: BlockRecord[];
  /** programId → chosen track, for programs that have them. */
  tracks: Record<string, string>;
  /** programId → the weekly plan the climber committed to. */
  plans: Record<string, WeekPlan>;
  /** programId → weeks it is being run over, when that is not the written
   *  length (PLAN.md M56). Absent means as written. */
  adaptations: Record<string, number>;
  /** programId → week start → that week's changed plan. A move defaults to
   *  one week; see engine/reschedule.ts. */
  weekOverrides: Record<string, WeekOverrides>;
  /** What the climber can train on — shared by the finder and warmups. */
  equipment: Equipment[];
  /** Active injuries. The warmup generator and finder both read these. */
  injuries: Injury[];
  /** Warmup ids used recently, freshest first, so warmups stay varied. */
  recentWarmups: string[];
  /** The avatar's colours — the only part of the figure that is stored. */
  avatarPalette: AvatarPalette;
  /** When the guided setup was finished, or skipped from inside it. Null
   *  until it has been — and since M123 that is the ordinary state, not
   *  a first-run flag: a new install lands on Home and is offered the
   *  setup as a card, so a null here with a year of sessions is normal. */
  onboardedAt: string | null;
  /** What the climber told us on day one, so the finder never asks twice. */
  baseline: BaselineAnswers | null;
  completeOnboarding: (baseline: BaselineAnswers | null) => void;
  /** Keep what the finder was told, which used to be thrown away (M93). */
  updateBaseline: (patch: Partial<BaselineAnswers>) => void;
  /** Coach tip id → the triggering fact that was waved away. */
  dismissedTips: Record<string, string>;
  dismissTip: (id: string, signature: string) => void;
  restoreTips: () => void;
  /**
   * Home cards the climber has said "not now" to (PLAN.md M123).
   *
   * Separate from `dismissedTips` on purpose: a tip is dismissed against
   * the fact that raised it and comes back when the fact changes, and
   * "Restore tips" clears the lot. These are a one-way "I have seen this"
   * — the safety note, the setup offer, the catalogue — and nothing brings
   * them back short of starting over, which is what a wave-away means.
   */
  dismissedCards: string[];
  dismissCard: (id: string) => void;
  /** ISO date of the last backup export, for the coach's nudge. */
  lastExportAt: string | null;
  markExported: () => void;
  startProgram: (programId: string, plan: WeekPlan, trackId?: string, restart?: boolean) => void;
  /** When each block was last picked up after a gap (PLAN.md M149). */
  resumedAt: Record<string, string>;
  /** Move an interrupted block's dates so today is an earlier week (M149). */
  resumeBlock: (programId: string, shiftWeeks: number) => void;
  setPlan: (programId: string, plan: WeekPlan) => void;
  /** Run a program over a different number of weeks, or as written. */
  setProgramLength: (programId: string, weeks: number | null) => void;
  /** Change one week without touching the program's plan. */
  setWeekPlan: (programId: string, weekStart: string, plan: WeekPlan) => void;
  stopProgram: () => void;
  /**
   * Put back exactly what `stopProgram` closed, for an undo (PLAN.md M126).
   *
   * Whole state rather than a fresh start, for the same reason
   * `restoreInjury` takes the whole record: re-starting the program would
   * mint a new block row and lose the one the climber had been filling,
   * and the undo has to be a reversal rather than a second way to do
   * something similar.
   */
  restoreProgram: (snapshot: { activeProgramId: string | null; blocks: BlockRecord[] }) => void;
  setEquipment: (equipment: Equipment[]) => void;
  /**
   * Log one. `details` carries what the add form asked for (PLAN.md M223).
   *
   * Every field optional and every default the old behaviour, because two
   * callers — the finder's chips and the guided setup's — still add with a
   * tap and should keep meaning "this, today, and I am training around it".
   */
  addInjury: (part: BodyPart, details?: Partial<Pick<Injury, 'side' | 'since' | 'severity' | 'note'>>) => void;
  updateInjury: (id: string, patch: Partial<Injury>) => void;
  removeInjury: (id: string) => void;
  /**
   * Injuries that healed, oldest first (PLAN.md M177).
   *
   * A **separate list**, not a third `InjuryStatus`. Sixteen places read
   * `injuries`, and every one of them reads it as *what is wrong right now* —
   * the warmup generator, the finder, M161's maximal-test gate, vitality, the
   * logger. A healed record left in that array is one forgotten filter away
   * from blocking training the climber is cleared for, and that is the
   * dangerous direction to be wrong in.
   *
   * What it buys is the thing a coach would most want and the app could not
   * see: that this is the third time. M166's own guide says why — finger
   * injuries are *"slow to heal and quick to recur"*, and golfer's elbow,
   * tennis elbow and rotator cuff trouble *"end more seasons than falling off
   * does"*. Recurrence is the clinical picture.
   */
  healedInjuries: Injury[];
  /**
   * Mark one healed: out of the live list, into the history.
   *
   * Separate from `removeInjury`, which stays a delete — and the separation
   * is not cosmetic. Three of that action's four call sites are not healings
   * at all: a toggle in the finder's questions, the same toggle in
   * onboarding, and clearing the demo climber. Recording those as episodes
   * would invent an injury history out of un-ticking a checkbox.
   */
  healInjury: (id: string) => void;
  /** Put a removed or healed injury back whole — id, notes, checklist — for
   *  an undo (PLAN.md M79). */
  restoreInjury: (injury: Injury) => void;
  rememberWarmup: (ids: string[]) => void;
  setAvatarPalette: (patch: Partial<AvatarPalette>) => void;
}

const KEY = 'active-plan';

interface Persisted {
  activeProgramId: string | null;
  startDates: Record<string, string>;
  blocks: BlockRecord[];
  tracks: Record<string, string>;
  plans: Record<string, WeekPlan>;
  weekOverrides: Record<string, WeekOverrides>;
  adaptations: Record<string, number>;
  equipment: Equipment[];
  injuries: Injury[];
  healedInjuries: Injury[];
  recentWarmups: string[];
  avatarPalette: AvatarPalette;
  onboardedAt: string | null;
  baseline: BaselineAnswers | null;
  dismissedTips: Record<string, string>;
  dismissedCards: string[];
  lastExportAt: string | null;
  resumedAt: Record<string, string>;
}

function snapshot(s: ProfileState): Persisted {
  return {
    activeProgramId: s.activeProgramId,
    startDates: s.startDates,
    blocks: s.blocks,
    tracks: s.tracks,
    plans: s.plans,
    weekOverrides: s.weekOverrides,
    adaptations: s.adaptations,
    equipment: s.equipment,
    injuries: s.injuries,
    healedInjuries: s.healedInjuries,
    recentWarmups: s.recentWarmups,
    avatarPalette: s.avatarPalette,
    onboardedAt: s.onboardedAt,
    baseline: s.baseline,
    dismissedTips: s.dismissedTips,
    dismissedCards: s.dismissedCards,
    lastExportAt: s.lastExportAt,
    resumedAt: s.resumedAt,
  };
}

/**
 * Keep the program registry in step with the lengths stored here.
 *
 * `getProgram` reads that registry, and it is read inside pure engines that
 * cannot see a React store — the same reason custom programs register there.
 * Every write of `adaptations` goes through this, so the two cannot drift,
 * and a nonsense value in a restored backup never reaches it.
 */
function adopt(value: unknown): Record<string, number> {
  const raw = (value ?? {}) as Record<string, unknown>;
  const clean: Record<string, number> = {};
  for (const [id, weeks] of Object.entries(raw)) {
    const n = Number(weeks);
    if (Number.isFinite(n) && n >= 1) clean[id] = Math.round(n);
  }
  registerAdaptations(clean);
  return clean;
}

async function save(value: Persisted): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value });
}

/** Makes ids unique inside one millisecond. See `addInjury`. */
let added = 0;

export const useProfile = create<ProfileState>((set, get) => ({
  hydrated: false,
  activeProgramId: null,
  startDates: {},
  blocks: [],
  tracks: {},
  plans: {},
  weekOverrides: {},
  adaptations: {},
  equipment: ['wall', 'gym'],
  injuries: [],
  healedInjuries: [],
  recentWarmups: [],
  avatarPalette: DEFAULT_PALETTE,
  onboardedAt: null,
  baseline: null,
  dismissedTips: {},
  dismissedCards: [],
  lastExportAt: null,
  resumedAt: {},

  completeOnboarding: (baseline) => {
    set({ baseline, onboardedAt: new Date().toISOString() });
    enqueueWrite(() => save(snapshot(get())));
  },

  /**
   * Keep what the climber just told the finder (PLAN.md M93).
   *
   * The finder asks the same five questions the baseline holds and used to
   * discard every answer, so correcting "coming back" to "intermediate"
   * lasted exactly as long as the page did. `onboardedAt` is deliberately
   * not touched: it records when the guided setup finished, and Home reads
   * it to decide whether to keep offering the setup (PLAN.md M123).
   *
   * Merges rather than replaces, and starts from the empty baseline when
   * there is none — a climber who skipped onboarding has no record to
   * patch, and the finder's answers are a better one than nothing.
   */
  updateBaseline: (patch) => {
    set({ baseline: { ...(get().baseline ?? EMPTY_BASELINE), ...patch } });
    enqueueWrite(() => save(snapshot(get())));
  },

  dismissTip: (id, signature) => {
    set({ dismissedTips: { ...get().dismissedTips, [id]: signature } });
    enqueueWrite(() => save(snapshot(get())));
  },

  restoreTips: () => {
    set({ dismissedTips: {} });
    enqueueWrite(() => save(snapshot(get())));
  },

  dismissCard: (id) => {
    const cards = get().dismissedCards;
    if (cards.includes(id)) return;
    set({ dismissedCards: [...cards, id] });
    enqueueWrite(() => save(snapshot(get())));
  },

  markExported: () => {
    set({ lastExportAt: today() });
    enqueueWrite(() => save(snapshot(get())));
  },

  /**
   * Pick an interrupted block up again (PLAN.md M149).
   *
   * The whole operation is the start date: every week in the app is derived
   * from it, so pushing it back by `shiftWeeks` puts today on an earlier
   * program week and the calendar, the prescription and the adherence all
   * follow. Nothing rewrites a dose, so the block stays the block the
   * climber read last week.
   *
   * The open block row moves with it rather than being closed and reopened:
   * this is the same run, interrupted, and a second row would tell the
   * history otherwise.
   */
  resumeBlock: (programId, shiftWeeks) => {
    const s = get();
    const from = s.startDates[programId];
    if (from === undefined || shiftWeeks <= 0) return;
    const startDate = addDays(from, shiftWeeks * 7);
    set({
      startDates: { ...s.startDates, [programId]: startDate },
      blocks: moveBlockStart(s.blocks, programId, startDate),
      // A shift is a translation and cannot close the gap it was asked
      // about, so the answer is recorded rather than re-derived (M149).
      resumedAt: { ...s.resumedAt, [programId]: today() },
    });
    enqueueWrite(() => save(snapshot(get())));
  },

  startProgram: (programId, plan, trackId, restart = false) => {
    const s = get();
    const keepStart = !restart && s.startDates[programId];
    const startDate = keepStart ? s.startDates[programId]! : today();
    const program = getProgram(programId);
    set({
      activeProgramId: programId,
      startDates: { ...s.startDates, [programId]: startDate },
      // Opening a block closes whatever was open, so picking this one up
      // again mid-run re-opens the same row rather than adding a second
      // (PLAN.md M87). Without a resolvable program there is nothing to
      // write down — name and length are snapshots taken here.
      blocks: program ? openBlock(s.blocks, { program, startDate, plan, trackId }, today()) : s.blocks,
      tracks: trackId ? { ...s.tracks, [programId]: trackId } : s.tracks,
      plans: { ...s.plans, [programId]: plan },
    });
    enqueueWrite(() => save(snapshot(get())));
  },

  setPlan: (programId, plan) => {
    // Changing the plan itself retires the per-week exceptions to the old
    // one: they were written against a shape that no longer exists.
    const { [programId]: _dropped, ...rest } = get().weekOverrides;
    set({ plans: { ...get().plans, [programId]: plan }, weekOverrides: rest });
    enqueueWrite(() => save(snapshot(get())));
  },

  setProgramLength: (programId, weeks) => {
    const { [programId]: _dropped, ...rest } = get().adaptations;
    set({ adaptations: adopt(weeks === null ? rest : { ...rest, [programId]: Math.round(weeks) }) });
    enqueueWrite(() => save(snapshot(get())));
  },

  setWeekPlan: (programId, weekStart, plan) => {
    const base = get().plans[programId] ?? {};
    const forProgram = withOverride(get().weekOverrides[programId] ?? {}, weekStart, plan, base);
    set({ weekOverrides: { ...get().weekOverrides, [programId]: pruneOverrides(forProgram, today()) } });
    enqueueWrite(() => save(snapshot(get())));
  },

  stopProgram: () => {
    set({ activeProgramId: null, blocks: closeBlock(get().blocks, today(), 'stopped') });
    enqueueWrite(() => save(snapshot(get())));
  },

  restoreProgram: ({ activeProgramId, blocks }) => {
    set({ activeProgramId, blocks });
    enqueueWrite(() => save(snapshot(get())));
  },

  setEquipment: (equipment) => {
    set({ equipment });
    enqueueWrite(() => save(snapshot(get())));
  },

  addInjury: (part, details) => {
    const injury: Injury = {
      // A counter as well as the clock: two records added inside the same
      // millisecond used to share an id, and since M223 a climber can have
      // a left one and a right one (PLAN.md M223).
      id: `${part}-${Date.now()}-${(added += 1)}`,
      part,
      since: details?.since ?? today(),
      // The middle of the three: someone marking an injury is usually
      // training around it, and the two extremes are one tap away.
      severity: details?.severity ?? 'managing',
      status: 'active',
      ...(details?.side ? { side: details.side } : {}),
      ...(details?.note ? { note: details.note } : {}),
    };
    set({ injuries: [...get().injuries, injury] });
    enqueueWrite(() => save(snapshot(get())));
  },

  updateInjury: (id, patch) => {
    set({ injuries: get().injuries.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    enqueueWrite(() => save(snapshot(get())));
  },

  removeInjury: (id) => {
    set({ injuries: get().injuries.filter((i) => i.id !== id) });
    enqueueWrite(() => save(snapshot(get())));
  },

  healInjury: (id) => {
    const injury = get().injuries.find((i) => i.id === id);
    if (!injury) return;
    set({
      injuries: get().injuries.filter((i) => i.id !== id),
      // Oldest first, and never twice: healing the same record again — which
      // an undo followed by a second "Mark healed" does — replaces rather
      // than doubles the episode.
      healedInjuries: [
        ...get().healedInjuries.filter((i) => i.id !== id),
        { ...injury, healedAt: today() },
      ],
    });
    enqueueWrite(() => save(snapshot(get())));
  },

  restoreInjury: (injury) => {
    // Whole record, not a fresh one: `addInjury` would mint a new id and
    // lose the notes and the return-to-climbing ticks the climber wrote.
    //
    // Out of the history as well as back into the live list (PLAN.md M177):
    // undoing a heal has to undo the episode too, or the record comes back
    // *and* leaves a scar the climber never had.
    set({
      injuries: [...get().injuries.filter((i) => i.id !== injury.id), injury],
      healedInjuries: get().healedInjuries.filter((i) => i.id !== injury.id),
    });
    enqueueWrite(() => save(snapshot(get())));
  },

  rememberWarmup: (ids) => {
    // Keep the last two warmups' worth so the generator can vary from them.
    set({ recentWarmups: [...ids, ...get().recentWarmups].slice(0, 16) });
    enqueueWrite(() => save(snapshot(get())));
  },

  setAvatarPalette: (patch) => {
    set({ avatarPalette: { ...get().avatarPalette, ...patch } });
    enqueueWrite(() => save(snapshot(get())));
  },
}));

/**
 * Injuries recorded before severity and status existed are read as what they
 * meant at the time: something being trained around, still healing.
 */
function readInjury(injury: Injury): Injury {
  const legacy = injury as Partial<Injury>;
  return {
    ...injury,
    severity: legacy.severity ?? 'managing',
    status: legacy.status ?? 'active',
  };
}

/**
 * The block history, or one reconstructed from what came before it.
 *
 * Every climber who used the app before M87 has `startDates` and no
 * `blocks`, and throwing that away would make the history start today for
 * someone who has trained for a year. `reconstructBlocks` marks every row it
 * builds, so nothing reports a reconstructed block as finished or abandoned
 * — the old shape does not know.
 */
function readBlocks(value: Partial<Persisted>): BlockRecord[] {
  if (Array.isArray(value.blocks) && value.blocks.length > 0) return value.blocks;
  return reconstructBlocks({
    startDates: value.startDates ?? {},
    activeProgramId: value.activeProgramId ?? null,
    nameFor: (id) => getProgram(id)?.name,
    weeksFor: (id) => getProgram(id)?.weeks,
    ...(value.tracks ? { tracks: value.tracks } : {}),
  });
}

export async function hydrateProfile(): Promise<void> {
  try {
    const db = await getDb();
    const record = await db.get('profile', KEY);
    const value = (record?.value ?? {}) as Partial<Persisted>;
    useProfile.setState({
      hydrated: true,
      activeProgramId: value.activeProgramId ?? null,
      startDates: value.startDates ?? {},
      blocks: readBlocks(value),
      tracks: value.tracks ?? {},
      plans: value.plans ?? {},
      weekOverrides: value.weekOverrides ?? {},
      adaptations: adopt(value.adaptations),
      equipment: value.equipment ?? ['wall', 'gym'],
      injuries: (value.injuries ?? []).map(readInjury),
      healedInjuries: (value.healedInjuries ?? []).map(readInjury),
      recentWarmups: value.recentWarmups ?? [],
      avatarPalette: { ...DEFAULT_PALETTE, ...value.avatarPalette },
      onboardedAt: value.onboardedAt ?? null,
      baseline: readBaseline(value.baseline),
      dismissedTips: value.dismissedTips ?? {},
      // Strings only: a backup is whatever was in the file.
      dismissedCards: Array.isArray(value.dismissedCards)
        ? value.dismissedCards.filter((id): id is string => typeof id === 'string')
        : [],
      // Guarded like the sibling above it, and for the same reason: a backup
      // is whatever was in the file. `backupNudge` does `daysBetween` on
      // this and prints the result, so a malformed key — an ISO timestamp,
      // an unpadded `2026-9-1` — reached the climber as "NaN days since your
      // last backup". Found by M148's browser check against a hand-seeded
      // profile; the app itself only ever writes `today()` (PLAN.md M159).
      lastExportAt:
        typeof value.lastExportAt === 'string' && isDateKey(value.lastExportAt)
          ? value.lastExportAt
          : null,
      resumedAt: typeof value.resumedAt === 'object' && value.resumedAt !== null ? value.resumedAt : {},
    });
  } catch (error) {
    // The reason is kept rather than swallowed (PLAN.md M151).
    reportDbError(error);
    useProfile.setState({ hydrated: true });
  }
}
