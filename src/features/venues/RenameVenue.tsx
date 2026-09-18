import { useState } from 'react';
import { useLocation } from 'wouter';
import { Pencil } from 'lucide-react';
import { renameVenue, rewriteSize, venueKey, type Venue } from '@/engine/venues';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field, Input } from '@/ui/Field';
import { allSessions, useSessions } from '@/store/sessions';
import { useProjects } from '@/store/projects';
import { useObjectives } from '@/store/objectives';
import { offerUndo } from '@/store/undo';

/**
 * Telling the app two spellings are one place (PLAN.md M283).
 *
 * `venues.ts` refuses to guess and says why — *"'The Works' and 'Works' may
 * well be the same crag and the app cannot know it"* — and until now the
 * climber had nowhere to answer. This is the answer, and it is a **rename**
 * rather than a stored mapping, for the reasons written at `renameVenue`.
 *
 * ## Its own card, beside the one that explains the limit
 *
 * "Written as" lists the spellings that were folded together and is hidden
 * when there is only one, because a card explaining a merge that did not
 * happen is noise — `venuePage.test.tsx` has held that since M192. This is a
 * different job and is always offered: a place written one way that should
 * have been written another has exactly one spelling.
 *
 * ## It says what it will do before it does it
 *
 * The count is on the button, because this rewrites records and the number is
 * the only warning that it is more than the one you are looking at. A climber
 * who has been to a crag forty times should see "40" before pressing, not
 * afterwards.
 *
 * ## And it can be taken back whole
 *
 * The records are captured before the write, not reconstructed after it: the
 * rewrite touches one field, but putting a field back is not the same as
 * putting the record back, and only one of those is obviously correct a year
 * from now.
 */
export function RenameVenue({ place }: { place: Venue }) {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const objectives = useObjectives((s) => s.objectives);
  const updateSession = useSessions((s) => s.update);
  const updateProject = useProjects((s) => s.update);
  const saveObjective = useObjectives((s) => s.save);
  const [, navigate] = useLocation();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(place.name);
  const [busy, setBusy] = useState(false);

  const log = { sessions: allSessions(byDate), projects, objectives };
  const pending = renameVenue(log, place.key, name);
  const count = rewriteSize(pending);

  async function apply(): Promise<void> {
    setBusy(true);
    try {
      // Captured whole, before anything is written.
      const before = {
        sessions: log.sessions.filter((s) => pending.sessions.some((x) => x.id === s.id)),
        projects: log.projects.filter((p) => pending.projects.some((x) => x.id === p.id)),
        objectives: log.objectives.filter((o) => pending.objectives.some((x) => x.id === o.id)),
      };
      for (const session of pending.sessions) await updateSession(session);
      for (const project of pending.projects) await updateProject(project);
      for (const objective of pending.objectives) await saveObjective(objective);

      offerUndo(
        `${count} record${count === 1 ? '' : 's'}`,
        async () => {
          for (const session of before.sessions) await updateSession(session);
          for (const project of before.projects) await updateProject(project);
          for (const objective of before.objectives) await saveObjective(objective);
        },
        'renamed',
      );
      setOpen(false);
      // The key is the address, so a renamed place lives somewhere else now.
      navigate(`/venues/${encodeURIComponent(venueKey(name))}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Card title="Is this somewhere else?">
        <p className="text-sm text-ink-soft leading-relaxed">
          The app only counts two spellings as one place when capitals and spacing are all that
          differ. If two of your places are really one, give them the same name and they become one.
        </p>
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => setOpen(true)}>
          <Pencil size={14} /> Rename this place
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Rename this place">
      <Field
        label="Call it"
        hint="Every session, project and objective that names this place is rewritten. Give it the name of another place and the two become one."
      >
        {(props) => (
          <Input
            {...props}
            size="compact"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <div className="flex gap-2 mt-3">
        <Button size="sm" disabled={count === 0 || busy} onClick={() => void apply()}>
          Rewrite {count} record{count === 1 ? '' : 's'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setName(place.name); }}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
