import { create } from 'zustand';
import { getDb } from '@/db';
import type { BodyPart } from '@/content/warmups';
import type { Equipment } from '@/content/types';
import { today } from '@/engine/dates';
import type { BaselineAnswers } from '@/engine/onboarding';
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
  /** programId → ISO date the program was started. */
  startDates: Record<string, string>;
  /** programId → chosen track, for programs that have them. */
  tracks: Record<string, string>;
  /** programId → the weekly plan the climber committed to. */
  plans: Record<string, WeekPlan>;
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
  /** When the first-run baseline was finished. Null until it has been. */
  onboardedAt: string | null;
  /** What the climber told us on day one, so the finder never asks twice. */
  baseline: BaselineAnswers | null;
  completeOnboarding: (baseline: BaselineAnswers | null) => void;
  /** Coach tip id → the triggering fact that was waved away. */
  dismissedTips: Record<string, string>;
  dismissTip: (id: string, signature: string) => void;
  restoreTips: () => void;
  /** ISO date of the last backup export, for the coach's nudge. */
  lastExportAt: string | null;
  markExported: () => void;
  startProgram: (programId: string, plan: WeekPlan, trackId?: string, restart?: boolean) => void;
  setPlan: (programId: string, plan: WeekPlan) => void;
  /** Change one week without touching the program's plan. */
  setWeekPlan: (programId: string, weekStart: string, plan: WeekPlan) => void;
  stopProgram: () => void;
  setEquipment: (equipment: Equipment[]) => void;
  addInjury: (part: BodyPart, note?: string) => void;
  updateInjury: (id: string, patch: Partial<Injury>) => void;
  removeInjury: (id: string) => void;
  rememberWarmup: (ids: string[]) => void;
  setAvatarPalette: (patch: Partial<AvatarPalette>) => void;
}

const KEY = 'active-plan';

interface Persisted {
  activeProgramId: string | null;
  startDates: Record<string, string>;
  tracks: Record<string, string>;
  plans: Record<string, WeekPlan>;
  weekOverrides: Record<string, WeekOverrides>;
  equipment: Equipment[];
  injuries: Injury[];
  recentWarmups: string[];
  avatarPalette: AvatarPalette;
  onboardedAt: string | null;
  baseline: BaselineAnswers | null;
  dismissedTips: Record<string, string>;
  lastExportAt: string | null;
}

function snapshot(s: ProfileState): Persisted {
  return {
    activeProgramId: s.activeProgramId,
    startDates: s.startDates,
    tracks: s.tracks,
    plans: s.plans,
    weekOverrides: s.weekOverrides,
    equipment: s.equipment,
    injuries: s.injuries,
    recentWarmups: s.recentWarmups,
    avatarPalette: s.avatarPalette,
    onboardedAt: s.onboardedAt,
    baseline: s.baseline,
    dismissedTips: s.dismissedTips,
    lastExportAt: s.lastExportAt,
  };
}

async function save(value: Persisted): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value });
}

export const useProfile = create<ProfileState>((set, get) => ({
  hydrated: false,
  activeProgramId: null,
  startDates: {},
  tracks: {},
  plans: {},
  weekOverrides: {},
  equipment: ['wall', 'gym'],
  injuries: [],
  recentWarmups: [],
  avatarPalette: DEFAULT_PALETTE,
  onboardedAt: null,
  baseline: null,
  dismissedTips: {},
  lastExportAt: null,

  completeOnboarding: (baseline) => {
    set({ baseline, onboardedAt: new Date().toISOString() });
    void save(snapshot(get()));
  },

  dismissTip: (id, signature) => {
    set({ dismissedTips: { ...get().dismissedTips, [id]: signature } });
    void save(snapshot(get()));
  },

  restoreTips: () => {
    set({ dismissedTips: {} });
    void save(snapshot(get()));
  },

  markExported: () => {
    set({ lastExportAt: today() });
    void save(snapshot(get()));
  },

  startProgram: (programId, plan, trackId, restart = false) => {
    const s = get();
    const keepStart = !restart && s.startDates[programId];
    set({
      activeProgramId: programId,
      startDates: { ...s.startDates, [programId]: keepStart ? s.startDates[programId]! : today() },
      tracks: trackId ? { ...s.tracks, [programId]: trackId } : s.tracks,
      plans: { ...s.plans, [programId]: plan },
    });
    void save(snapshot(get()));
  },

  setPlan: (programId, plan) => {
    // Changing the plan itself retires the per-week exceptions to the old
    // one: they were written against a shape that no longer exists.
    const { [programId]: _dropped, ...rest } = get().weekOverrides;
    set({ plans: { ...get().plans, [programId]: plan }, weekOverrides: rest });
    void save(snapshot(get()));
  },

  setWeekPlan: (programId, weekStart, plan) => {
    const base = get().plans[programId] ?? {};
    const forProgram = withOverride(get().weekOverrides[programId] ?? {}, weekStart, plan, base);
    set({ weekOverrides: { ...get().weekOverrides, [programId]: pruneOverrides(forProgram, today()) } });
    void save(snapshot(get()));
  },

  stopProgram: () => {
    set({ activeProgramId: null });
    void save(snapshot(get()));
  },

  setEquipment: (equipment) => {
    set({ equipment });
    void save(snapshot(get()));
  },

  addInjury: (part, note) => {
    const injury: Injury = {
      id: `${part}-${Date.now()}`,
      part,
      since: today(),
      // The middle of the three: someone marking an injury is usually
      // training around it, and the two extremes are one tap away.
      severity: 'managing',
      status: 'active',
      ...(note ? { note } : {}),
    };
    set({ injuries: [...get().injuries, injury] });
    void save(snapshot(get()));
  },

  updateInjury: (id, patch) => {
    set({ injuries: get().injuries.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    void save(snapshot(get()));
  },

  removeInjury: (id) => {
    set({ injuries: get().injuries.filter((i) => i.id !== id) });
    void save(snapshot(get()));
  },

  rememberWarmup: (ids) => {
    // Keep the last two warmups' worth so the generator can vary from them.
    set({ recentWarmups: [...ids, ...get().recentWarmups].slice(0, 16) });
    void save(snapshot(get()));
  },

  setAvatarPalette: (patch) => {
    set({ avatarPalette: { ...get().avatarPalette, ...patch } });
    void save(snapshot(get()));
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

export async function hydrateProfile(): Promise<void> {
  try {
    const db = await getDb();
    const record = await db.get('profile', KEY);
    const value = (record?.value ?? {}) as Partial<Persisted>;
    useProfile.setState({
      hydrated: true,
      activeProgramId: value.activeProgramId ?? null,
      startDates: value.startDates ?? {},
      tracks: value.tracks ?? {},
      plans: value.plans ?? {},
      weekOverrides: value.weekOverrides ?? {},
      equipment: value.equipment ?? ['wall', 'gym'],
      injuries: (value.injuries ?? []).map(readInjury),
      recentWarmups: value.recentWarmups ?? [],
      avatarPalette: { ...DEFAULT_PALETTE, ...value.avatarPalette },
      onboardedAt: value.onboardedAt ?? null,
      baseline: value.baseline ?? null,
      dismissedTips: value.dismissedTips ?? {},
      lastExportAt: value.lastExportAt ?? null,
    });
  } catch {
    useProfile.setState({ hydrated: true });
  }
}
