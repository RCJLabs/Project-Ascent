import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { TriangleAlert } from 'lucide-react';
import { pressureIsUrgent, storagePressure, type Pressure } from '@/engine/offline';

/**
 * The browser's storage reading, refreshed when the app comes back to the
 * front (PLAN.md M19).
 *
 * Polling this would be pointless — usage only moves when the climber saves
 * something, and a tab that has been in the background is the case where the
 * number has most likely changed underneath us.
 */
export function useStoragePressure(): Pressure | null {
  const [pressure, setPressure] = useState<Pressure | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function read() {
      if (!navigator.storage?.estimate) return;
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate().catch(() => undefined),
        navigator.storage.persisted?.().catch(() => null) ?? Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPressure(
        storagePressure({
          usage: estimate?.usage,
          quota: estimate?.quota,
          persisted,
        }),
      );
    }

    void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return pressure;
}

/**
 * Shown only when the next thing the climber logs might not save.
 *
 * Every other level stays in Settings. A browser that has declined persistent
 * storage is the more common problem, but it is not urgent and it is not
 * always fixable — most browsers decline until the app is installed — so a
 * banner about it on every launch would be noise the climber learns to
 * ignore, which is how a real warning gets missed later.
 */
export function StorageWarning() {
  const pressure = useStoragePressure();
  if (!pressure || !pressureIsUrgent(pressure)) return null;

  return (
    <Link
      href="/settings"
      className="focus-ring flex items-start gap-3 bg-surface border border-critical rounded-2xl p-3.5"
    >
      <TriangleAlert size={18} className="text-critical shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold text-sm">{pressure.headline}</p>
        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{pressure.detail}</p>
      </div>
    </Link>
  );
}
