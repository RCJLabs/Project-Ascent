import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Ruler, Search } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { blockEnd, describeBlockEnd } from '@/engine/blockEnd';
import { describeBlock } from '@/engine/blockReport';
import { formatEntry } from '@/engine/assessments';
import { fromKey, today } from '@/engine/dates';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { PageGrid } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';
import { BlockReportChart, BlockReportRest } from '@/ui/charts/BlockReportChart';

/**
 * The end of a block (PLAN.md M85).
 *
 * Everything on this page already existed and was unreachable from where a
 * climber actually is. `intro.graduation` and `nextPrograms` — a reason
 * authored per destination — were drawn only on the catalogue detail page,
 * which is where you go to *choose* a program, not where you are when one
 * runs out. The M84 comparison lives on the assessments page, which is
 * where you go to log a number.
 *
 * **It does not congratulate.** A climber who trained every week and one
 * who stopped in week six and let the calendar run out both arrive here,
 * and the app cannot tell them apart — `describeBlockEnd` says so in as
 * many words rather than guessing.
 */

export function FinishPage() {
  const entries = useMetrics((s) => s.entries);
  const metricsReady = useMetrics((s) => s.hydrated);
  const loadMetrics = useMetrics((s) => s.load);
  const profileReady = useProfile((s) => s.hydrated);
  const display = useSettings((s) => s.display);
  const units = useSettings((s) => s.units);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);

  useEffect(() => {
    if (!metricsReady) void loadMetrics();
  }, [metricsReady, loadMetrics]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;

  const end = useMemo(
    () => (program && startDate ? blockEnd({ program, startDate, entries, today: today() }) : null),
    [program, startDate, entries],
  );

  if (!metricsReady || !profileReady) return <PageSkeleton />;

  if (end === null) {
    return (
      <>
        <BackLink />
        <PageHeader title="Block review" />
        <PageGrid>
          <EmptyState>
            No program is running, so there is no block to review. Start one and this page fills in
            as it goes.
          </EmptyState>
        </PageGrid>
      </>
    );
  }

  const { status, report, graduation, owed, next } = end;
  const when = fromKey(status.to).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <BackLink />
      <PageHeader
        title={end.program.name}
        subtitle={status.state === 'ended' ? `Ran to ${when}` : `Runs to ${when}`}
      />

      <PageGrid>
        <Card>
          <p className="text-sm leading-relaxed">{describeBlockEnd(end)}</p>
        </Card>

        {report !== null && report.comparable.length + report.results.length > 0 && (
          <Card title="What moved">
            <BlockReportChart report={report} />
            <BlockReportRest report={report} />
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeBlock(report)}</p>
          </Card>
        )}

        {/* The reason the final test week exists. Named rather than counted:
            "you owe three retests" is not a thing anyone can act on. */}
        {owed.length > 0 && (
          <Card title={owed.length === 1 ? 'The retest you owe' : 'The retests you owe'}>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              {owed.length === 1 ? 'This one has' : 'These have'} a baseline from the start of the
              block and nothing to put beside it. Taking{' '}
              {owed.length === 1 ? 'it' : 'them'} now is what turns the block into a measurement.
            </p>
            <ul className="grid grid-cols-1 gap-2">
              {owed.map((row) => (
                <li key={row.metric.id}>
                  <Link
                    href="/assessments"
                    className="focus-ring flex items-center gap-3 bg-sunken rounded-xl p-3"
                  >
                    <Ruler size={16} className="text-accent shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold text-sm block truncate">{row.metric.label}</span>
                      <span className="text-xs text-ink-soft">
                        {row.baseline
                          ? `Baseline ${formatEntry(row.metric, row.baseline, display, units)}`
                          : 'No baseline'}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-ink-soft shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {graduation !== '' && (
          <Card title="What this block was for">
            <p className="text-sm leading-relaxed">{graduation}</p>
          </Card>
        )}

        {next.length > 0 && (
          <Card title="What comes next">
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              Written into {end.program.name} itself — each one with the reason it follows this
              block rather than another.
            </p>
            <ul className="grid grid-cols-1 gap-2">
              {next.map((step) => (
                <li key={step.program.id}>
                  <Link
                    href={`/train/${step.program.id}`}
                    className="focus-ring block bg-sunken rounded-xl p-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">{step.program.name}</span>
                      <span className="text-xs text-ink-soft shrink-0 ml-auto">
                        {step.program.weeks} weeks
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{step.reason}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Or start from your own numbers">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            The finder reads what you have logged rather than asking again — your grades come from
            the log, and the entry standards from your benchmarks.
          </p>
          <Link href="/find">
            <Button variant="outline" className="w-full">
              <Search size={16} /> Find my next program
            </Button>
          </Link>
        </Card>
      </PageGrid>
    </>
  );
}
