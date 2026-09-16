import { AlertTriangle } from 'lucide-react';
import type { Metric } from '@/content/types';
import type { BodyPart } from '@/content/bodyParts';
import { describeParts, metricConflict } from '@/engine/bodyLoad';

/**
 * The one prescription the app never warned about (PLAN.md M161).
 *
 * M153 taught the app to read a protocol's authored safety line and show it
 * in the logger. M160 gave the finger gap a voice outside a block. Both of
 * those are about *training*. An assessment is the other thing the app asks
 * a climber to do, and it is the most maximal: `max_hang_20mm_7s` is added
 * weight on a seven-second half-crimp; `min_edge` is the smallest edge you
 * can hold at bodyweight; `front_lever_hold` and `weighted_pullup_3rm` are
 * failure-point efforts through the elbow and shoulder.
 *
 * A test is a maximal effort taken deliberately, on a day chosen for it,
 * usually after a layoff — which is the exact shape of the session people
 * get hurt in. The app holds an injury tracker, a return-to-climbing plan
 * and a body page, and a climber who had told it their finger was hurt could
 * walk into a max hang with nothing said.
 *
 * ## What it does not do
 *
 * It does not block, and it does not prescribe. `returnToClimbing.ts` sets
 * the rule the whole app follows — *nothing here prescribes an exercise, a
 * dose or a load for an injury* — so this says what the test loads, that the
 * climber has told the app it is hurt, and stops. The decision is theirs and
 * the app is not their physio.
 *
 * It also says nothing about a metric that is a *record* rather than a test.
 * A redpoint grade names no movement, so it reads as no parts and warns
 * about nothing — no list of which metrics are tests has to be kept true.
 */
export function TestSafety({
  metric,
  injured,
  compact = false,
}: {
  metric: Pick<Metric, 'label' | 'description'>;
  injured: readonly BodyPart[];
  /** The list, where one line is all there is room for. */
  compact?: boolean;
}) {
  const finding = metricConflict(metric, injured);
  if (finding === null) return null;

  // `firstConflict` has already narrowed `parts` to the ones the climber
  // reported, so a max hang meets a hurt pulley as "your pulley" rather than
  // "your fingers and pulley". Filtering again here looked careful and was
  // dead code — the battery said so by deleting it and changing nothing.
  // No verb to agree, deliberately. "your fingers is hurt" was what the
  // first draft rendered — `fingers` is the one plural in `BodyPart`, so
  // agreeing with the *count of parts* is wrong for it whichever way the
  // count goes, and agreeing with the word would mean a table of them.
  const list = describeParts(finding.parts);

  if (compact) {
    return (
      <p className="text-xs text-warn flex items-center gap-1.5 mt-1">
        <AlertTriangle size={12} className="shrink-0" aria-hidden />
        {list.replace('your', 'Loads your')}
      </p>
    );
  }

  return (
    <div role="note" className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2.5">
      <p className="text-2xs font-bold uppercase tracking-wide text-warn flex items-center gap-1.5">
        <AlertTriangle size={13} className="shrink-0" aria-hidden />
        Before you test
      </p>
      <p className="text-sm text-ink mt-1 leading-relaxed">
        You have told the app about {list}, and {finding.because}. A test is a maximal effort by
        design — it is the one session where the plan is to find the limit — so it is the worst
        day to find out.
      </p>
      <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
        Nothing here is blocked and this is not medical advice. Retest when it has settled, and the
        number will mean something either way.
      </p>
    </div>
  );
}
