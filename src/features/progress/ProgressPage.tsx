import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Activity, AlertTriangle, BookOpen, CalendarRange, CheckCircle2, ChevronRight, Info, Ruler, Trophy, TrendingDown } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { PageGrid, Wide } from '@/ui/PageGrid';
import { useGradeLabel } from '@/ui/useGrade';
import { assessmentBattery } from '@/engine/assessments';
import { buildJournal } from '@/engine/journal';
import { deriveCareer } from '@/engine/career';
import { buildHeatGrid, describeConsistency } from '@/engine/consistency';
import { describeTrend, loadTrend } from '@/engine/loadTrend';
import { today } from '@/engine/dates';
import { availableYears } from '@/engine/yearReview';
import { deriveClimberState, type AcwrZone } from '@/engine/derive';
import { projectGrade, pyramid, weeklyProgression } from '@/engine/progress';
import { useMetrics } from '@/store/metrics';
import { useProjects } from '@/store/projects';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { useSessions } from '@/store/sessions';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { PageHeader } from '@/ui/PageHeader';
import { TrainingState } from './TrainingState';
import { LoadBars, ProgressionLine, PyramidBars } from '@/ui/charts/Charts';
import { ConsistencyBody } from '@/ui/charts/ConsistencyGrid';
import { LoadTrendLine } from '@/ui/charts/LoadTrendLine';

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

/**
 * Entry point into the long arc.
 *
 * The altimeter's ladder ends; this does not. Both are here rather than one
 * replacing the other — height is a lifetime climb, the career list is a
 * lifetime of days.
 */
function CareerCard() {
  const byDate = useSessions((s) => s.byDate);
  const display = useSettings((s) => s.display);

  const career = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    return deriveCareer({ sessions, records: state.personalRecords, display });
  }, [byDate, display]);

  const latest = career.achieved[0];
  const next = career.next[0];

  return (
    <Card title="Career">
      <Link href="/career" className="flex items-center gap-3">
        <Trophy size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {latest ? latest.label : 'No milestones yet'}
          </p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {latest
              ? next
                ? `Next: ${next.label}`
                : `${career.achieved.length} so far`
              : 'Worked out from the log, not handed out.'}
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}

/** The year, summarised — and honestly compared with the one before it. */
function YearCard() {
  const byDate = useSessions((s) => s.byDate);
  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const years = useMemo(() => availableYears(sessions), [sessions]);
  const year = years[0];
  if (year === undefined) return null;

  return (
    <Card title="Year in review">
      <Link href={`/year/${year}`} className="flex items-center gap-3">
        <CalendarRange size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{year}</p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {years.length > 1
              ? `Compared like for like with ${year - 1}`
              : 'Months, totals and the firsts that landed in it.'}
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
      <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

export function ProgressPage() {
  const gradeLabel = useGradeLabel();
  const display = useSettings((s) => s.display);
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
  const heat = useMemo(() => buildHeatGrid({ sessions }), [sessions]);
  const trend = useMemo(() => loadTrend({ sessions, to: today() }), [sessions]);
  const projection = useMemo(() => projectGrade(points, scale, display), [points, scale, display]);
  const tally = scale === 'V' ? state.boulder : state.sport;
  const rows = useMemo(() => pyramid(tally, scale), [tally, scale]);
  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;

  if (state.completedSessions === 0) {
    return (
      <>
        <PageHeader title="Progress" />
        <PageGrid>
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
        </PageGrid>
      </>
    );
  }

  const zone = ZONE[state.load.zone];
  const acwr = state.load.acwr;

  return (
    <>
      <PageHeader title="Progress" subtitle={`${state.completedSessions} sessions logged`} />

      <PageGrid>
        <Wide>
          <Card>
            <div className="flex gap-5 flex-wrap">
              <Stat label="Sessions" value={String(state.completedSessions)} sub={`${state.recentSessions} in 30 days`} />
              <Stat label="Streak" value={`${state.streakWeeks}w`} sub={`${weeklyTarget}+ per week`} />
              <Stat label="Sends" value={String(state.boulder.totalSends + state.sport.totalSends)} />
              <Stat label="Hours" value={String(Math.round(state.totalMinutes / 60))} />
            </div>
          </Card>
        </Wide>

        <TrainingState state={state} sessions={sessions} program={program} scale={scale} />

        {/* Wide, always. Fifty-three weeks squeezed into half a column is a
            smear — the whole point is that a fortnight off is visible as a
            hole, and at 4px a cell that reads only at full width. */}
        <Wide>
          <Card title="Consistency">
            <ConsistencyBody grid={heat} summary={describeConsistency(heat)} />
          </Card>
        </Wide>

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

        {/* The ratio the card above states as one number, as a trajectory.
            0.99 arrived-from-1.6 and 0.99 arrived-from-0.6 are opposite
            situations with the same reading (PLAN.md M25). */}
        <Card title="Where the ratio has been">
          <LoadTrendLine trend={trend} />
          <p className="text-sm text-ink-soft mt-2 leading-relaxed">{describeTrend(trend)}</p>
        </Card>

        <Wide className="flex gap-2">
          {(['V', 'YDS'] as GradeScale[]).map((s) => (
            <Chip key={s} active={scale === s} onClick={() => setScale(s)}>
              {s === 'V' ? 'Boulder' : 'Routes'}
            </Chip>
          ))}
        </Wide>

        <Card title="Grade progression">
          {points.some((p) => p.ordinal !== null) ? (
            <>
              <ProgressionLine
                points={points.map((p) => ({
                  week: p.week,
                  value: p.ordinal,
                  display: p.grade === null ? null : gradeLabel(scale, p.grade),
                }))}
                label="Hardest grade sent per week over the last twelve weeks"
                formatValue={(v) => (ladder[v] ? gradeLabel(scale, ladder[v]) : String(v))}
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
              <PyramidBars rows={rows.map((r) => ({ ...r, grade: gradeLabel(scale, r.grade) }))} />
              <p className="text-xs text-ink-soft mt-3">
                Every grade you have touched, hardest first. A row that is mostly orange is a grade you
                keep trying without sending — usually where the next gain is.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Nothing logged on this scale yet.</p>
          )}
        </Card>

        <CareerCard />
        <YearCard />
        <AssessmentsCard />
        <JournalCard />

        {state.personalRecords.length > 0 && (
          <Card title="Personal records">
            <ul className="grid grid-cols-1 gap-2">
              {[...state.personalRecords]
                .reverse()
                .slice(0, 6)
                .map((pr) => (
                  <li key={`${pr.scale}-${pr.grade}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">{gradeLabel(pr.scale, pr.grade)}</span>
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
      </PageGrid>
    </>
  );
}
