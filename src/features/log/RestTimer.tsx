import { useEffect, useRef, useState } from 'react';
import { REST_PRESETS, restLabel, restRemaining } from '@/engine/gym';
import { formatClock } from '@/engine/live';
import { cueCountdown, cueDone, unlock } from '@/lib/cues';
import { clearRest, loadRest, saveRest } from '@/lib/timerState';
import { announce } from '@/ui/Announce';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';

/**
 * Rest between burns (PLAN.md M74, in the logger since M120).
 *
 * Not the protocol timer: that one is work/rest/reps/sets attached to a
 * prescribed exercise, and "give me three minutes" is none of those. It is
 * driven by an end time rather than a countdown so a phone going dark does
 * not pause the rest — see engine/gym.ts.
 *
 * It lived on the gym-mode route, which was the logger with everything
 * else taken away. The logger has a quick view now, which is the same
 * thing, so the timer moved in and the route went.
 */
export function RestTimer({ sessionId, now }: { sessionId: string; now: number }) {
  const [rest, setRest] = useState(() => loadRest(sessionId));
  const fired = useRef(false);

  const left = rest ? restRemaining(rest.endsAt, now) : 0;

  useEffect(() => {
    if (!rest) return;
    if (left > 0) {
      // The last three seconds, once each.
      if (left <= 3000) cueCountdown();
      return;
    }
    if (fired.current) return;
    fired.current = true;
    cueDone();
    announce('Rest over.');
    // Nothing is cleared here. `loadRest` refuses an end time that has
    // already passed, so a finished rest cannot come back whether the key is
    // there or not — and a clearRest() on this path survived being deleted,
    // which is what a second guard on the same rule looks like.
  }, [rest, left]);

  function start(seconds: number) {
    // Audio on a phone only plays after a gesture; this is the gesture.
    unlock();
    fired.current = false;
    const next = { endsAt: Date.now() + seconds * 1000, seconds, sessionId };
    saveRest(next);
    setRest(next);
  }

  function stop() {
    clearRest();
    setRest(null);
  }

  if (!rest || left <= 0) {
    return (
      <Card title="Rest">
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((seconds) => (
            <Chip key={seconds} active={false} onClick={() => start(seconds)} className="min-h-12 px-4 text-base">
              {restLabel(seconds)}
            </Chip>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Rest">
      <div className="flex items-center gap-3">
        <span className="text-5xl font-black tabular-nums" role="timer" aria-live="off">
          {formatClock(left)}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={stop}>
          Stop
        </Button>
      </div>
    </Card>
  );
}
