import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Check, ChevronRight, Plus, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getMetric } from '@/content/metrics';
import type { Metric, MetricId } from '@/content/types';
import {
  allMetrics,
  assessmentBattery,
  formatEntry,
  parseMetricInput,
  type AssessmentStatus,
} from '@/engine/assessments';
import { shortLabel, today } from '@/engine/dates';
import { V_GRADES, YDS_GRADES } from '@/engine/grades';
import { PageGrid } from '@/ui/PageGrid';
import { useGradeOptions } from '@/ui/useGrade';
import { useMetrics } from '@/store/metrics';
import { useSettings } from '@/store/settings';
import { useProfile } from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { SelectableCard } from '@/ui/Chip';
import { DisclosureButton } from '@/ui/Disclosure';
import { Input, Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';

export function AssessmentsPage() {
  const entries = useMetrics((s) => s.entries);
  const hydrated = useMetrics((s) => s.hydrated);
  const load = useMetrics((s) => s.load);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const [open, setOpen] = useState<MetricId | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const battery = useMemo(
    () => assessmentBattery(entries, { program, startDate }),
    [entries, program, startDate],
  );

  const due = battery.filter((s) => s.due !== null);
  const listed = new Set(battery.map((s) => s.metric.id));
  const rest = allMetrics().filter((m) => !listed.has(m.id));

  return (
    <>
      <PageHeader
        title="Assessments"
        subtitle={
          battery.length === 0
            ? 'Benchmarks you retest over time'
            : due.length === 0
              ? 'All current'
              : `${due.length} due`
        }
      />

      <PageGrid>
        {battery.length === 0 && (
          <Card>
            <p className="text-sm leading-relaxed text-ink-soft">
              Assessments are the numbers a program is trying to move. Start one and its battery
              appears here — or pick a benchmark below and take a baseline today.
            </p>
          </Card>
        )}

        {battery.length > 0 && (
          <Card title={program ? program.name : 'Your benchmarks'}>
            <ul className="grid grid-cols-1 gap-2">
              {battery.map((status) => (
                <MetricRow
                  key={status.metric.id}
                  status={status}
                  open={open === status.metric.id}
                  onToggle={() => setOpen(open === status.metric.id ? null : status.metric.id)}
                />
              ))}
            </ul>
            <p className="text-xs text-ink-soft mt-3">
              Results are keyed to the benchmark, not to the program, so history carries over when
              you switch.
            </p>
          </Card>
        )}

        <Card title="Measure something else">
          {!picking ? (
            <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
              <Plus size={15} /> Add a benchmark
            </Button>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                {rest.map((metric) => (
                  <li key={metric.id}>
                    <SelectableCard
                      selected={false}
                      onClick={() => {
                        setOpen(metric.id);
                        setPicking(false);
                      }}
                      label={metric.label}
                      className="w-full bg-sunken border-transparent px-3 py-2.5"
                    >
                      <div className="font-semibold text-sm">{metric.label}</div>
                      {metric.description && (
                        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{metric.description}</p>
                      )}
                    </SelectableCard>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setPicking(false)}>
                <X size={15} /> Close
              </Button>
            </>
          )}
        </Card>

        {open !== null && !listed.has(open) && (
          <NewBenchmarkCard metricId={open} onDone={() => setOpen(null)} />
        )}
      </PageGrid>
    </>
  );
}

function NewBenchmarkCard({ metricId, onDone }: { metricId: MetricId; onDone: () => void }) {
  const metric = getMetric(metricId);
  if (!metric) return null;
  return (
    <Card title={metric.label}>
      {metric.description && <p className="text-sm text-ink-soft mb-3 leading-relaxed">{metric.description}</p>}
      <ResultForm metric={metric} onDone={onDone} />
    </Card>
  );
}

function MetricRow({
  status,
  open,
  onToggle,
}: {
  status: AssessmentStatus;
  open: boolean;
  onToggle: () => void;
}) {
  const display = useSettings((s) => s.display);
  const { metric, latest, change } = status;
  return (
    <li className="bg-sunken rounded-xl">
      <DisclosureButton open={open} onToggle={onToggle} className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{metric.label}</div>
          <p className="text-xs text-ink-soft mt-0.5">
            {latest ? `${shortLabel(latest.date)}` : 'Never tested'}
            {status.dueLabel ? ` · ${status.dueLabel}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-sm tabular-nums">{latest ? formatEntry(metric, latest, display) : '—'}</div>
          {change && (
            <div
              className={`text-xs font-semibold ${
                change.improved === true ? 'text-positive' : change.improved === false ? 'text-danger' : 'text-ink-soft'
              }`}
            >
              {change.label}
            </div>
          )}
        </div>
        {status.due !== null && (
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-label="Due" />
        )}
      </DisclosureButton>
      {open && (
        <div className="px-3 pb-3">
          <ResultForm metric={metric} onDone={onToggle} />
          {status.series.length > 0 && (
            <Link
              href={`/assessments/${metric.id}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent mt-3"
            >
              History ({status.series.length}) <ChevronRight size={14} />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

export function ResultForm({ metric, onDone }: { metric: Metric; onDone: () => void }) {
  const gradeOptions = useGradeOptions();
  const record = useMetrics((s) => s.record);
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function save(value?: string) {
    const parsed = parseMetricInput(metric, value ?? raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    await record({
      metricId: metric.id,
      date,
      value: parsed.value,
      ...(parsed.display ? { display: parsed.display } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setRaw('');
    setNote('');
    setError(null);
    onDone();
  }

  return (
    <div className="border-t border-line pt-3">
      {metric.kind === 'passfail' ? (
        <div className="flex gap-2 mb-2">
          <Button size="sm" onClick={() => void save('pass')}>
            Pass
          </Button>
          <Button size="sm" variant="outline" onClick={() => void save('fail')}>
            Fail
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 mb-2">
          {metric.kind === 'grade' ? (
            <Select
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-label={`${metric.label} result`}
              className="flex-1 bg-surface" size="compact"
            >
              <option value="">Pick a grade</option>
              {gradeOptions(metric.scale ?? 'V', metric.scale === 'YDS' ? YDS_GRADES : V_GRADES).map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              inputMode={metric.kind === 'number' ? 'decimal' : 'text'}
              placeholder={metric.unit || 'Result'}
              aria-label={`${metric.label} result`}
              className="flex-1 bg-surface"
            />
          )}
          <Button size="sm" onClick={() => void save()}>
            <Check size={15} /> Save
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date tested"
          className="bg-surface" size="compact"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Result note"
          className="flex-1 bg-surface" size="compact"
        />
      </div>
      {error && <p className="text-sm text-danger mt-2">{error}</p>}
      {metric.unit && metric.kind === 'number' && (
        <p className="text-xs text-ink-soft mt-2">Measured in {metric.unit}.</p>
      )}
    </div>
  );
}
