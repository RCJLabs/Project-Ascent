import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Activity, BookOpen, CalendarRange, ChevronRight, Ruler, Trophy } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getDrill } from '@/content/drills';
import type { Session } from '@/db/sessions';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { PageGrid, Wide } from '@/ui/PageGrid';
import { useGradeLabel } from '@/ui/useGrade';
import { assessmentBattery } from '@/engine/assessments';
import { buildJournal } from '@/engine/journal';
import { deriveCareer } from '@/engine/career';
import { buildHeatGrid, describeConsistency } from '@/engine/consistency';
import { describeTrend, loadTrend } from '@/engine/loadTrend';
import { describeTissue, tissueLoad } from '@/engine/tissueLoad';
import { compareBlocks, describeBlocks } from '@/engine/blockCompare';
import { checkInHistory, describeCheckIns, type CheckInHistory } from '@/engine/checkIns';
import { describeRestHabits, restHabits } from '@/engine/restHabits';
import { conversionTrend, describeConversion, drawable } from '@/engine/conversion';
import { FIELD_DAYS, fieldSeries } from '@/engine/sessionFields';
import { addDays, fromKey, today } from '@/engine/dates';
import { availableYears } from '@/engine/yearReview';
import { deriveClimberState, type PersonalRecord } from '@/engine/derive';
import { ANGLE_LABEL, angles, describeAngles } from '@/engine/angles';
import { describeLadders, ladders } from '@/engine/ladders';
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
import { CheckInStrip } from '@/ui/charts/CheckInStrip';
import { ConversionGrid } from '@/ui/charts/ConversionGrid';
import { FieldSeriesChart } from '@/ui/charts/FieldSeriesChart';
import { LoadTrendLine } from '@/ui/charts/LoadTrendLine';
import { TissueBars, TissueNote } from '@/ui/charts/TissueBars';
import { BlockCompareTable } from '@/ui/charts/BlockCompare';
import { ZONE } from '@/ui/loadZone';


/**
 * The sessions that went past the ceiling the check-in suggested.
 *
 * The strip above is a picture — marks land where the dates put them and
 * can sit a pixel apart — so this is where a day is reachable at full size.
 * Only the sessions that went over are listed: a list of every check-in
 * would bury the four that are worth opening under thirty that are not.
 */
function OverCapList({ history }: { history: CheckInHistory }) {
  const over = history.days.filter((d) => d.over !== null && d.over > 0);
  if (over.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-1 mt-3 border-t border-line pt-3">
      {[...over].reverse().map((day) => (
        <li key={day.sessionId}>
          <Link
            href={`/log/${day.date}`}
            className="flex items-baseline justify-between gap-3 text-sm py-1"
          >
            <span className="font-semibold">
              {fromKey(day.date).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
            <span className="text-ink-soft shrink-0 tabular-nums">
              RPE {day.rpe} against a ceiling of {day.cap}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

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

/**
 * The words a session carries that are not on its own record.
 *
 * The drill it ran and the exercises its program prescribes live in the
 * catalogue. Without them a program session contributes only what the
 * climber happened to tick, which under-reports exactly the structured
 * training this chart is most useful for.
 */
function catalogueWords(session: Session): string {
  const words: string[] = [];
  if (session.drillId) {
    const drill = getDrill(session.drillId);
    if (drill) words.push(drill.name, drill.focus, drill.description);
  }
  const type = session.programId
    ? getProgram(session.programId)?.sessionTypes.find((t) => t.id === session.sessionTypeId)
    : undefined;
  if (type) {
    words.push(type.name, type.description);
    for (const block of type.blocks ?? []) words.push(block.name);
  }
  return words.join(' ');
}

/**
 * A record list, once (PLAN.md M112d).
 *
 * Two of these now — every record, and the ones set on rock — and a second
 * copy of the rows is a second place for the date format to drift.
 */
function RecordList({
  records,
  gradeLabel,
  showMode = false,
}: {
  records: readonly PersonalRecord[];
  gradeLabel: (scale: PersonalRecord['scale'], grade: string) => string;
  showMode?: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2">
      {[...records]
        .reverse()
        .slice(0, 6)
        .map((pr) => (
          <li
            key={`${pr.scale}-${pr.grade}`}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-bold">{gradeLabel(pr.scale, pr.grade)}</span>
            <span className="text-ink-soft">
              {/* "on rock" only where it distinguishes anything. The list
                  below is all outdoors and saying so on every row is noise. */}
              {showMode && pr.mode === 'outdoor' ? 'first sent on rock ' : 'first sent '}
              {new Date(`${pr.date}T00:00`).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </li>
        ))}
    </ul>
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
  /** Which ladder the pyramid is drawing (PLAN.md M106). */
  const [onWhat, setOnWhat] = useState<'all' | 'indoor' | 'outdoor'>('all');

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
  const block = useMemo(() => compareBlocks({ sessions, to: today() }), [sessions]);
  const checkIns = useMemo(() => checkInHistory({ sessions, to: today() }), [sessions]);
  // What the rest-day ticks say, which nothing had ever read one at a time
  // (PLAN.md M94).
  const rest = useMemo(() => restHabits({ sessions, to: today() }), [sessions]);
  const conversion = useMemo(
    () => conversionTrend({ sessions, scale, to: today() }),
    [sessions, scale],
  );
  const answered = useMemo(() => fieldSeries({ sessions, to: today() }), [sessions]);
  // The scan reads the record; the drill a session ran and the exercises its
  // program prescribed live in the catalogue, so they are fetched here and
  // handed in. Without them a program session counts only what was ticked.
  const tissue = useMemo(
    () => tissueLoad({ sessions, to: today(), textFor: catalogueWords }),
    [sessions],
  );
  const projection = useMemo(() => projectGrade(points, scale, display), [points, scale, display]);
  const tally = scale === 'V' ? state.boulder : state.sport;
  // Indoor and outdoor as two ladders (PLAN.md M106). `state` holds one
  // tally per scale and has never known which of them was climbed on rock.
  const twoLadders = useMemo(() => ladders(sessions, scale), [sessions, scale]);
  const onRock = twoLadders.outdoor.tally.totalSends > 0;
  // The toggle only shows where there is rock *on this scale*, so switching
  // scales can hide it while a choice is still in effect — which stranded
  // the climber on an empty pyramid with no control to get back. What is
  // not offered is not applied.
  const onWhich = onRock ? onWhat : 'all';
  const shown =
    onWhich === 'indoor' ? twoLadders.indoor.tally : onWhich === 'outdoor' ? twoLadders.outdoor.tally : tally;
  const rows = useMemo(() => pyramid(shown, scale), [shown, scale]);
  // What you avoid (PLAN.md M108). Silent until climbs carry an angle,
  // which is most logs — the question is new and nothing is inferred.
  const byAngle = useMemo(() => angles(sessions, scale), [sessions, scale]);
  const angleSaid = describeAngles(byAngle, display);
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

        {/* Above the charts, not below them (PLAN.md M63). These were the
            last two cards on a page with seven charts on it, which is a
            place nobody scrolls to twice. What happened comes before how it
            is going. */}
        <CareerCard />
        <YearCard />

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

        {/* The only card here that is not about the present. Placed above
            the tissue and trend cards because "am I training more than I
            was?" is the question a climber opens this page with. */}
        <Card title="Against the four weeks before">
          <BlockCompareTable compare={block} />
          <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeBlocks(block)}</p>
          {block.before !== null && (
            <p className="text-xs text-ink-soft mt-2 leading-relaxed">
              Up is not better and down is not worse — a deload block is supposed to show as a
              decline, and so is the month after a trip.
            </p>
          )}
        </Card>

        <Card title="What you have been loading">
          <TissueBars load={tissue} />
          <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeTissue(tissue)}</p>
          <TissueNote load={tissue} />
        </Card>

        {/* The ratio the card above states as one number, as a trajectory.
            0.99 arrived-from-1.6 and 0.99 arrived-from-0.6 are opposite
            situations with the same reading (PLAN.md M25). */}
        <Card title="Where the ratio has been">
          <LoadTrendLine trend={trend} />
          <p className="text-sm text-ink-soft mt-2 leading-relaxed">{describeTrend(trend)}</p>
        </Card>

        {/* The logger's own extra questions, which until M88 were asked on
            twenty-two session types and read by nothing. Beside the
            check-in card because it is the same kind of thing: what you
            told the app, given back to you. */}
        {answered.length > 0 && (
          <Card title="What you told the logger">
            <div className="grid grid-cols-1 gap-4">
              {answered.map((series) => (
                <FieldSeriesChart
                  key={series.spec.id}
                  series={series}
                  from={addDays(today(), -(FIELD_DAYS - 1))}
                  to={today()}
                />
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Your programs ask these on the session types that want them, so a question only
              appears here on the days it was put to you. Nothing is filled in for the days it
              was not.
            </p>
          </Card>
        )}

        {/* Beside the check-in card, not inside it: both are long-window
            readings of something logged per session, and a rest day is the
            one kind of day the check-in never asks about (PLAN.md M94).
            No chart — four shares is a list, and drawing it would be a
            picture of four numbers you can already read. */}
        {describeRestHabits(rest) !== null && (
          <Card title="How you rest">
            <dl className="grid grid-cols-1 gap-1.5">
              {rest.items.map((item) => (
                <div key={item.item} className="flex items-baseline gap-2 text-sm">
                  <dt className="flex-1 min-w-0 capitalize">{item.noun}</dt>
                  <dd className="shrink-0 text-ink-soft tabular-nums">
                    {item.ticked} of {rest.answered}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeRestHabits(rest)}</p>
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Counted over rest days that recorded something. A rest day logged without the
              checklist is still a rest day and is not counted against you here.
            </p>
          </Card>
        )}

        {/* Placed after the load cards, because every sentence in it is
            about the sessions those cards are counting — and before the
            grade cards, which are about a different question entirely. */}
        {checkIns.answered > 0 && (
          <Card title="How you were feeling">
            <CheckInStrip history={checkIns} />
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeCheckIns(checkIns)}</p>
            <OverCapList history={checkIns} />
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              The ceiling is a suggestion the check-in made before the session; the RPE is what you
              logged after. Nothing records which you entered first, so a check-in answered at the
              end of a session will read as though it had been followed.
            </p>
          </Card>
        )}

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

        {/* After the pyramid, which shows this same ratio as one all-time
            number per grade. The series is what that number cannot say. */}
        {drawable(conversion).length > 0 && (
          <Card title="Sends per try, block by block">
            <ConversionGrid trend={conversion} label={gradeLabel} />
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">
              {describeConversion(conversion, display)}
            </p>
          </Card>
        )}

        <Card title="Grade pyramid">
          {/* Two ladders, and the app drew one (PLAN.md M106). The toggle
              only appears once there is something on rock to toggle to —
              three buttons where two do the same thing is not a choice. */}
          {onRock && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  ['all', 'Everything'],
                  ['indoor', 'Indoors'],
                  ['outdoor', 'On rock'],
                ] as const).map(([value, label]) => (
                  <Chip key={value} active={onWhich === value} onClick={() => setOnWhat(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-3">{describeLadders(twoLadders, display)}</p>
            </>
          )}
          {rows.length > 0 ? (
            <>
              <PyramidBars rows={rows.map((r) => ({ ...r, grade: gradeLabel(scale, r.grade) }))} />
              <p className="text-xs text-ink-soft mt-3">
                Every grade you have touched, hardest first. A row that is mostly orange is a grade you
                keep trying without sending — usually where the next gain is.
              </p>
            </>
          ) : (
            // Only two cases reach here: nothing at all on this scale, or a
            // climber who has been on rock and not indoors. There is no
            // third — the toggle needs an outdoor send to appear, and one
            // send is one pyramid row.
            <p className="text-sm text-ink-soft">
              {onWhich === 'indoor'
                ? 'Nothing logged indoors on this scale yet.'
                : 'Nothing logged on this scale yet.'}
            </p>
          )}
        </Card>

        {angleSaid !== null && (
          <Card title="The walls you climb on">
            <p className="text-sm leading-relaxed">{angleSaid}</p>
            {byAngle.sides.length > 0 && (
              <ul className="grid grid-cols-1 gap-2 mt-3">
                {byAngle.sides.map((side) => (
                  <li
                    key={side.angle}
                    className="flex items-baseline justify-between gap-3 bg-sunken rounded-xl px-3 py-2"
                  >
                    <span className="text-sm font-semibold">{ANGLE_LABEL[side.angle]}</span>
                    <span className="text-xs text-ink-soft">
                      {side.tally.best === null
                        ? `${side.tally.totalAttempts} tried, none sent`
                        : `${gradeLabel(scale, side.tally.best)} · ${side.tally.totalSends} sent`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <AssessmentsCard />
        <JournalCard />

        {state.personalRecords.length > 0 && (
          <Card title="Personal records">
            <RecordList records={state.personalRecords} gradeLabel={gradeLabel} showMode />
          </Card>
        )}

        {/* Its own card, not a filter over the one above (PLAN.md M112d).
            A climber who sends V7 indoors and V5 outside has one record up
            there — V7 — and no row at all for rock. Rock has its own
            ladder, so it gets its own list. */}
        {state.outdoorRecords.length > 0 && (
          /* "Records on rock" rather than "On rock": M106's grade pyramid
             already has an On rock chip, and two different things wearing
             one name on the same page is worse than a longer title. */
          <Card title="Records on rock">
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              The same progression, counting only what you climbed outside.
            </p>
            <RecordList records={state.outdoorRecords} gradeLabel={gradeLabel} />
          </Card>
        )}
      </PageGrid>
    </>
  );
}
