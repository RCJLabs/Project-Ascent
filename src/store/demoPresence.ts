import { create } from 'zustand';

/**
 * Whether the sample climber is in the stores, from what they hold
 * (PLAN.md M353).
 *
 * `DemoBanner` used to ask the database, in an effect keyed on the session
 * log. The log is a new object after every write, so every climb added to a
 * session read the whole log back, and for a climber with no sample data
 * every project and every metric too, because `hasDemo` stops only at the
 * first tagged row. It also read the log twice at launch. All of that to
 * answer a question the stores could already answer, since they hold every
 * record.
 *
 * Each store reports on itself when its records change, through a
 * subscription in its own module. So the banner, which sits in the eager
 * shell, needs only this module, and not the projects or metrics stores,
 * which are not in the entry chunk.
 */

export type DemoSource = 'sessions' | 'projects' | 'metrics';

const useDemoPresence = create<Record<DemoSource, boolean>>(() => ({
  sessions: false,
  projects: false,
  metrics: false,
}));

/** Whether any of these records is tagged as sample data. */
export function tagged(rows: readonly { demo?: true }[]): boolean {
  return rows.some((row) => row.demo === true);
}

/** Called by a store when its records change. */
export function noteDemo(source: DemoSource, present: boolean): void {
  if (useDemoPresence.getState()[source] === present) return;
  useDemoPresence.setState((state) => ({ ...state, [source]: present }));
}

/** True while any store holds a record tagged as sample data. */
export function useHasDemo(): boolean {
  return useDemoPresence((state) => state.sessions || state.projects || state.metrics);
}
