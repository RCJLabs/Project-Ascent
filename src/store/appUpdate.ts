import { create } from 'zustand';
import { deferralExpired } from '@/engine/offline';

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
  /** The climber said "later". Expires — see `expireDeferral`. */
  deferred: boolean;
  /** When they said it, so the expiry is a fact rather than a guess. */
  deferredAt: number | null;
  /** Everything needed to run without a network is cached. */
  offlineReady: boolean;
  /** Hand over to the waiting version and reload. Null until one is ready. */
  apply: (() => void) | null;
  /** When the app last asked the server whether a new worker exists. */
  lastCheckedAt: number | null;
  markReady: (apply: () => void) => void;
  markOfflineReady: () => void;
  defer: (at?: number) => void;
  markChecked: (at?: number) => void;
  /** Let the prompt come back if the deferral has run out (PLAN.md M154). */
  expireDeferral: (now?: number) => void;
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  ready: false,
  deferred: false,
  deferredAt: null,
  offlineReady: false,
  apply: null,
  lastCheckedAt: null,
  /**
   * A newer worker clears a deferral, because it is a different fact.
   * "Later" was an answer about the version that was waiting then.
   */
  markReady: (apply) => set({ ready: true, apply, deferred: false, deferredAt: null }),
  markOfflineReady: () => set({ offlineReady: true }),
  defer: (at = Date.now()) => set({ deferred: true, deferredAt: at }),
  markChecked: (at = Date.now()) => set({ lastCheckedAt: at }),
  expireDeferral: (now = Date.now()) => {
    const { deferred, deferredAt } = get();
    if (deferred && deferralExpired(deferredAt, now)) set({ deferred: false, deferredAt: null });
  },
}));
