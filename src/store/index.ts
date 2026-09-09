import { useGame } from './game';
import { useMetrics } from './metrics';
import { hydrateProfile } from './profile';
import { useProjects } from './projects';
import { useTemplates } from './templates';
import { useSessions } from './sessions';
import { hydrateSettings } from './settings';

/**
 * Load every store from IndexedDB.
 *
 * One list, called at boot and again after an import. Before this, importing
 * a backup wrote the database and left the in-memory stores showing the old
 * data until the climber happened to reload — the app quietly disagreeing
 * with its own storage, which is precisely the class of bug the prototype
 * was full of (AUDIT.md §8).
 */
export async function hydrateAll(): Promise<void> {
  await Promise.all([
    hydrateSettings(),
    hydrateProfile(),
    useSessions.getState().load(),
    useMetrics.getState().load(),
    useGame.getState().load(),
    useProjects.getState().load(),
    useTemplates.getState().load(),
  ]);
}
