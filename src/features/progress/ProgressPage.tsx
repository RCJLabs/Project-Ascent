import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Activity, AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Info, Ruler, TrendingDown } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { assessmentBattery } from '@/engine/assessments';
import { buildJournal } from '@/engine/journal';
import { deriveClimberState, type AcwrZone } from '@/engine/derive';
import { projectGrade, pyramid, weeklyProgression } from '@/engine/progress';
import { useMetrics } from '@/store/metrics';
import { useProjects } from '@/store/projects';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { TrainingState } from './TrainingState';
import { LoadBars, ProgressionLine, PyramidBars } from '@/ui/charts/Charts';

/** Status presentation for ACWR. Colour never carries the meaning alone —
 *  every zone ships with an icon and a sentence. */
const ZONE: Record<AcwrZone, { label: string; note: string; color: string; Icon: typeof Info }> = {
  unknown: {
    label: 'Not enough history',
    note: 'Three weeks of logged sessions and this becomes meaningful.',
    color: 'var(--c-ink-soft)',
    Icon: Info,
  },
  detraining: {
    label: 'Load dropping',
    note: 'You are training well below your recent baseline. Fine after a trip or illness; worth noticing otherwise.',
    color: 'var(--viz-warning)',
    Icon: TrendingDown,
  },
  optimal: {
    label: 'In the sweet spot',
    note: 'Your recent load sits close to what you are used to. This is where adaptation happens.',
    color: 'var(--viz-good)',
    Icon: CheckCircle2,
  },
  caution: {
    label: 'Ramping quickly',
    note: 'You are training noticeably harder than your baseline. Sustainable briefly, not for weeks.',
    color: 'var(--viz-serious)',
    Icon: AlertTriangle,
  },
  danger: {
    label: 'Load spike',
    note: 'A jump this size is the pattern most associated with injury. Consider an easier week.',
    color: 'var(--viz-critical)',
    Icon: AlertTriangle,
  },
};

/** Entry point into the journal, counting what there is to read. */
function JournalCard() {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const metrics = useMetrics((s) => s.entries);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const journal = useMemo(
    () => buildJournal({ sessions, projects, metrics }),
    [sessions, projects, metrics],
  );

  return (
    <Card title="Journal">
      <Link href="/journal" className="flex items-center gap-3">
        <BookOpen size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {journal.length === 0
              ? 'Nothing written yet'
              : `${journal.length} entr${journal.length === 1 ? 'y' : 'ies'}`}
          </p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {journal[0] ? journal[0].text : 'Session notes, beta and test notes, searchable.'}
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}

/** Name a few, then count the rest — a ten-item list reads as noise. */
function dueSummary(due: { metric: { label: string } }[]): string {
  const named = due.slice(0, 3).map((s) => s.metric.label).join(', ');
  const rest = due.length - 3;
  return rest > 0 ? `${named}, and ${rest} more` : named;
}

/** Entry point into the assessment battery, showing only what is due. */
function AssessmentsCard() {
  const entries = useMetrics((s) => s.entries);
  const hydrated = useMetrics((s) => s.hydrated);
  const load = useMetrics((s) => s.load);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);

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

  return (
    <Card title="Assessments">
      <Link href="/assessments" className="flex items-center gap-3">
        <Ruler size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {battery.length === 0
              ? 'Take a baseline'
              : due.length === 0
                ? `${battery.length} benchmark${battery.length === 1 ? '' : 's'}, all current`
                : `${due.length} due to test`}
          </p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {due.length > 0 ? dueSummary(due) : 'Numbers your program is trying to move.'}
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

export function ProgressPage() {
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const [scale, setScale] = useState<GradeScale>('V');

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const weeklyTarget = useMemo(() => {
    const c = program?.constraints.find((x) => x.kind === 'sessions-per-week');
    return c && c.kind === 'sessions-per-week' ? c.min : 3;
  }, [program]);

  const state = useMemo(
    () => deriveClimberState(sessions, { weeklyTarget }),
    [sessions, weeklyTarget],
  );
  const points = useMemo(() => weeklyProgression(sessions, scale, 12), [sessions, scale]);
  const projection = useMemo(() => projectGrade(points, scale), [points, scale]);
  const tally = scale === 'V' ? state.boulder : state.sport;
  const rows = useMemo(() => pyramid(tally, scale), [tally, scale]);
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;

  if (state.completedSessions === 0) {
    return (
      <>
        <PageHeader title="Progress" />
        <div className="grid gap-3">
          <Card>
            <p className="text-sm text-ink-soft">
              Nothing logged yet. Once you have a few sessions in, this is where your grades, training
              load, and trends show up.
            </p>
          </Card>
          {/* Assessments need no session history, and taking a baseline before
              you start training is the point of them. */}
          <AssessmentsCard />
          <JournalCard />
        </div>
      </>
    );
  }

  const zone = ZONE[state.load.zone];
  const acwr = state.load.acwr;

  return (
    <>
      <PageHeader title="Progress" subtitle={`${state.completedSessions} sessions logged`} />

      <div className="grid gap-3">
        <TrainingState state={state} sessions={sessions} program={program} scale={scale} />

        <Card>
          <div className="flex gap-5 flex-wrap">
            <Stat label="Sessions" value={String(state.completedSessions)} sub={`${state.recentSessions} in 30 days`} />
            <Stat label="Streak" value={`${state.streakWeeks}w`} sub={`${weeklyTarget}+ per week`} />
            <Stat label="Sends" value={String(state.boulder.totalSends + state.sport.totalSends)} />
            <Stat label="Hours" value={String(Math.round(state.totalMinutes / 60))} />
          </div>
        </Card>

        <Card title="Training load">
          <div className="flex items-start gap-3 mb-3">
            <zone.Icon size={20} style={{ color: zone.color }} className="shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold">{zone.label}</span>
                {acwr !== null && (
                  <span className="text-sm text-ink-soft tabular-nums">ratio {acwr.toFixed(2)}</span>
                )}
              </div>
              <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{zone.note}</p>
              {state.load.inPlannedDeload && (
                <p className="text-sm text-ink-soft mt-1.5">
                  This is a planned deload week, so a lighter load is the point.
                </p>
              )}
            </div>
          </div>
          <LoadBars
            data={state.load.daily.map((d) => ({ date: d.date, value: d.load, ...(d.deload ? { muted: true } : {}) }))}
            label="Daily training load over the last 28 days"
            formatValue={(n) => `${n.toFixed(1)} load`}
          />
          <p className="text-xs text-ink-soft mt-2">
            Last 28 days. Load is session RPE × hours. Deload days are shown in orange.
          </p>
        </Card>

        <div className="flex gap-2">
          {(['V', 'YDS'] as GradeScale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`rounded-xl px-3.5 py-2 border text-sm font-semibold ${
                scale === s ? 'border-accent bg-accent/10' : 'border-line bg-surface text-ink-soft'
              }`}
            >
              {s === 'V' ? 'Boulder' : 'Routes'}
            </button>
          ))}
        </div>

        <Card title="Grade progression">
          {points.some((p) => p.ordinal !== null) ? (
            <>
              <ProgressionLine
                points={points.map((p) => ({ week: p.week, value: p.ordinal, display: p.grade }))}
                label="Hardest grade sent per week over the last twelve weeks"
                formatValue={(v) => ladder[v] ?? String(v)}
              />
              <p className="text-sm text-ink-soft mt-2 flex items-start gap-2">
                <Activity size={15} className="shrink-0 mt-0.5" />
                {projection.summary}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              No {scale === 'V' ? 'boulder' : 'route'} sends logged in the last twelve weeks.
            </p>
          )}
        </Card>

        <Card title="Grade pyramid">
          {rows.length > 0 ? (
            <>
              <PyramidBars rows={rows} />
              <p className="text-xs text-ink-soft mt-3">
                Every grade you have touched, hardest first. A row that is mostly orange is a grade you
                keep trying without sending — usually where the next gain is.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Nothing logged on this scale yet.</p>
          )}
        </Card>

        <AssessmentsCard />
        <JournalCard />

        {state.personalRecords.length > 0 && (
          <Card title="Personal records">
            <ul className="grid gap-2">
              {[...state.personalRecords]
                .reverse()
                .slice(0, 6)
                .map((pr) => (
                  <li key={`${pr.scale}-${pr.grade}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">{pr.grade}</span>
                    <span className="text-ink-soft">
                      first sent {new Date(`${pr.date}T00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
