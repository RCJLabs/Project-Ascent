import { create } from 'zustand';
import { getDb } from '@/db';
import type { BodyPart } from '@/content/warmups';
import type { Equipment } from '@/content/types';
import { today } from '@/engine/dates';
import type { WeekPlan } from '@/engine/scheduler';

export interface Injury {
  id: string;
  part: BodyPart;
  since: string;
  note?: string;
}

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
  /** What the climber can train on — shared by the finder and warmups. */
  equipment: Equipment[];
  /** Active injuries. The warmup generator and finder both read these. */
  injuries: Injury[];
  /** Warmup ids used recently, freshest first, so warmups stay varied. */
  recentWarmups: string[];
  startProgram: (programId: string, plan: WeekPlan, trackId?: string, restart?: boolean) => void;
  setPlan: (programId: string, plan: WeekPlan) => void;
  stopProgram: () => void;
  setEquipment: (equipment: Equipment[]) => void;
  addInjury: (part: BodyPart, note?: string) => void;
  removeInjury: (id: string) => void;
  rememberWarmup: (ids: string[]) => void;
}

const KEY = 'active-plan';

interface Persisted {
  activeProgramId: string | null;
  startDates: Record<string, string>;
  tracks: Record<string, string>;
  plans: Record<string, WeekPlan>;
  equipment: Equipment[];
  injuries: Injury[];
  recentWarmups: string[];
}

function snapshot(s: ProfileState): Persisted {
  return {
    activeProgramId: s.activeProgramId,
    startDates: s.startDates,
    tracks: s.tracks,
    plans: s.plans,
    equipment: s.equipment,
    injuries: s.injuries,
    recentWarmups: s.recentWarmups,
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
  equipment: ['wall', 'gym'],
  injuries: [],
  recentWarmups: [],

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
    set({ plans: { ...get().plans, [programId]: plan } });
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
      ...(note ? { note } : {}),
    };
    set({ injuries: [...get().injuries, injury] });
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
}));

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
      equipment: value.equipment ?? ['wall', 'gym'],
      injuries: value.injuries ?? [],
      recentWarmups: value.recentWarmups ?? [],
    });
  } catch {
    useProfile.setState({ hydrated: true });
  }
}
