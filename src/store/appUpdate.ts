import { create } from 'zustand';

/**
 * What the service worker is doing, where the app can see it (PLAN.md M19).
 *
 * `main.tsx` owns the registration and pushes into this; nothing else imports
 * `virtual:pwa-register`, which does not exist outside a Vite build and would
 * take the whole store with it in a test.
 */
interface AppUpdateState {
  /** A new version is precached and waiting to take over. */
  ready: boolean;
  /** The climber said "later". Resets on the next run of the app. */
  deferred: boolean;
  /** Everything needed to run without a network is cached. */
  offlineReady: boolean;
  /** Hand over to the waiting version and reload. Null until one is ready. */
  apply: (() => void) | null;
  markReady: (apply: () => void) => void;
  markOfflineReady: () => void;
  defer: () => void;
}

export const useAppUpdate = create<AppUpdateState>((set) => ({
  ready: false,
  deferred: false,
  offlineReady: false,
  apply: null,
  markReady: (apply) => set({ ready: true, apply }),
  markOfflineReady: () => set({ offlineReady: true }),
  defer: () => set({ deferred: true }),
}));
