import { create } from 'zustand';
import { getDb } from '@/db';
import { today } from '@/engine/dates';
import type { WeekPlan } from '@/engine/scheduler';

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
  startProgram: (programId: string, plan: WeekPlan, trackId?: string, restart?: boolean) => void;
  setPlan: (programId: string, plan: WeekPlan) => void;
  stopProgram: () => void;
}

const KEY = 'active-plan';

interface Persisted {
  activeProgramId: string | null;
  startDates: Record<string, string>;
  tracks: Record<string, string>;
  plans: Record<string, WeekPlan>;
}

function snapshot(s: ProfileState): Persisted {
  return {
    activeProgramId: s.activeProgramId,
    startDates: s.startDates,
    tracks: s.tracks,
    plans: s.plans,
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
    });
  } catch {
    useProfile.setState({ hydrated: true });
  }
}
