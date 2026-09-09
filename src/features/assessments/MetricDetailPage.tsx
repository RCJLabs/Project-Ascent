import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { getMetric } from '@/content/metrics';
import type { MetricId } from '@/content/types';
import { changeOf, formatEntry, isChartable, seriesFor } from '@/engine/assessments';
import { shortLabel } from '@/engine/dates';
import { useMetrics } from '@/store/metrics';
import { Card } from '@/ui/Card';
import { ProgressionLine } from '@/ui/charts/Charts';
import { ResultForm } from './AssessmentsPage';

export function MetricDetailPage({ params }: { params: { id: string } }) {
  const entries = useMetrics((s) => s.entries);
  const hydrated = useMetrics((s) => s.hydrated);
  const load = useMetrics((s) => s.load);
  const remove = useMetrics((s) => s.remove);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const metric = getMetric(params.id as MetricId);
  const series = useMemo(
    () => (metric ? seriesFor(entries, metric.id) : []),
    [entries, metric],
  );

  if (!metric) {
    return (
      <Card>
        <p className="text-sm text-ink-soft mb-3">No such benchmark.</p>
        <Link href="/assessments" className="text-sm font-semibold text-accent">
          Back to assessments
        </Link>
      </Card>
    );
  }

  const change = changeOf(metric, series);
  const first = series[0];
  const latest = series.at(-1);
  const overall = first && latest && first !== latest ? latest.value - first.value : null;
  const points = series.map((e) => ({
    week: e.date,
    value: e.value,
    display: formatEntry(metric, e),
  }));

  return (
    <>
      <Link href="/assessments" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Assessments
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-black tracking-tight">{metric.label}</h1>
        <p className="text-sm text-ink-soft mt-0.5">
          {metric.unit ? `Measured in ${metric.unit}. ` : ''}
          {metric.higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3">
        {metric.description && (
          <Card>
            <p className="text-sm leading-relaxed">{metric.description}</p>
          </Card>
        )}

        {isChartable(metric) && points.length >= 2 && (
          <Card title="History">
            <ProgressionLine
              points={points}
              label={`${metric.label} over time`}
              formatValue={(v) => formatEntry(metric, { metricId: metric.id, date: '', value: v })}
            />
            {overall !== null && (
              <p className="text-xs text-ink-soft mt-2">
                {overall === 0
                  ? `Level with your first result on ${shortLabel(first!.date)}.`
                  : `${metric.higherIsBetter === overall > 0 ? 'Improved' : 'Down'} from ${formatEntry(metric, first!)} on ${shortLabel(first!.date)}.`}
              </p>
            )}
          </Card>
        )}

        <Card title="Log a result">
          <ResultForm metric={metric} onDone={() => undefined} />
        </Card>

        <Card title={`Results (${series.length})`}>
          {series.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing recorded yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {[...series].reverse().map((entry, i) => (
                <li key={entry.date} className="flex items-start gap-2 bg-sunken rounded-xl px-3 py-2.5">
                  <span className="text-xs text-ink-soft w-16 shrink-0 mt-0.5">{shortLabel(entry.date)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{formatEntry(metric, entry)}</div>
                    {entry.note && <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{entry.note}</p>}
                  </div>
                  {i === 0 && change && (
                    <span
                      className={`text-xs font-semibold shrink-0 mt-0.5 ${
                        change.improved === true
                          ? 'text-positive'
                          : change.improved === false
                            ? 'text-danger'
                            : 'text-ink-soft'
                      }`}
                    >
                      {change.label}
                    </span>
                  )}
                  <button
                    onClick={() => void remove(metric.id, entry.date)}
                    className="text-ink-soft shrink-0 p-0.5 -m-0.5 mt-0.5"
                    aria-label={`Delete the ${shortLabel(entry.date)} result`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
