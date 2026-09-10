import { ArrowUpCircle } from 'lucide-react';
import { DEFERRED_NOTE, updateVisible } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { Button } from './Button';

/**
 * "A new version is ready", asked rather than done (PLAN.md M19).
 *
 * Rendered by the shell, above the nav on a phone and in the sidebar on a
 * wide screen, so it never covers what the climber is reading. It does not
 * appear at all while a session is running — see `engine/offline.ts` for why
 * that rule outranks everything else here.
 */
export function UpdatePrompt({ live }: { live: boolean }) {
  const ready = useAppUpdate((s) => s.ready);
  const deferred = useAppUpdate((s) => s.deferred);
  const defer = useAppUpdate((s) => s.defer);
  const apply = useAppUpdate((s) => s.apply);

  if (!updateVisible({ ready, live, deferred })) return null;

  return (
    <div
      role="status"
      className="bg-surface border border-accent rounded-2xl p-3.5 flex items-start gap-3"
    >
      <ArrowUpCircle size={18} className="text-accent shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">A new version is ready</p>
        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
          Updating reloads the app. {DEFERRED_NOTE}
        </p>
        <div className="flex gap-2 mt-2.5">
          <Button size="sm" onClick={() => apply?.()}>
            Update now
          </Button>
          <Button size="sm" variant="outline" onClick={defer}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
