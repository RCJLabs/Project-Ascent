import { useMemo } from 'react';
import { useObjectives } from '@/store/objectives';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { venueSuggestions, venues, type Venue } from '@/engine/venues';

/**
 * Where you have climbed, read off everything that names a place
 * (PLAN.md M88b).
 *
 * One hook so the three inputs that ask for a location — the logger, a
 * project, an objective — offer the same list. A place typed in one of them
 * is a suggestion in the other two, which is what stops the app holding
 * three unconnected spellings of the same crag.
 */
export function useVenues(): Venue[] {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const objectives = useObjectives((s) => s.objectives);
  return useMemo(
    () => venues({ sessions: Object.values(byDate).flat(), projects, objectives }),
    [byDate, projects, objectives],
  );
}

/** The id a `<datalist>` is attached by. One list, so one id. */
export const VENUE_LIST_ID = 'venues-typed-before';

/**
 * The list itself, rendered beside the input that offers it.
 *
 * Nothing when there is nothing to suggest, which keeps an empty dropdown
 * off a field on a fresh install.
 */
export function VenueOptions({ venues: list }: { venues: readonly Venue[] }) {
  const options = venueSuggestions(list);
  if (options.length === 0) return null;
  return (
    <datalist id={VENUE_LIST_ID}>
      {options.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  );
}
