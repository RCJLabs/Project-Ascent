/**
 * Screen wake lock.
 *
 * A timer that lets the phone sleep mid-hang is useless at the wall. The
 * lock is dropped by the browser whenever the page is hidden, so it has to
 * be re-acquired on visibility change rather than requested once.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  const nav = navigator as unknown as NavigatorWithWakeLock;
  if (!nav.wakeLock || sentinel) return;
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch {
    // Denied (battery saver, unsupported) — the timer still works.
  }
}

function onVisibility(): void {
  if (wanted && document.visibilityState === 'visible') {
    sentinel = null;
    void acquire();
  }
}

export async function keepAwake(): Promise<void> {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisibility);
  await acquire();
}

export async function releaseAwake(): Promise<void> {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  const current = sentinel;
  sentinel = null;
  try {
    await current?.release();
  } catch {
    // Already released.
  }
}
