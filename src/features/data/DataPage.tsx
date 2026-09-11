import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Check, Sparkles, TriangleAlert } from 'lucide-react';
import { readDbHealth, type DbHealth } from '@/db/health';
import { sweepOrphanMedia } from '@/db/media';
import { fromKey } from '@/engine/dates';
import { elapsedMs, staleSessions } from '@/engine/live';
import { formatBytes } from '@/engine/offline';
import {
  countOf,
  dataHealth,
  describeHealth,
  describeStale,
  type Finding,
} from '@/engine/dataHealth';
import { useSessions } from '@/store/sessions';
import { announce } from '@/ui/Announce';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';
import { useStoragePressure } from '@/ui/StorageWarning';

/**
 * What the app is holding, and whether any of it is in trouble (PLAN.md M80).
 *
 * A page you visit on purpose, which is the whole point — see
 * `engine/dataHealth.ts` for why four of these five checks already existed
 * and still left a climber unable to ask "is everything alright?".
 *
 * Read at mount and after a tidy-up, not subscribed: these are counts over
 * the whole database, and a page that re-counted on every keystroke
 * elsewhere in the app would be paying for a number nobody is watching.
 */
export function DataPage() {
  const [db, setDb] = useState<DbHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const byDate = useSessions((s) => s.byDate);
  const pressure = useStoragePressure();

  const refresh = useCallback(() => {
    void readDbHealth().then(setDb);
  }, []);
  useEffect(refresh, [refresh]);

  const stale = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    return staleSessions(sessions).map((s) => ({ id: s.id, date: s.date, ms: elapsedMs(s) }));
  }, [byDate]);

  if (!db) return <PageSkeleton title="Your data" />;

  const health = dataHealth({ ...db, stale, pressure });

  async function tidy() {
    setBusy(true);
    try {
      const swept = await sweepOrphanMedia();
      const said =
        swept === 0
          ? 'Nothing to tidy up.'
          : `Deleted ${countOf(swept, 'media')} that belonged to something already gone.`;
      setDone(said);
      announce(said);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const fixable = health.findings.some((f) => f.fixable);

  return (
    <>
      <BackLink />
      <PageHeader title="Your data" subtitle={describeHealth(health)} />

      {health.findings.length === 0 ? (
        <Card>
          <p className="text-sm flex items-start gap-2">
            <Check size={16} className="text-positive shrink-0 mt-0.5" />
            {/* Said rather than left blank. An empty page reads the same
                whether everything is fine or nothing was checked. */}
            <span>
              Every record is readable, no photos are orphaned, no session is left open, and the
              browser has room. This is what the app can check — it cannot tell you whether what
              you logged was true.
            </span>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {health.findings.map((finding) => (
            <FindingCard key={finding.kind} finding={finding} />
          ))}
        </div>
      )}

      {stale.length > 0 && (
        <Card title="Sessions left open" className="mt-3">
          <ul className="grid grid-cols-1 gap-2">
            {stale.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/log/${session.date}`}
                  className="flex items-baseline justify-between gap-3 text-sm py-1"
                >
                  <span className="font-semibold">
                    {fromKey(session.date).toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span className="text-ink-soft shrink-0">{describeStale(session)} on the clock</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* The live bar shows these one at a time — `staleSessions[0]` — so
              a climber with three of them fixes one and meets the next. */}
          <p className="text-xs text-ink-soft mt-2 leading-relaxed">
            Open each one and finish it, or throw it away. The bar at the top of the app offers
            them one at a time; this is all of them.
          </p>
        </Card>
      )}

      <Card title="What is stored" className="mt-3">
        <table className="w-full text-sm">
          <caption className="sr-only">Records held on this device, by kind</caption>
          <thead>
            <tr className="text-2xs uppercase tracking-widest text-ink-soft">
              <th scope="col" className="text-left font-bold py-1">Kind</th>
              <th scope="col" className="text-right font-bold py-1">Records</th>
            </tr>
          </thead>
          <tbody>
            {health.rows.map((row) => (
              <tr key={row.store} className="border-t border-line">
                <th scope="row" className="text-left font-normal py-1.5">
                  {row.label}
                  {(row.dropped > 0 || row.repaired > 0) && (
                    <span className="text-warn text-xs ml-2">
                      {row.dropped > 0 && `${row.dropped} unreadable`}
                      {row.dropped > 0 && row.repaired > 0 && ' · '}
                      {row.repaired > 0 && `${row.repaired} repaired`}
                    </span>
                  )}
                </th>
                <td className="py-1.5 text-right tabular-nums font-semibold">
                  {row.count.toLocaleString()}
                  {row.bytes !== undefined && row.count > 0 && (
                    <span className="text-ink-soft font-normal"> · {formatBytes(row.bytes)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Tidy up" className="mt-3">
        <p className="text-sm text-ink-soft mb-3 leading-relaxed">
          {fixable
            ? 'Deletes photos whose session or project is already gone. Nothing you can still reach is touched.'
            : 'There is nothing to collect right now. This deletes photos whose session or project is already gone, once no undo could still want them back.'}
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void tidy()}>
          <Sparkles size={15} /> {busy ? 'Tidying…' : 'Tidy up'}
        </Button>
        {done && (
          <p className="text-sm text-positive mt-2" role="status">
            {done}
          </p>
        )}
      </Card>

      <Card className="mt-3">
        <p className="text-sm text-ink-soft leading-relaxed">
          Everything here lives on this device and nowhere else.{' '}
          <Link href="/settings" className="text-accent font-semibold">
            Export a backup
          </Link>{' '}
          regularly — it is the only copy there will ever be.
        </p>
      </Card>
    </>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const Icon = finding.tone === 'warn' ? TriangleAlert : AlertTriangle;
  return (
    <Card>
      <div className="flex items-start gap-2">
        <Icon
          size={16}
          className={`shrink-0 mt-0.5 ${finding.tone === 'warn' ? 'text-danger' : 'text-warn'}`}
        />
        <div className="min-w-0">
          <p className="font-bold text-sm">{finding.headline}</p>
          <p className="text-sm text-ink-soft mt-1 leading-relaxed">{finding.detail}</p>
        </div>
      </div>
    </Card>
  );
}
