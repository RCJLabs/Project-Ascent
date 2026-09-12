import { useMemo } from 'react';
import { DRILL_CATEGORIES, getDrill } from '@/content/drills';
import { drillCoaching } from '@/content/drillCoaching';
import { PROTOCOLS } from '@/content/protocols';
import { EQUIPMENT_LABELS } from '@/engine/customProgram';
import type { DrillId } from '@/content/types';
import { today } from '@/engine/dates';
import { describeRecord, drillHistory, prescribedBy } from '@/engine/drillHistory';
import { useSessions } from '@/store/sessions';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { PageSkeleton } from '@/ui/Skeleton';

/**
 * A bulleted list of short coaching lines.
 *
 * Three lists on this page render identically — the drill's cues, its
 * faults and the protocol's cues — and they did not before M107b, when
 * there was only one.
 */
function Lines({ items, tone }: { items: string[]; tone?: 'warn' }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {items.map((line) => (
        <li key={line} className="text-sm leading-relaxed flex gap-2">
          <span className={tone === 'warn' ? 'text-warn' : 'text-accent'} aria-hidden>
            ·
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One drill, and the climber's own record with it (PLAN.md M107).
 *
 * **The description is not a stub.** M107's premise is that "a drill is a
 * paragraph" and the library stays thin until cues and faults are written
 * for all 144. Read, the paragraphs already carry the method and the fault
 * — *"If you catch yourself adjusting, downclimb and restart"* — so this
 * page shows them as the instructions they are rather than as a summary
 * waiting to be replaced.
 *
 * What was missing is underneath: how many times the app has put this in
 * front of you, and how many of those you did.
 */
export function DrillPage({ params }: { params: { id: string } }) {
  const byDate = useSessions((s) => s.byDate);
  const ready = useSessions((s) => s.hydrated);
  const drill = getDrill(params.id as DrillId);

  const record = useMemo(() => {
    if (!drill) return null;
    return drillHistory({ sessions: Object.values(byDate).flat(), today: today() }).get(drill.id) ?? null;
  }, [byDate, drill]);

  if (!ready) return <PageSkeleton title="Drill" />;
  if (!drill) {
    return (
      <RecordNotFound what="That drill" backTo="/drills" backLabel="Back to the drills">
        The library changes between versions; this one may have been renamed.
      </RecordNotFound>
    );
  }

  const said = describeRecord(record);
  const programs = prescribedBy(drill.sources);
  const protocol = drill.protocolId ? PROTOCOLS[drill.protocolId] : undefined;
  const kit = drill.equipment.filter((e) => e !== 'none');
  // A static import, and it stays one: this route is lazy, so the coaching
  // for all 144 rides in this page's chunk rather than in every cold start.
  // `drillCoaching.test.ts` holds the split; `perf.test.ts` holds the number.
  const coaching = drillCoaching(drill.id);
  const cues = coaching?.cues ?? [];
  const faults = coaching?.faults ?? [];

  return (
    <>
      <BackLink />
      <PageHeader title={drill.name} subtitle={`${drill.focus} · ${drill.level}`} />

      <div className="grid grid-cols-1 gap-3">
        <Card title="How to run it">
          <p className="text-sm leading-relaxed whitespace-pre-line">{drill.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[
              DRILL_CATEGORIES[drill.category].label,
              drill.duration,
              drill.discipline === 'both' ? 'Boulder or route' : drill.discipline === 'boulder' ? 'Boulder' : 'Route',
              ...kit.map((e) => EQUIPMENT_LABELS[e]),
            ].map((tag) => (
              <span
                key={tag}
                className="text-2xs font-bold uppercase tracking-wide rounded-md px-1.5 py-1 bg-sunken text-ink-soft"
              >
                {tag}
              </span>
            ))}
          </div>
          {kit.length === 0 && (
            <p className="text-xs text-ink-soft mt-2">Needs nothing but somewhere to climb.</p>
          )}
        </Card>

        {/* The drill's own cues, above the protocol's (PLAN.md M107b).
            Eleven of the 144 carry a `protocolId`, and where both exist the
            protocol's are about the *method* — the edge, the rest, the RPE —
            while these are about this drill on this wall. Specific first. */}
        {cues.length > 0 && (
          <Card title="Cues">
            <Lines items={cues} />
          </Card>
        )}

        {/* Separate card, not a second list inside Cues. A climber opens
            this page either to run the drill or to work out why it is not
            working, and those are two different visits. */}
        {faults.length > 0 && (
          <Card title="Where it goes wrong">
            <Lines items={faults} tone="warn" />
          </Card>
        )}

        {protocol !== undefined && protocol.cues.length > 0 && (
          <Card title={cues.length > 0 ? `Cues for ${protocol.name}` : 'Cues'}>
            {/* The drill *is* a named method, so its protocol's cues are the
                drill's cues — written already, and read here rather than
                repeated. Eleven of the 144 are like this. The title says
                which method only when there is another list to tell it
                apart from; on its own, "Cues" is what the reader wants. */}
            <Lines items={protocol.cues} />
          </Card>
        )}

        {/* The part that did not exist anywhere (PLAN.md M107). */}
        {said !== null && (
          <Card title="You and this drill">
            <p className="text-sm leading-relaxed">{said}</p>
            {record !== null && record.done === 0 && record.given >= 2 && (
              <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                A drill that keeps coming up and keeps not happening is usually the wrong drill for
                the session it lands in, not a failure of will. It can be swapped in the builder.
              </p>
            )}
          </Card>
        )}

        {programs.length > 0 && (
          <Card title="Where it comes from">
            <p className="text-sm text-ink-soft leading-relaxed">
              Prescribed by {programs.join(', ')}.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
