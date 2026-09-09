import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

registerSW({ immediate: true });

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
