import { Circle } from 'lucide-react';
import { quietestLoaded, type TissueLoad, type TissueShare } from '@/engine/tissueLoad';

/**
 * Which tissue has been taking the work (PLAN.md M27).
 *
 * Ordered heaviest first, and every part is listed whether or not anything
 * touched it — a missing row is indistinguishable from a zero row, and what
 * is *not* being loaded is half the reason to look.
 *
 * **Three columns, because "how much" is not the whole question.** A tissue
 * can be quiet because nothing trained it or because nothing in the log
 * named it, and the days-since column is what separates "nothing for three
 * weeks" from "never seen". A bar alone would average the two into one grey
 * answer.
 *
 * The quietest *loaded* tissue is marked with a ring and named in the
 * caption — position and text, not colour, never a tissue the scan simply
 * did not see, and never one that merely came last in a tie.
 *
 * The label column is `w-24` rather than `w-16`: bold plus the ring pushed
 * "shoulder" past 64px and the bar overlapped it. Rem-based, so it still
 * holds at the largest text size.
 */

function Row({ share, quiet }: { share: TissueShare; quiet: boolean }) {
  const seen = share.sessions > 0;
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="w-24 shrink-0 flex items-center gap-1">
        {quiet && <Circle size={9} className="text-ink shrink-0" aria-hidden />}
        <span className={quiet ? 'font-bold' : ''}>{share.part}</span>
      </span>
      <span className="flex-1 min-w-0 h-2.5 rounded-full bg-sunken overflow-hidden">
        <span
          className="block h-full rounded-full bg-viz-1"
          style={{ width: `${Math.max(seen ? 3 : 0, share.share * 100)}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right text-2xs text-ink-soft tabular-nums">
        {share.daysSinceLoaded === null
          ? 'not seen'
          : share.daysSinceLoaded === 0
            ? 'today'
            : `${share.daysSinceLoaded}d ago`}
      </span>
    </li>
  );
}

export function TissueBars({ load }: { load: TissueLoad }) {
  const quiet = quietestLoaded(load);

  return (
    <figure className="m-0">
      <ul className="grid grid-cols-1 gap-1.5" aria-hidden>
        {load.parts.map((share) => (
          <Row key={share.part} share={share} quiet={share.part === quiet?.part} />
        ))}
      </ul>

      {/* The same three columns, as a table. The list above is `aria-hidden`
          rather than duplicated into labels: nine rows of "shoulder, 78
          percent, 2 days ago" read out as prose is worse than a table a
          screen reader can navigate by column. */}
      <div className="sr-only">
        <table>
          <caption>
            What your training loaded over the last four weeks, heaviest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Tissue</th>
              <th scope="col">Share of the busiest</th>
              <th scope="col">Last loaded</th>
            </tr>
          </thead>
          <tbody>
            {load.parts.map((share) => (
              <tr key={share.part}>
                <th scope="row">{share.part}</th>
                <td>{share.sessions === 0 ? 'nothing seen' : `${Math.round(share.share * 100)}%`}</td>
                <td>
                  {share.daysSinceLoaded === null
                    ? 'not in this window'
                    : `${share.daysSinceLoaded} days ago`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * The caveat, in the open.
 *
 * `bodyLoad.ts` is a keyword scan and says so at length. Presenting its
 * output without saying that would let a relative picture read as a
 * measurement, and a climber deciding whether their elbow has had enough
 * rest deserves to know the app is reading their own words back rather than
 * measuring anything.
 */
export function TissueNote({ load }: { load: TissueLoad }) {
  return (
    <p className="text-xs text-ink-soft mt-3 leading-relaxed">
      Read from what you logged — session notes, the exercises you ticked, and the fact that
      climbing loads fingers. It is a reading of your own words, not a measurement, so a session
      you described in no detail counts for less than it should.
      {load.unreadSessions > 0 && (
        <>
          {' '}
          {load.unreadSessions} of {load.sessionCount} sessions said nothing this scan could place.
        </>
      )}
    </p>
  );
}
