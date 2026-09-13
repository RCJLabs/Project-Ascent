import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, CircleStop, Ruler, Search } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { blockEnd, describeBlockEnd, programForRecord } from '@/engine/blockEnd';
import {
  findBlock,
  outcomeOf,
  rowWindow,
  sortBlocks,
  weeksRun,
  type BlockRecord,
} from '@/engine/blocks';
import { describeBlock } from '@/engine/blockReport';
import { describeChange, describeLoad, exerciseMovement, exerciseSeries, type LoggedPoint } from '@/engine/exerciseLog';
import { formatEntry } from '@/engine/assessments';
import { fromKey, today } from '@/engine/dates';
import { ProgressionLine } from '@/ui/charts/Charts';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { offerUndo } from '@/store/undo';
import { useSessions } from '@/store/sessions';
import { blockAdherence, describeAdherence } from '@/engine/adherence';
import { useSettings } from '@/store/settings';
import type { UnitSystem } from '@/engine/units';
import { BackLink } from '@/ui/BackLink';
import { DisclosureButton } from '@/ui/Disclosure';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { PageGrid } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';
import { activeObjectives } from '@/engine/objectives';
import { nextInSeason, season, soonestSeason } from '@/engine/season';
import { useObjectives } from '@/store/objectives';
import { RecordNotFound } from '@/ui/RecordNotFound';
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

const OUTCOME_WORD: Record<ReturnType<typeof outcomeOf>, string> = {
  running: 'running',
  completed: 'ran to the end',
  left: 'left early',
  unknown: 'no record of how it ended',
};

/**
 * Every block the climber has run (PLAN.md M87).
 *
 * The list is the milestone: before this the app held one start date per
 * program, so a block you switched away from was unreachable and one you
 * restarted was gone. Each row says what became of it, because a window on
 * a calendar cannot — a block left in week six and one run to its last day
 * look identical from the dates alone.
 */
function BlockHistory({ history, current }: { history: BlockRecord[]; current: BlockRecord | null }) {
  if (history.length <= 1) return null;
  return (
    <Card title="Blocks you have run">
      <ul className="grid grid-cols-1 gap-2">
        {history.map((row) => {
          const outcome = outcomeOf(row, today());
          const { from } = rowWindow(row);
          const here = row.id === current?.id;
          return (
            <li key={row.id}>
              <Link
                href={`/finish/${encodeURIComponent(row.id)}`}
                className={`focus-ring block rounded-xl p-3 ${here ? 'bg-accent/10 border border-accent' : 'bg-sunken'}`}
                aria-current={here ? 'page' : undefined}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm min-w-0 truncate">{row.name}</span>
                  <span className="text-xs text-ink-soft shrink-0 ml-auto tabular-nums">
                    {fromKey(from).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  {outcome === 'running'
                    ? `Week ${weeksRun(row, today())} of ${row.weeks} · running`
                    : `${weeksRun(row, today())} of ${row.weeks} weeks · ${OUTCOME_WORD[outcome]}`}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * The way out of a block (PLAN.md M126).
 *
 * `stopProgram` shipped in M87 and was reachable from exactly two places in
 * the app: clearing the sample data, and deleting a custom program you
 * happened to be running. A climber who got injured, went away, or simply
 * changed their mind had no control to press — the block stayed open and
 * Home went on prescribing from it. This is that control, on the screen
 * that is about the block.
 *
 * **It offers an undo, because it is a destructive call with a record
 * behind it**, and the undo puts the whole state back rather than starting
 * the program again: a re-start mints a new block row and abandons the one
 * being filled, which is a second way to do something similar rather than
 * a reversal (the same rule `restoreInjury` follows).
 *
 * The copy says what stopping costs, which is almost nothing, because the
 * reason nobody could find this control is not a reason to make it
 * frightening: `StartProgramPage` already offers resume against restart for
 * a program with a start date, so coming back picks up the week you were on.
 */
function StopBlockCard({ name }: { name: string }) {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const blocks = useProfile((s) => s.blocks);
  const stopProgram = useProfile((s) => s.stopProgram);
  const restoreProgram = useProfile((s) => s.restoreProgram);

  function stop() {
    const before = { activeProgramId, blocks };
    stopProgram();
    offerUndo(name, async () => restoreProgram(before), 'stopped');
  }

  return (
    <Card title="Stop this block">
      <p className="text-sm text-ink-soft leading-relaxed mb-3">
        Nothing is planned after you stop, and the log goes back to counting whatever you climb.
        Everything you have logged stays where it is, this block keeps its place in your history,
        and starting {name} again later resumes the week you were on rather than beginning it over.
      </p>
      <Button variant="outline" onClick={stop}>
        <CircleStop size={15} /> Stop {name}
      </Button>
    </Card>
  );
}

/**
 * One line's readings across the block, charted (PLAN.md M130).
 *
 * The dimension charted is the one that moved, preferring load: a hangboard
 * block progresses in load and the sets stay put, so a chart of the sets
 * would be a flat line over the interesting one. Everything is a number the
 * climber typed — nothing here is parsed out of a prescription, which is the
 * rule `exerciseLog.ts` has stated since M98.
 */
function LineHistory({
  name,
  points,
  units,
}: {
  name: string;
  points: LoggedPoint[];
  units: UnitSystem;
}) {
  const dimension =
    (['load', 'hold', 'reps', 'sets'] as const).find((d) =>
      points.some((p) => p.entry[d] !== undefined),
    ) ?? null;
  // No length guard: `exerciseMovement` only lists a line logged more than
  // once in this window, and `seriesFor` windows it the same way, so a row
  // that reached this always has two readings. A guard for a case the UI
  // cannot produce is a line no test can reach, which a mutation showed by
  // surviving.
  if (dimension === null) return null;
  const format = (v: number) =>
    dimension === 'load' ? describeLoad(v, units) : dimension === 'hold' ? `${v}s` : String(v);
  const plotted = points.map((p) => {
    const value = p.entry[dimension];
    return {
      // The date itself, not a label: `ProgressionLine` formats it for the
      // read-out above the chart, and a pre-formatted string came back as
      // Invalid Date there.
      week: p.date,
      value: value ?? null,
      display: value === undefined ? null : format(value),
    };
  });
  return (
    <div className="mt-2.5 pt-2.5 border-t border-line">
      <ProgressionLine points={plotted} label={`${name}, ${dimension}`} formatValue={format} />
    </div>
  );
}

export function FinishPage({ params }: { params?: { id?: string } } = {}) {
  const entries = useMetrics((s) => s.entries);
  const metricsReady = useMetrics((s) => s.hydrated);
  const loadMetrics = useMetrics((s) => s.load);
  const profileReady = useProfile((s) => s.hydrated);
  const display = useSettings((s) => s.display);
  const units = useSettings((s) => s.units);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const blocks = useProfile((s) => s.blocks);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const byDate = useSessions((s) => s.byDate);
  const sessionsReady = useSessions((s) => s.hydrated);
  const loadSessions = useSessions((s) => s.load);

  useEffect(() => {
    if (!metricsReady) void loadMetrics();
  }, [metricsReady, loadMetrics]);

  useEffect(() => {
    if (!sessionsReady) void loadSessions();
  }, [sessionsReady, loadSessions]);

  const history = useMemo(() => sortBlocks(blocks), [blocks]);
  const asked = params?.id ? decodeURIComponent(params.id) : null;
  // The block asked for, or the most recent one when the url names none.
  // A url naming a block the history does not have is answered as a missing
  // record, like every other `:id` route: quietly showing a *different*
  // block than the one asked for is the worse failure.
  const objectives = useObjectives((s) => s.objectives);
  const adaptations = useProfile((s) => s.adaptations);

  const chosen = useMemo(
    () => (asked === null ? (history[0] ?? null) : findBlock(history, asked)),
    [history, asked],
  );

  const end = useMemo(() => {
    if (chosen === null) {
      // No history at all: fall back to the live program, which is what a
      // climber who started one before this version kept records has.
      const live = activeProgramId ? getProgram(activeProgramId) : undefined;
      const from = activeProgramId ? startDates[activeProgramId] : undefined;
      return live && from ? blockEnd({ program: live, startDate: from, entries, today: today() }) : null;
    }
    const program = programForRecord(chosen);
    if (!program) return null;
    return blockEnd({ program, startDate: chosen.startDate, entries, today: today(), record: chosen });
  }, [chosen, activeProgramId, startDates, entries]);

  /**
   * Which of the sessions the plan placed actually happened (PLAN.md M91).
   *
   * The layout comes from the block's own snapshot where there is one. For
   * a block that ran before the app kept one, today's layout is the only
   * layout there is — so the card says which it used rather than presenting
   * a guess as a measurement.
   */
  const adherence = useMemo(() => {
    const programId = chosen?.programId ?? activeProgramId;
    if (end === null || !programId) return null;
    const startDate = chosen?.startDate ?? startDates[programId];
    const plan = chosen?.plan ?? plans[programId];
    if (!startDate || !plan) return null;
    const measured = blockAdherence({
      program: end.program,
      startDate,
      plan,
      overrides: weekOverrides[programId],
      sessions: Object.values(byDate).flat(),
      today: today(),
    });
    return measured === null ? null : { measured, ownLayout: chosen?.plan !== undefined };
  }, [end, chosen, activeProgramId, startDates, plans, weekOverrides, byDate]);

  // The same window the report covers, read off the block rather than the
  // report: a block still running has a window and no finished report.
  /** Which line's history is open, if any. One at a time (PLAN.md M130). */
  const [openLine, setOpenLine] = useState<string | null>(null);

  const movement = useMemo(() => {
    if (end === null) return [];
    const through = today() < end.status.to ? today() : end.status.to;
    return exerciseMovement(Object.values(byDate).flat(), end.status.from, through);
  }, [end, byDate]);

  /** Every reading for one line inside the block's own window. */
  const seriesFor = (name: string) => {
    if (end === null) return [];
    const through = today() < end.status.to ? today() : end.status.to;
    return exerciseSeries(Object.values(byDate).flat(), name).filter(
      (p) => p.date >= end.status.from && p.date <= through,
    );
  };

  if (!metricsReady || !profileReady || !sessionsReady) return <PageSkeleton />;

  if (asked !== null && chosen === null) {
    return (
      <RecordNotFound what="That block" backTo="/finish" backLabel="Block review">
        It may have been started on a device whose backup you have not restored, or the link may
        be older than the history.
      </RecordNotFound>
    );
  }

  if (end === null) {
    return (
      <>
        <BackLink />
        <PageHeader title="Block review" />
        <PageGrid>
          <EmptyState>
            {chosen === null
              ? 'No program has been run yet, so there is no block to review. Start one and this page fills in as it goes.'
              : `${chosen.name} ran from ${chosen.startDate}, and the app no longer has the program itself — so there is nothing left to measure it against.`}
          </EmptyState>
          <BlockHistory history={history} current={chosen} />
        </PageGrid>
      </>
    );
  }

  const { status, report, graduation, owed, next } = end;

  /**
   * Whether the block on screen is the one the climber is on.
   *
   * `chosen === null` is the fallback path above, where there is no history
   * and the live program is being reported — which is a running block by
   * definition. Otherwise it has to be both open and the active one: a past
   * row must not offer to stop something it is not.
   */
  const running =
    activeProgramId !== null &&
    (chosen === null || (chosen.endedAt === null && chosen.programId === activeProgramId));

  /**
   * What the climber already decided (PLAN.md M112c).
   *
   * The authored `nextPrograms` below are what the app *advises*, with a
   * reason each. This is a different claim — it is what they planned — and
   * on their own page it outranks advice, which is why it sits above.
   *
   * Keyed on the block's end date rather than its id, because a season may
   * name the same program twice and only the dates say which one just ran.
   */
  const inSeason = (() => {
    const objective = soonestSeason(activeObjectives(objectives));
    if (!objective?.targetDate || !objective.season?.length) return null;
    const plan = season({
      programIds: objective.season,
      targetDate: objective.targetDate,
      today: today(),
      adaptations,
    });
    const found = nextInSeason(plan, end.program.id, status.to);
    return found ? { objective, found } : null;
  })();
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

        {adherence !== null && describeAdherence(adherence.measured) !== null && (
          <Card title="Did you do the work?">
            <p className="text-sm leading-relaxed mb-3">{describeAdherence(adherence.measured)}</p>
            <dl className="grid grid-cols-1 gap-1.5">
              {adherence.measured.types
                .filter((t) => t.planned > 0)
                .map((t) => (
                  <div key={t.typeId} className="flex items-baseline gap-2 text-sm">
                    <span className="shrink-0">{t.icon}</span>
                    <dt className="flex-1 min-w-0 truncate">{t.name}</dt>
                    <dd
                      className={`shrink-0 font-semibold tabular-nums ${
                        t.done >= t.planned ? 'text-positive' : t.done * 2 < t.planned ? 'text-warn' : ''
                      }`}
                    >
                      {t.done} of {t.planned}
                    </dd>
                  </div>
                ))}
            </dl>
            {!adherence.ownLayout && (
              <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                Measured against your current week layout — this block ran before the app kept the
                one it started with.
              </p>
            )}
          </Card>
        )}

        {/* What the working numbers did, which the assessments cannot say
            (PLAN.md M98). An assessment is a handful of readings at phase
            boundaries; Iron Grip's Hammer phase asks you to "progress added
            load weekly" and this is the only place that shows whether you
            did. Never called better or worse: an exercise line declares no
            `higherIsBetter`, so the app reports from → to and stops. */}
        {movement.length > 0 && (
          <Card title="What you were lifting">
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              Your own numbers, first reading to last, for the {movement.length === 1 ? 'line' : 'lines'} you
              logged more than once this block.
            </p>
            <ul className="grid grid-cols-1 gap-2">
              {movement.map((row) => (
                <li key={row.name} className="bg-sunken rounded-xl px-3 py-2.5">
                  {/* From → to was all this said, and `exerciseSeries` has
                      built the whole run since M98 with nothing but
                      `lastLogged` reading it (PLAN.md M130). A benchmark
                      gets a detail page with a progression line; the numbers
                      a climber types every session got one "last time".

                      One chart at a time, opened rather than always on:
                      eleven lines of a strength session is eleven SVGs, and
                      the question is asked of one line at a time. */}
                  <DisclosureButton
                    open={openLine === row.name}
                    onToggle={() => setOpenLine(openLine === row.name ? null : row.name)}
                    className="rounded-lg"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-sm min-w-0 truncate">{row.name}</span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide text-ink-soft">
                        {row.readings} readings
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mt-0.5 tabular-nums">
                      {row.changed.map((c) => describeChange(c, units)).join(' · ')}
                    </p>
                  </DisclosureButton>
                  {openLine === row.name && <LineHistory name={row.name} points={seriesFor(row.name)} units={units} />}
                </li>
              ))}
            </ul>
          </Card>
        )}

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

        {inSeason && (
          <Card title="Next in your season">
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              Block {inSeason.found.position} of {inSeason.found.total} on the way to{' '}
              <Link href={`/objectives/${inSeason.objective.id}`} className="underline">
                {inSeason.objective.name}
              </Link>
              .
            </p>
            {inSeason.found.next ? (
              <Link
                href={`/train/${inSeason.found.next.programId}`}
                className="focus-ring block bg-sunken rounded-xl p-3"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm">{inSeason.found.next.program.name}</span>
                  <span className="text-xs text-ink-soft shrink-0 ml-auto">
                    {inSeason.found.next.weeks} weeks
                  </span>
                </div>
                <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">
                  You planned this one next. Starting it is still your call — the dates move with
                  whenever you actually begin.
                </p>
              </Link>
            ) : (
              /* The season is over, which is worth saying rather than
                 leaving blank. It never reads as a pass or a fail:
                 `targetDate` is documented as not a deadline that can be
                 failed, and this is the same date. */
              <p className="text-sm text-ink-soft leading-relaxed">
                That was the last block you planned. What comes after it is open.
              </p>
            )}
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

        <BlockHistory history={history} current={chosen} />

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
        {running && <StopBlockCard name={end.program.name} />}

      </PageGrid>
    </>
  );
}
