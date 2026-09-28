/**
 * The address of a day's log (PLAN.md M345).
 *
 * Out of `routes.ts`, the route table, which the first load carried whole
 * for this one function: Home's heading and the live bar link to today's
 * log at boot. The table is read by the back link and search, both lazy,
 * and goes with them.
 */

/**
 * Where a day's log lives.
 *
 * Every day, including today (PLAN.md M124). It took a `todayKey` from
 * M117 to M123, when today's log was Home and this was the one place that
 * knew; Home shows the card and the log is a page again, so there is one
 * address per day and no rule left to encode. The helper stays because the
 * shape of the address is still worth writing once.
 */
export function logHref(date: string): string {
  return `/log/${date}`;
}
