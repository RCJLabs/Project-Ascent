import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { BookOpen, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Plane, Rows3 } from 'lucide-react';
import { AwayCard } from './AwayCard';
import { getProgram } from '@/content/programs';
import {
  fromKey,
  isThisMonth,
  monthGrid,
  monthLabel,
  shortLabel,
  toKey,
  today,
} from '@/engine/dates';
import { blockWindow, plannedDay } from '@/engine/plan';
import { activeObjectives } from '@/engine/objectives';
import { blockOn, season, soonestSeason } from '@/engine/season';
import { useObjectives } from '@/store/objectives';
import { summarise } from '@/engine/injury';
import { INTENSITY_LABEL } from '@/content/types';
import { effortOfDay } from '@/engine/effort';
import { monthMarks, worthExplaining } from '@/engine/monthMarks';
import { tallied, weekTally, weekTense, type WeekTally } from '@/engine/weekTally';
import { intensityOf } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import type { Session } from '@/db/sessions';
import { useSessions } from '@/store/sessions';
import { offerUndo } from '@/store/undo';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Meter } from '@/ui/Meter';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { weekHref } from '@/ui/routes';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Seven day columns and a narrow gutter (PLAN.md M146).
 *
 * `2.2rem` rather than a fraction: the days keep equal shares of what is
 * left, so the gutter costs the same on a phone and a desktop instead of
 * one seventh of the grid at every width. Measured at 430px it takes the
 * squares from 52px to 47px, which still clears the 44px tap target the
 * cells are sized to.
 */
const GRID = 'grid-cols-[repeat(7,minmax(0,1fr))_2.2rem]';

/**
 * How the week went, beside the week (PLAN.md M146).
 *
 * A meter and a fraction, not one or the other: the bar is what makes a
 * month scannable without reading it — five rows of fill you take in at a
 * glance — and the numbers under it are what make it exact.
 *
 * ## A week that has not happened is not a week you missed
 *
 * The first build read *0/4* down every future row, which is true and
 * reads as failure. A week whose Sunday is still ahead shows what it asks
 * for and nothing about what was done, because nothing has been.
 *
 * ## And the week we are in is half of that argument (PLAN.md M310)
 *
 * It stopped at the week boundary when the case is about the day boundary.
 * `start > today` gave this two states where `describeWeekDays` has three,
 * so a week half run and a week finished drew the same fraction with the
 * same bar under it — **1/4** on the Sunday and **1/4** on the Saturday of
 * one week, while the screen a tap away said *"1 of 4 training days done,
 * 3 to come"* and then *"1 to come"*.
 *
 * The fraction stays `done/planned`, because M146's whole point is that the
 * two screens cannot disagree about the count. What it gains is the tense:
 * the same *"N to come"* the week screen says, from the same `weekTally`.
 *
 * ## And a week can hold more than it asked for
 *
 * *2/4* on a week where two more sessions were logged off-plan under-reports
 * the training in it, so `+2` goes under the fraction. Off-plan sessions are
 * kept separate rather than folded into the numerator: the fraction is
 * adherence to a plan, and a week that did four different sessions did not
 * do the four it was asked for.
 */
function WeekGutter({
  start,
  end,
  tally,
  today,
}: {
  start: string;
  end: string;
  tally: WeekTally;
  today: string;
}) {
  // Nothing planned and nothing logged: a week before the block, after it,
  // or with no program at all. An empty gutter beats "0/0" on every row.
  if (!tallied(tally)) return <div aria-hidden />;
  const { planned, done, extra, toCome } = tally;
  const tense = weekTense(start, end, today);
  const ahead = tense === 'ahead';
  // The week we are in says what is left, in the week screen's own words.
  const left = tense === 'during' && toCome > 0 ? `, ${toCome} to come` : '';
  const label = ahead
    ? `Week of ${shortLabel(start)}: ${planned} session${planned === 1 ? '' : 's'} planned`
    : planned === 0
      ? `Week of ${shortLabel(start)}: ${extra} session${extra === 1 ? '' : 's'} logged, none planned`
      : `Week of ${shortLabel(start)}: ${done} of ${planned} planned session${
          planned === 1 ? '' : 's'
        } done${left}${extra > 0 ? `, and ${extra} more off the plan` : ''}`;

  return (
    <Link
      href={weekHref(start)}
      aria-label={label}
      className="focus-ring flex flex-col items-center justify-center gap-1 rounded-lg py-1 hover:bg-sunken"
    >
      {!ahead && (
        // `Meter`, not a hand-rolled bar: `ui.test.ts` holds feature files
        // to the primitive, and the reason is the half a class string
        // cannot carry — a value and a text form for anyone who cannot see
        // the fill. Its own label is the short form, since the link around
        // it already carries the sentence.
        <Meter
          value={planned === 0 ? 0 : done / planned}
          label={`${done} of ${planned} done${left}`}
          valueText={`${done} of ${planned}${left}`}
          size="sm"
          tone={planned > 0 && done >= planned ? 'positive' : 'accent'}
          className="w-full"
        />
      )}
      <span
        className={`text-2xs tabular-nums leading-none ${ahead ? 'text-ink-soft/60' : 'text-ink-soft'}`}
        aria-hidden
      >
        {ahead ? planned : planned === 0 ? `+${extra}` : `${done}/${planned}`}
      </span>
      {!ahead && planned > 0 && extra > 0 && (
        <span className="text-2xs tabular-nums leading-none text-ink-soft/70" aria-hidden>
          +{extra}
        </span>
      )}
    </Link>
  );
}

function JournalLink() {
  return (
    <Link href="/journal" className="text-ink-soft p-2.5 -m-1.5" aria-label="Journal">
      <BookOpen size={20} />
    </Link>
  );
}

export function CalendarPage() {
  const now = fromKey(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const byDate = useSessions((s) => s.byDate);
  const load = useSessions((s) => s.load);
  const hydrated = useSessions((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const injuries = useProfile((s) => s.injuries);
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;

  /**
   * Days being marked as trained-but-unlogged (PLAN.md M100).
   *
   * Not gated on having a program, unlike rearranging: the climber this is
   * for is the one who has been away from the app, and a program running or
   * not has nothing to do with whether they were climbing.
   */
  /**
   * Which of the two answers is being given (PLAN.md M275).
   *
   * One picker, two meanings, because the question is one question: the days
   * are quiet, and only the climber knows whether they trained through them
   * or was away. `'trained'` writes M100's blank sessions; `'away'` writes a
   * range. Kept as a mode rather than two pickers so a climber cannot be
   * halfway through both at once with one set of tapped days.
   */
  const [marking, setMarking] = useState<'trained' | 'away' | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const create = useSessions((st) => st.create);
  const removeSession = useSessions((st) => st.remove);

  const togglePicked = (date: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  async function markPicked(): Promise<void> {
    const dates = [...picked].sort();
    const made: Session[] = [];
    for (const date of dates) made.push(await create(date, { completed: true }));
    setPicked(new Set());
    setMarking(null);
    // Marking a fortnight in one tap is a lot of records to have made by
    // accident, which is exactly when undo earns its keep (PLAN.md M79).
    offerUndo(
      `${dates.length} day${dates.length === 1 ? '' : 's'}`,
      async () => {
        for (const session of made) await removeSession(session);
      },
      'marked',
    );
  }

  const days = useMemo(() => monthGrid(year, month), [year, month]);

  /**
   * The season this calendar is drawing as ghosts (PLAN.md M112b).
   *
   * Only one, and `soonestSeason` says which: a season hangs off an
   * objective, nothing caps objectives, and none of them is primary, so a
   * climber can carry several at once. A tie draws nothing rather than
   * picking one for them.
   *
   * The season runs on its own clock — `season()` dates blocks backwards
   * from the target and never reads the active program or its start date —
   * which is exactly why the ghosts below only fill days the real block
   * leaves empty. An intention never draws over a fact.
   */
  const objectives = useObjectives((s) => s.objectives);
  const adaptations = useProfile((s) => s.adaptations);
  /**
   * The active block's own dates, whether or not a week is committed.
   *
   * `planning` needs a *weekly plan* as well as a program and a start date,
   * so a climber who has started a block but not committed a week gets no
   * planned days at all — and ghosts would then shade the block they are
   * actually running. The window is a fact either way; only the sessions
   * inside it are unscheduled.
   */
  const running = useMemo(
    () => (program && startDate ? blockWindow(program, startDate) : null),
    [program, startDate],
  );

  const ghostSeason = useMemo(() => {
    const chosen = soonestSeason(activeObjectives(objectives));
    if (!chosen?.targetDate || !chosen.season?.length) return null;
    return season({
      programIds: chosen.season,
      targetDate: chosen.targetDate,
      today: today(),
      adaptations,
    });
  }, [objectives, adaptations]);

  /**
   * Which week the "Week" link opens: this one while the month holds today,
   * otherwise the week the month begins in. Moving a session lives on the
   * week screen since M135 — a session was only ever able to move inside
   * its own week, and the screen that shows one week is where that belongs.
   */
  const weekAnchor =
    now.getFullYear() === year && now.getMonth() === month ? today() : toKey(new Date(year, month, 1));

  /** Whether the month on screen is the one today is in (PLAN.md M147). */
  const onToday = isThisMonth(year, month, today());

  function goToToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  function shift(by: number) {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  /**
   * Whether there is a plan to draw on top of the month (PLAN.md M45).
   *
   * This used to be an early return: no program, no calendar, and the
   * sentence in its place promised that sessions would appear here — which
   * they already had, hundreds of them, invisible. A program says what you
   * *should* do; it has never had anything to do with what you already did,
   * and the half of this page that shows the second half needs nothing from
   * it.
   */
  const planning = program !== undefined && startDate !== undefined && plan !== undefined;

  /**
   * What every square on the grid is, worked out once.
   *
   * The legend used to be written independently of this loop and drifted
   * from it in both directions (PLAN.md M145): it named one session type
   * for a month that drew several, and it explained a LIMIT marker on
   * blocks that have no limit day at all. A key that is derived from the
   * same pass that draws the squares cannot say either thing.
   */
  const cells = useMemo(
    () =>
      days.map((date) => {
        const day = planning ? plannedDay(program!, startDate!, plan!, date, overrides) : null;
        const logged = byDate[date] ?? [];
        const type = day?.isRest ? undefined : day?.sessionType;
        return {
          date,
          logged,
          done: logged.some((s) => s.completed),
          inMonth: fromKey(date).getMonth() === month,
          type,
          // Flattened, not left under `day`. `MarkedDay`'s fields are all
          // optional, so a cell that kept them nested satisfied the type
          // and reported every month as having no deload and no test —
          // which is the same legend-drifts-from-grid fault one level down
          // (PLAN.md M145).
          isDeload: day?.isDeload ?? false,
          test: day?.test,
        };
      }),
    [days, planning, program, startDate, plan, overrides, byDate, month],
  );

  const marks = useMemo(() => monthMarks(cells), [cells]);

  /**
   * How each week of the grid went, from the same pass (PLAN.md M146).
   *
   * A training week and a rest week looked alike until you counted icons.
   * The count comes from `weekTally`, the rule the week screen reads, so
   * the gutter here and "three of four" there cannot disagree — the fault
   * M145 spent a milestone removing from the legend, not reintroduced one
   * column to the right.
   */
  const weeks = useMemo(
    () =>
      Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => {
        const week = cells.slice(row * 7, row * 7 + 7);
        return {
          start: week[0]!.date,
          end: week[6]!.date,
          tally: weekTally(
            week.map((c) => ({ date: c.date, training: c.type !== undefined, sessions: c.logged })),
            today(),
          ),
        };
      }),
    // `today()` in the deps, not just in the body: the gutter reads the
    // clock again at render, and a tally frozen before midnight beside a
    // tense read after it is the disagreement this milestone is about.
    [cells, today()],
  );

  function renderDay({ date, logged, done, inMonth, type, isDeload, test }: (typeof cells)[number]) {
        const isToday = date === today();
        const planned = type !== undefined;
        // Outside the running block's window and nowhere else. Both ends
        // inclusive: the block's last day is still the block's.
        //
        // A `day.week === null` check stood here too and no mutation could
        // kill it — `blockWindow` and `plannedDay` both take their length
        // from the same `program` object, so they describe the same window
        // and the second test could never disagree with the first.
        const inRunningBlock =
          running !== null && running.from <= date && date <= running.to;
        const ghost = ghostSeason && !inRunningBlock ? blockOn(ghostSeason, date) : null;
        // Which block, not just that there is one. A season is eight to
        // twelve weeks a block, so a whole month is usually inside one and
        // a single tint says nothing you could not have guessed — the
        // first build shaded thirty-five of thirty-five cells in a grey two
        // percent off the page and read as "the calendar is broken".
        // Alternating puts the boundary on screen, which is the thing
        // worth knowing.
        // The day a block begins, which is the information. A single tint
        // over a whole month says nothing — the first build shaded
        // thirty-five of thirty-five cells in a grey two percent off the
        // page and read as "the calendar is broken". The boundary is what
        // a climber is looking for, so that is what gets the emphasis.
        const ghostStarts = ghost !== null && ghost.from === date;
        // Alternating, so the hand-off from one block to the next is a
        // change you can see rather than a border you have to find. Both
        // sit below `done` at /15: an intention must never read as
        // stronger than a day that actually happened, and neither lands
        // on `pickable` at /5.
        const ghostBand = ghost ? ghostSeason!.blocks.indexOf(ghost) % 2 : -1;

        // Folded into `tone` rather than appended to the shell: both set a
        // border colour and a background, and appending left the two
        // fighting on Tailwind's emit order rather than on class order —
        // so a picked day rendered exactly like an unpicked one. A browser
        // showed that; jsdom has no cascade and the `aria-pressed` test
        // passed either way. `Field.tsx` records the same trap.
        const chosen = marking !== null && picked.has(date);
        const edge = chosen
          ? 'border-accent'
          : isToday
            ? 'border-accent'
            : ghostStarts
              ? 'border-accent/50'
              : 'border-line';

        /**
         * Exactly one background class, chosen here rather than stacked.
         *
         * This cell used to emit up to three — a state tint, the
         * in-month fill, and the logged tint — and which one you saw came
         * down to the order Tailwind happened to emit them in rather than
         * the order they were written. M100's picked day was invisible
         * because of it, and the `done` and in-month pair had the same
         * coin flip latent. `Field.tsx` records the trap for type sizes.
         */
        /**
         * How hard the day was, as the one channel a 40px cell has left
         * (PLAN.md M144). M131 turned down four hues for planned
         * intensity and was right to: this is a monochrome ramp of the
         * same accent, which reads as *more* rather than as *different*,
         * and it is the shade the ✅ sits on rather than a fifth marker.
         * The accessible name carries the same fact in words, because a
         * tint alone says nothing to a reader who cannot see it.
         */
        const effort = done ? effortOfDay(logged, type) : null;
        const fill = chosen
          ? 'bg-accent/30'
          : done
            ? effort === 'max'
              ? 'bg-accent/50'
              : effort === 'hard'
                ? 'bg-accent/32'
                : effort === 'moderate'
                  ? 'bg-accent/20'
                  : effort === 'easy'
                    ? 'bg-accent/8'
                    : 'bg-accent/15'
            : ghost
              ? ghostBand === 0
                ? 'bg-accent/10'
                : 'bg-accent/3'
              : inMonth
                ? 'bg-surface'
                : 'bg-transparent';

        const body = (
          <>
            <span className={`text-xs ${isToday ? 'font-black text-accent' : 'text-ink-soft'}`}>
              {fromKey(date).getDate()}
            </span>
            {done ? (
              <span className="text-sm leading-none">✅</span>
            ) : planned ? (
              <span className="text-sm leading-none">{type!.icon}</span>
            ) : (
              <span className="text-sm leading-none text-ink-soft/40">·</span>
            )}
            {/* The limit days, and only those (PLAN.md M131). Session
                types carry an intensity now, and the tempting thing was
                to paint all four of them — four colours on a 40px cell
                in a seven-column grid, encoding the one thing a climber
                most wants to see at a glance in nothing but hue. One
                mark for the hardest day answers the question the week
                view is actually asked (*where are my hard days*) and
                leaves the grid readable. */}
            {inMonth && planned && intensityOf(type) === 'max' && (
              <span className="text-2xs font-bold uppercase text-warn leading-none">LIMIT</span>
            )}
            {/* Both, when a week is both (PLAN.md M67). Suppressing the
                test marker on a deload week sounded tidy and lost Peak
                Performance *both* of its mid-block tests: it deloads on
                weeks 5 and 9, which are the two weeks its phases start.
                A deload is also the week you are freshest to test in. */}
            {inMonth && (isDeload || test !== undefined) && (
              <span className="flex items-center gap-0.5 leading-none">
                {isDeload && (
                  <span className="text-2xs font-bold uppercase text-warn leading-none">DL</span>
                )}
                {test !== undefined && (
                  <span className="text-2xs font-bold uppercase text-accent leading-none">T</span>
                )}
              </span>
            )}
          </>
        );

        const shell = `focus-ring aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${edge} ${fill}${
          inMonth ? '' : ' opacity-40'
        }`;

        // Marking turns the grid into a picker (PLAN.md M100). Only days
        // that are past and empty: you cannot have trained tomorrow, and a
        // day that is already logged is already answered.
        if (marking !== null) {
          /**
           * What each mode may pick.
           *
           * `trained` keeps M100's rule — past and empty, because you cannot
           * have trained tomorrow and a logged day is already answered.
           * `away` drops the empty half: a fortnight in Font with one day
           * logged is still a fortnight in Font, and refusing the range
           * because of that one day would make the marker unusable for
           * exactly the climbers who are trying.
           */
          const selectable =
            date <= today() && (marking === 'away' || logged.length === 0);
          const verb = marking === 'away' ? 'away' : 'trained';
          return (
            <button
              key={date}
              className={shell}
              disabled={!selectable}
              aria-pressed={chosen}
              aria-label={`${chosen ? 'Unmark' : 'Mark'} ${shortLabel(date)} as ${verb}`}
              onClick={() => togglePicked(date)}
            >
              {body}
            </button>
          );
        }

        return (
          <Link
            key={date}
            href={`/log/${date}`}
            className={shell}
            // The shade is the only thing that says how hard the day was,
            // and a shade is nothing to a screen reader (PLAN.md M144).
            {...(done
              ? {
                  'aria-label': `${shortLabel(date)} — logged${
                    effort ? `, ${INTENSITY_LABEL[effort].toLowerCase()}` : ''
                  }`,
                }
              : {})}
          >
            {body}
          </Link>
        );
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={
          planning ? [program.name, summarise(injuries)].filter(Boolean).join(' · ') : 'What you have logged'
        }
        action={<JournalLink />}
      />

      {!planning && (
        <Card className="mb-3">
          <p className="text-sm text-ink-soft mb-3">
            No active program, so this is your log rather than a plan. Pick one and the weeks fill
            in around what you are already doing.
          </p>
          <Link href="/find" className="text-accent font-semibold text-sm">
            Find my program →
          </Link>
        </Card>
      )}

      {marking === 'away' && (
        <AwayCard picked={picked} onSaved={() => setPicked(new Set())} />
      )}

      {marking === 'trained' && (
        <Card className="mb-3">
          <h3 className="font-bold text-sm mb-1">Days you trained but did not log</h3>
          <p className="text-sm text-ink-soft leading-relaxed">
            Tap the days you climbed. They count for your streak and your consistency, and they
            carry no training load, because you have not said how hard or how long they were. The
            app marks them as having no detail wherever it reports a number built on them.
          </p>
          {picked.size > 0 && (
            <Button size="sm" className="mt-3" onClick={() => void markPicked()}>
              <CheckCheck size={15} /> Mark {picked.size} day{picked.size === 1 ? '' : 's'} trained
            </Button>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between mb-3">
        <IconButton onClick={() => shift(-1)} label="Previous month">
          <ChevronLeft size={20} />
        </IconButton>
        <span className="font-bold">{monthLabel(year, month)}</span>
        <IconButton onClick={() => shift(1)} label="Next month">
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="flex justify-end gap-2 mb-2">
        {/* Only where it would go somewhere (PLAN.md M147). A Today button
            on the month that already holds today is a control that does
            nothing — and a screen reader meets it as an offer either way,
            which is the trap M135 named for the disabled move rows. */}
        {!onToday && (
          <Button size="sm" variant="ghost" onClick={goToToday}>
            <CalendarDays size={14} /> Today
          </Button>
        )}
        <Button
          size="sm"
          variant={marking === 'trained' ? 'primary' : 'ghost'}
          onClick={() => {
            setMarking(marking === 'trained' ? null : 'trained');
            setPicked(new Set());
          }}
        >
          <CheckCheck size={14} /> {marking === 'trained' ? 'Done' : 'Mark days'}
        </Button>
        <Button
          size="sm"
          variant={marking === 'away' ? 'primary' : 'ghost'}
          onClick={() => {
            setMarking(marking === 'away' ? null : 'away');
            setPicked(new Set());
          }}
        >
          <Plane size={14} /> {marking === 'away' ? 'Done' : 'Away'}
        </Button>
        <Link
          href={weekHref(weekAnchor)}
          className="focus-ring inline-flex items-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-lg min-h-9 text-ink-soft hover:bg-sunken hover:text-ink"
        >
          <Rows3 size={14} /> Week
        </Link>
      </div>

      {/* The tint says *when*; this says *which*. Per-cell labels do not fit
          seven columns on a phone, and a session icon on a ghost day would
          be exactly the placed session M109 forbids. */}
      {ghostSeason && ghostSeason.blocks.length > 0 && (
        <p className="text-xs text-ink-soft mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>
            Shaded days are your season:{' '}
            {ghostSeason.blocks.map((b, i) => (
              <span key={`${b.programId}-${i}`}>
                {i > 0 && ' \u2192 '}
                <span
                  className={`inline-block align-middle w-2.5 h-2.5 rounded-sm mr-1 ${
                    i % 2 === 0 ? 'bg-accent/30' : 'bg-accent/10'
                  }`}
                  aria-hidden="true"
                />
                <span className={b.when === 'running' ? 'font-semibold text-ink' : undefined}>{b.program.name}</span>
              </span>
            ))}
            . Nothing is scheduled there yet.
          </span>
        </p>
      )}

      <div className={`grid ${GRID} gap-1 mb-1`}>
        {DAY_INITIALS.map((d, i) => (
          <div key={i} className="text-center text-2xs font-bold uppercase text-ink-soft py-1">
            {d}
          </div>
        ))}
        {/* The gutter's own heading, so the column is not a mystery. */}
        <div className="text-center text-2xs font-bold uppercase text-ink-soft py-1">Wk</div>
      </div>

      <div className={`grid ${GRID} gap-1`}>
        {weeks.map((week, row) => (
          <Fragment key={week.start}>
            {cells.slice(row * 7, row * 7 + 7).map((cell) => renderDay(cell))}
            <WeekGutter start={week.start} end={week.end} tally={week.tally} today={today()} />
          </Fragment>
        ))}
      </div>

      {/* The .ics export lived here from M75 to M121. It is under
          Settings › Data now (PLAN.md M122), with the other exports. */}
      {/* A key to this month, not to the app (PLAN.md M145). Every row is
          here because the grid above drew it: the legend named a single
          "Planned session" for a month carrying several different ones, and
          explained a LIMIT marker on blocks like Iron Grip that have no
          limit day at all — a key to a mark the climber could not find. */}
      {worthExplaining(marks) && (
        <Card className="mt-4">
          {/* A list, and a named one. It was an unlabelled row of spans, so
              a screen reader met five fragments with nothing saying what
              they were fragments of. */}
          <ul
            aria-label="What the marks on this month mean"
            className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft list-none p-0 m-0"
          >
            {marks.logged && <li>✅ Logged — the darker the day, the harder you rated it</li>}
            {/* Each session type this month holds, by name. "Planned
                session" was true of all of them and told you which none. */}
            {marks.types.map((type) => (
              <li key={type.id}>
                {type.icon} {type.name}
              </li>
            ))}
            {marks.limit && <li className="text-warn font-bold">LIMIT — the hardest day</li>}
            {marks.deload && <li className="text-warn font-bold">DL — deload week</li>}
            {marks.test && <li className="text-accent font-bold">T — assessment week</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
