/**
 * Whether the stores a component reads have read the database (PLAN.md M351).
 *
 * The stores hydrate one by one at launch — thirteen reads in parallel, each
 * landing in its own task — and on a warm launch the router mounts Home
 * before most of them have. Everything Home drew from a store that had not
 * landed yet was a claim about an empty profile: *"Nothing planned — no
 * program is running"*, *"Moved from another phone?"* and *"Pick a
 * program"*, on six warm launches of six, for a climber with a block
 * running and a year of sessions. M349 had found the same in the coach and
 * fixed it there; this is the same rule, in one place.
 *
 * Takes the stores themselves rather than their names, so a component asks
 * only about what it already imports — naming a store here would put it in
 * every chunk that asks about any of them. Every store it is given is read
 * on every render, in the order given, which is what makes the loop a fixed
 * list of hooks rather than a conditional one.
 *
 * A failed read sets `hydrated` too, so this cannot wait forever.
 */

type HydratingStore = (select: (state: { hydrated: boolean }) => boolean) => boolean;

export function useLoaded(...stores: HydratingStore[]): boolean {
  let all = true;
  for (const store of stores) {
    // Not `all && store(...)`: that would skip a hook when an earlier store
    // is still loading, and the hooks would change order between renders.
    const loaded = store((state) => state.hydrated);
    all = all && loaded;
  }
  return all;
}
