import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { useAppUpdate } from './store/appUpdate';
import './index.css';

/**
 * The update is downloaded eagerly and applied on request (PLAN.md M19).
 *
 * A precached update is worth having ready before the climber is somewhere
 * with no signal. Handing over to it is a page reload, which is the part that
 * has to wait: the protocol timer and a half-entered climb row live in
 * component state, so a reload mid-session restarts a hangboard protocol from
 * set one. `engine/offline.ts` decides when the prompt may appear.
 */
const updateSW = registerSW({
  onNeedRefresh() {
    useAppUpdate.getState().markReady(() => updateSW(true));
  },
  onOfflineReady() {
    useAppUpdate.getState().markOfflineReady();
  },
});

/**
 * `onOfflineReady` fires once, on the very first install, and never again.
 * Every launch after that would have reported the app as still caching —
 * measured against a real build before this line existed. The durable
 * question is whether a worker is active for this scope, which is what
 * `ready` answers.
 */
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.ready.then(() => {
    useAppUpdate.getState().markOfflineReady();
  });
}

// Ask once, early: an offline-only app must not be evictable. Browsers
// grant this silently for installed PWAs; declines are retryable from
// Settings.
if (navigator.storage?.persist) {
  void navigator.storage.persisted().then((p) => {
    if (!p) void navigator.storage.persist();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
