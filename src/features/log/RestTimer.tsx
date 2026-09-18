import { useEffect, useState } from 'react';
import { REST_PRESETS, restLabel, restRemaining } from '@/engine/gym';
import { formatCountdown } from '@/engine/live';
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
  /**
   * The end time that has actually arrived, rather than a flag saying one has
   * (PLAN.md M266).
   *
   * `now` is the page's clock and it moves once a second, on a grid set by
   * when the logger mounted — which has nothing to do with when the climber
   * tapped "3 min". So the rest used to finish at the first tick *after* it
   * was over: measured in a browser, the beep, the announcement and the
   * presets all arrived 1020ms late on a rest that had genuinely ended. A
   * timer whose whole job is the length of a rest cannot round its own end
   * up to the next second, so there is a timeout for the exact remainder.
   *
   * Holding the end time and not a boolean is what makes the next rest safe.
   * A flag has to be lowered by whoever starts one, and the render that
   * hands this the new rest still carries the old flag — which beeped "rest
   * over" the instant a second rest was started, found by the test below
   * before this comment was written. An end time left over from a rest that
   * is gone is always earlier than the one that is here, because a rest
   * that finished did so before this one was started.
   *
   * Compared with `>=` and not `===`. A browser fires a timeout a little
   * after its due time and a throttled tab much later, so the only exact
   * number available is the one that was asked for — and a version of this
   * that recorded the firing time instead would read as "not over yet"
   * forever, quietly falling back to the tick this exists to replace. jsdom
   * fires timers exactly on time and cannot tell the two apart, so the
   * comparison is written to make both of them right.
   */
  const [reached, setReached] = useState<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    // No branch for a rest that is already over: `loadRest` refuses an end
    // time that has passed and `start` only ever sets one in the future, so
    // there is always something to wait for. That is the same rule the cue
    // effect below leans on, and guarding it twice more is what the two
    // guards deleted from this file in M266 were doing.
    const id = setTimeout(() => setReached(rest.endsAt), rest.endsAt - Date.now());
    return () => clearTimeout(id);
  }, [rest]);

  const over = rest !== null && reached !== null && reached >= rest.endsAt;

  /**
   * A sixty-second rest never has sixty-one seconds left.
   *
   * `now` is sampled by the page once a second, so the render caused by the
   * *tap* still carries the previous tick — up to a second behind the
   * `Date.now()` the end time was just built from. Ticks land fresh and this
   * changes nothing for them; without it the first frame of a rest rounds up
   * to one second more than the chip the climber pressed. `seconds` is
   * stored for exactly this: what was asked for.
   */
  const left = rest && !over ? Math.min(restRemaining(rest.endsAt, now), rest.seconds * 1000) : 0;

  useEffect(() => {
    if (!rest) return;
    if (left > 0) {
      // The last three seconds, once each.
      if (left <= 3000) cueCountdown();
      return;
    }
    cueDone();
    announce('Rest over.');
    // Said once because `left` is a dependency and stops moving at zero:
    // the page keeps ticking, `restRemaining` keeps clamping, and React
    // does not re-run an effect whose dependencies did not change.
    //
    // Nothing is cleared here either. `loadRest` refuses an end time that
    // has already passed, so a finished rest cannot come back whether the
    // key is there or not — and a clearRest() on this path survived being
    // deleted, which is what a second guard on the same rule looks like.
    // A `fired` ref sat here until M266 and was the same thing a third
    // time: it survived deletion, and the one case that could reach it —
    // a phone's clock stepping backwards, which puts time back on a
    // finished rest — is a case where the beep *should* sound again.
  }, [rest, left]);

  function start(seconds: number) {
    // Audio on a phone only plays after a gesture; this is the gesture.
    unlock();
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
          {formatCountdown(left)}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={stop}>
          Stop
        </Button>
      </div>
    </Card>
  );
}
