import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArchiveRestore, ClipboardList, Compass, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { Session } from '@/db/sessions';
import { shortLabel, today } from '@/engine/dates';
import { loadsFingersDirectly } from '@/engine/fingerGap';
import { gymSummary } from '@/engine/gym';
import { DayNudges, PreSessionCard } from '@/features/log/PreSession';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { useWeekOutline } from '@/features/week/useWeekOutline';
import { useProfile } from '@/store/profile';
import { allSessions, useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { HomeHeading } from './HomeHeading';
import { PageGrid } from '@/ui/PageGrid';
import { SkeletonCard } from '@/ui/Skeleton';
import { lazyRoute } from '@/ui/lazyRoute';

/**
 * Home is the day, and the way into it (PLAN.md M124).
 *
 * Three shapes in eight milestones, and the middle one is worth keeping
 * written down because it was right about the thing it fixed and wrong
 * about the size of the fix.
 *
 * It was a dashboard until M117 — nine cards, and the one thing a climber
 * opens the app to do was a tap away behind the third. M117 replaced it
 * with the logger itself: the heading, the pre-session card, and the
 * editor in place once a session started. That put the button where it
 * belonged, and it also put two thousand lines of editor on the front
 * door. Home became a screen you scrolled *past* — the coach, the week
 * and the program sat under an editor that grows as the session does, so
 * the further into a session you were, the further down the rest of the
 * app went.
 *
 * Now: the day's heading, then what the app has to say about your
 * training — the coach, the week, the block — then the card for today
 * with two buttons on it. **Log session** opens the whole log;
 * **Quick log** opens it stripped to climbs and effort. The editor lives
 * at `/log/<date>` again, for today like every other day.
 *
 * What M117 measured still holds and is still honoured: the thing that
 * must not go behind a chunk load is the *button*, and it has not. The
 * card and its button are in the entry chunk (`PreSession.tsx`, a few
 * hundred bytes); only the editor is behind the tap, and the service
 * worker has precached it before the tap comes.
 */

/**
 * The coach engine is not on the first-paint path (PLAN.md M183).
 *
 * One eager import of `useTips` here pulled nine engine modules into the
 * entry chunk for the sake of a card that is one of three in this grid —
 * 14.4KB gzipped, the app's largest single first-load cost and more than a
 * hundred milestones' worth of budget at the rate they have been costing.
 *
 * **The fallback is a card, not `null`, and that was measured.** A `null`
 * fallback let the two cards below draw first and the coach card insert
 * above them a beat later: at a quarter of this machine's CPU, cumulative
 * layout shift went from **0.0000 to 0.1243** — the app's only shift, and
 * over the 0.1 the web vitals call good. A card-shaped one takes it to
 * **0.0042 at 1280px and 0.0267 at 430px**, the remainder being the nights
 * the top tip's headline runs to two lines and the placeholder has reserved
 * one. Which is M22's finding again, in its own words — *"with nothing in
 * `main` the page has no height at all, so the layout collapses and then
 * snaps back a frame later, which reads as a fault rather than as
 * loading"*.
 *
 * Three lines rather than four because three is what lands there: a
 * headline and two of body under the label. Four measured marginally better
 * (0.0078 against 0.0087 on the same fixture) by over-reserving, which
 * trades a shift down for a shift up and is not worth a thousandth.
 *
 * Reserving the slot is safe because the card is almost never absent:
 * measured across a fresh install, two weeks, a year, and a year with a
 * benchmark gain, the board had something to say every time — a climber
 * with nothing at all to be told is the rare case, not the common one.
 */
const HomeCoachCard = lazyRoute(
  () => import('@/features/coach/HomeCoachCard'),
  (m) => m.HomeCoachCard,
);

/**
 * The board's daily task, lazily (PLAN.md M231).
 *
 * Lazy for the reason the coach card is: Home is the one eager route, and a
 * static import here would put `engine/challenges.ts` — the daily ladder,
 * the weekly table, the bounty generator and the copy for all of it — into
 * the entry chunk of an app that opens on this screen. M230 measured that
 * cost at 2.12KB when it arrived by a different door, and `perf.test.ts`
 * holds it out.
 */
/**
 * The numbers, lazily (PLAN.md M239).
 *
 * Same rule as the two above it and the same reason: this card reaches
 * `altimeter.ts`, `loadTrend.ts` and `derive.ts`, and Home is the one eager
 * route in the app. What paid for it was `ReviewCard`, which used to sit in
 * the grid below and was the only eager importer of `engine/review.ts` —
 * taking it off Home measured 2.09KB back out of the first load.
 */
const HomeStatsCard = lazyRoute(
  () => import('@/features/home/HomeStatsCard'),
  (m) => m.HomeStatsCard,
);

const DailyTaskCard = lazyRoute(
  () => import('@/features/challenges/DailyTaskCard'),
  (m) => m.DailyTaskCard,
);

export function HomePage() {
  const date = today();
  return (
    <>
      <HomeHeadingForToday date={date} />
      {/* The button, then how high and how hard, then the training around
          it (PLAN.md M294).

          M239 put the numbers above the button and measured it on one
          phone: *"On a 430×932 phone the Log session button sat at the
          bottom edge of the viewport."* True there, and it stayed true at
          390×844. At 360×640 — the smallest size the layout harness
          checks — the button came out at 674px with the nav at 582, which
          is 92px of scrolling to reach the one thing the app is opened to
          do. M239 fixed the tall phone and never checked the short one.

          So the order inverts and the reason M239 gave survives it: the
          numbers are still at full size and still the first thing under the
          fold. What changed is which of the two a climber has to scroll
          for, and a reading should lose that to an action.

          On a wide screen those two groups are side by side (PLAN.md M240).
          M239 left the numbers and the session running the full 1024px while
          the cards under them split into two columns, so the top of the page
          was sparse and the bottom was dense — and the altimeter's two
          labels sat at opposite ends of a bar a metre apart. Stacked below
          `lg`, which is where the order above still reads top to bottom. */}
      <div className="lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-6 lg:items-start">
        <div>
          <TodayCard date={date} />
          <Suspense fallback={<NumbersSkeleton />}>
            <HomeStatsCard />
          </Suspense>
        </div>
        <div>
          <AroundTheSession />
          <FirstRunCards />
        </div>
      </div>
    </>
  );
}

/**
 * The space the numbers will take, held still while the chunk arrives.
 *
 * Card-shaped rather than `null`, which is M183's measured finding one card
 * along: an empty fallback lets everything below draw first and then jump
 * down a frame later, and that was the app's only cumulative layout shift.
 * Sized to the real thing — a figure, a bar, a row of three tiles — rather
 * than to a generic three-line card, because a placeholder of the wrong
 * height is a shift with extra steps.
 */
function NumbersSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading your numbers" className="mb-3">
      <div className="px-0.5 pt-1">
        <div className="h-11 w-44 rounded-lg bg-sunken" aria-hidden />
        <div className="h-2.5 w-24 rounded bg-sunken mt-3" aria-hidden />
        <div className="h-2 w-full rounded-full bg-sunken mt-4" aria-hidden />
        <div className="h-2.5 w-full rounded bg-sunken mt-3" aria-hidden />
      </div>
      <div className="flex gap-2 mt-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 bg-surface border border-line rounded-2xl p-3">
            <div className="h-2 w-12 rounded bg-sunken" aria-hidden />
            <div className="h-6 w-14 rounded-lg bg-sunken mt-1.5" aria-hidden />
            <div className="h-5 w-full rounded bg-sunken mt-2.5" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The heading, with the week it sits in (PLAN.md M241).
 *
 * The outline is read here rather than inside `HomeHeading` so the heading
 * stays a component that draws what it is given — the same shape
 * `DayHeading` had, and what lets the strip be rendered in a test without a
 * profile store behind it.
 */
function HomeHeadingForToday({ date }: { date: string }) {
  const outline = useWeekOutline(date);
  const { program } = usePlannedDay(date);
  return <HomeHeading date={date} outline={outline} program={program} />;
}

/** The training around today: what the coach has to say, the week, the block. */
function AroundTheSession() {
  return (
    <PageGrid className="mt-3 lg:mt-0" single>
      <Suspense
        fallback={
          // Announced the way `PageSkeleton` announces its own: a reader
          // should be told the region is loading, not read grey rectangles.
          <div aria-busy="true" aria-live="polite" aria-label="Loading Coach's Corner">
            <SkeletonCard lines={3} />
          </div>
        }
      >
        <HomeCoachCard />
      </Suspense>
      {/* Last, so on a phone it is the card directly above today's session —
          a quality rung for a session not done yet, read on the way to the
          gym rather than on the way home (PLAN.md M231). */}
      <Suspense
        fallback={
          <div aria-busy="true" aria-live="polite" aria-label="Loading today's task">
            <SkeletonCard lines={3} />
          </div>
        }
      >
        <DailyTaskCard />
      </Suspense>
    </PageGrid>
  );
}

/**
 * Today, and the two ways in.
 *
 * Before a session exists this is the pre-session card the logger shows,
 * with its buttons wired to open the log rather than to stay put. Once one
 * exists it is a line saying where the session got to, because the card's
 * job is to say whether there is anything to come back to — the session
 * itself is a tap away and does not belong on the front door.
 */
function TodayCard({ date }: { date: string }) {
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = byDate[date] ?? [];
  return (
    <div className="mt-3 grid grid-cols-1 gap-3">
      <DayNudges date={date} />
      {sessions.length === 0 ? (
        <PreSessionCard date={date} onOpen={() => navigate(`/log/${date}`)} />
      ) : (
        <OpenSessionCard date={date} sessions={sessions} />
      )}
    </div>
  );
}

/**
 * Where today's session got to, and the way back into it.
 *
 * **One button, and it is the quick view.** It shipped with two — *Open the
 * log* beside *Quick log* — and the pair asked a question with no
 * interesting answer: a session that already exists is one a climber is
 * coming back to add climbs to, which is the quick view by definition, and
 * the fold is a toggle at the top of the log for the day they want the rest
 * of it. The line above the button is what carries the state; the button
 * only has to be the way in.
 */
function OpenSessionCard({ date, sessions }: { date: string; sessions: Session[] }) {
  const setLogView = useSettings((s) => s.setLogView);
  const [, navigate] = useLocation();
  const done = sessions.every((s) => s.completed);
  /**
   * The block that has not begun yet (PLAN.md M259).
   *
   * `PreSessionCard` says this on the days between pressing Start and the
   * first whole week — but it is gone the moment a session exists, and a
   * climber who presses Start on a Thursday and trains that evening is
   * exactly the one who wants to know where the session went. It counts;
   * it is not week one.
   */
  const { program, day } = usePlannedDay(date);
  // Through `gymSummary` rather than counted here, so "sent" means on Home
  // exactly what it means everywhere else — an attempt is not a send, and
  // one row of eight boulders is eight.
  const summary = gymSummary(sessions.flatMap((s) => s.climbs ?? []));

  return (
    <Card>
      <p className="text-sm text-ink-soft mb-3">
        {done ? 'Session logged' : 'Session started'}
        {summary.total === 0
          ? ' · no climbs entered yet'
          : ` · ${summary.total} climb${summary.total === 1 ? '' : 's'}, ${summary.sends} sent`}
        {sessions.length > 1 ? ` · ${sessions.length} sessions today` : ''}.
      </p>
      {day?.startsOn !== undefined && program !== undefined && (
        <p className="text-sm text-ink-soft mb-3">
          {program.name} starts {shortLabel(day.startsOn)}, so this one is logged outside the block.
        </p>
      )}
      <Button
        className="w-full"
        onClick={() => {
          setLogView('quick');
          navigate(`/log/${date}`);
        }}
      >
        <Zap size={15} /> Quick log
      </Button>
    </Card>
  );
}

/**
 * What onboarding used to say before the app was allowed to start
 * (PLAN.md M123), as cards a climber can take or leave.
 *
 * Three, each with its own reason to stop showing:
 *
 * - **Before you train** — the safety note, until "Got it" **against the
 *   training it is about** (PLAN.md M181). Not gated on the program: the
 *   note was only ever on the welcome screen, and a climber who restored a
 *   backup, or who skips the setup, never saw it.
 *
 *   The other two stop for a reason — `onboardedAt`, a running block — and
 *   this one stopped for no reason at all: it showed until "Got it" and then
 *   never again, for the life of the install. That is the wrong shape for
 *   the one card about hurting yourself, because most of what it warns about
 *   is hangboarding and campusing, which a climber may not touch for months.
 *   So the dismissal names the fact: waved away before any finger-loading
 *   session is in the log, it comes back once there is one. Waved away after,
 *   it stays away — the warning has been read against the thing it is about.
 * - **Moved from another phone?** — while the log is empty, because that is
 *   the one state this app cannot read (PLAN.md M290). Every other card here
 *   addresses a climber starting from nothing, which is what an empty
 *   database usually means and is not what it always means.
 * - **Set up your climber** — the guided setup, until it has been
 *   finished (or skipped from inside it, which stamps `onboardedAt` the
 *   same way) or waved away here.
 * - **Pick a program** — the finder and the catalogue, until a block is
 *   running or it is waved away. It comes back if the block ends and the
 *   card was never dismissed, which is right: between blocks is exactly
 *   when it applies.
 *
 * Under the log buttons rather than above them (PLAN.md M124): these are
 * the first week of the app's life, and the button is every day of it.
 *
 * Each **Not now** says which card it is on, to a screen reader only
 * (PLAN.md M290). Three buttons reading *"Not now"* on one screen, each
 * doing something different, is a list of identical choices to anyone not
 * looking at it — it was two and this milestone made it three, which is
 * what turned a smell into a defect. The visible word is unchanged, because
 * the card above it is the context for anyone who can see it.
 */
function FirstRunCards() {
  const { program } = usePlannedDay(today());
  const dismissed = useProfile((s) => s.dismissedCards);
  const onboardedAt = useProfile((s) => s.onboardedAt);
  const dismissCard = useProfile((s) => s.dismissCard);
  const byDate = useSessions((s) => s.byDate);
  /**
   * The fact the safety card is dismissed against, folded into the stored id
   * rather than added beside it (PLAN.md M181).
   *
   * A tip carries `id` and `signature` separately because `visibleTips` has
   * to match them; a card is a string in a list, and turning that list into
   * a map would mean a store shape change, a migration, and a backup format
   * that has to read both — risk out of all proportion to one card. The id
   * *is* the signature here, and a dismissal recorded under the old plain
   * `'safety'` matches neither key, so the note is shown once more and then
   * settles against whichever half is true.
   */
  const fingerPhase = useMemo(
    () => (allSessions(byDate).some(loadsFingersDirectly) ? 'loading' : 'before'),
    [byDate],
  );
  const gone = (id: string) => dismissed.includes(id);
  return (
    // `single`, because this grid is inside Home's rail since M240 and a
    // second split there gives a paragraph a column about 280px wide — the
    // safety note came out one word per line, found in the browser.
    <PageGrid className="mt-3" single>
      {!gone(`safety:${fingerPhase}`) && (
        <FirstRunCard icon={<ShieldAlert size={15} className="text-warn" />} title="Before you train">
          <p className="text-sm leading-relaxed">
            This app is training software, not a coach or a clinician. Hangboarding and campusing
            injure fingers and elbows when loaded too soon. Warm up, stop when something hurts, and
            see a physio for anything that persists. You are responsible for what you climb.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => dismissCard(`safety:${fingerPhase}`)}>
              Got it
            </Button>
          </div>
        </FirstRunCard>
      )}
      {/**
        * The climber who already has a log, on the phone that does not
        * (PLAN.md M290).
        *
        * Measured on a fresh install: Home offers five ways to start from
        * nothing — the first-session card, the log buttons, the coach's
        * *"Nothing logged yet"*, the setup and the finder — and the word
        * *backup* appears nowhere on it. The backup itself was never the
        * gap: it is one .zip carrying every store and the photos at their
        * own size, and `exportArchive` refuses to drop them quietly. What
        * was missing is that a climber standing on the new phone is never
        * told the file can come in.
        *
        * Against the log being empty, because that is the fact it is about
        * and the one the other cards misread. A restore fills it, so the
        * card goes without needing to be waved away.
        */}
      {allSessions(byDate).length === 0 && !gone('restore') && (
        <FirstRunCard
          icon={<ArchiveRestore size={15} className="text-accent" />}
          title="Moved from another phone?"
        >
          <p className="text-sm leading-relaxed">
            There is no account to sign into, so the move is a file. Export a backup on the old
            phone, send it to this one however you like, and bring it in from{' '}
            <strong>Your data</strong> in Settings. It carries everything — sessions, projects,
            benchmarks, programs and your photos at full size.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href="/settings" className={PRIMARY_LINK}>
              <ArchiveRestore size={15} /> Restore a backup
            </Link>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Not now, moved from another phone"
              onClick={() => dismissCard('restore')}
            >
              Not now
            </Button>
          </div>
        </FirstRunCard>
      )}
      {onboardedAt === null && !gone('setup') && (
        <FirstRunCard icon={<ClipboardList size={15} className="text-accent" />} title="Set up your climber">
          <p className="text-sm leading-relaxed">
            Five minutes of questions. They pick a program, build your warmups, and give your
            climber real numbers instead of zeroes. Everything works without them — this is the
            shortcut, not the door.
          </p>
          <div className="flex gap-2 mt-3">
            <Link href="/welcome" className={PRIMARY_LINK}>
              <Sparkles size={15} /> Set up
            </Link>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Not now, set up your climber"
              onClick={() => dismissCard('setup')}
            >
              Not now
            </Button>
          </div>
        </FirstRunCard>
      )}
      {program === undefined && !gone('programs') && (
        <FirstRunCard icon={<Compass size={15} className="text-accent" />} title="Pick a program">
          <p className="text-sm leading-relaxed">
            Thirteen of them, from a first block to a peak. The finder picks one from seven
            questions; the catalogue lets you read them all. Logging without one counts just the
            same, for as long as you like.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href="/find" className={PRIMARY_LINK}>
              <Sparkles size={15} /> Find my program
            </Link>
            <Link href="/train" className={OUTLINE_LINK}>
              Browse
            </Link>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Not now, pick a program"
              onClick={() => dismissCard('programs')}
            >
              Not now
            </Button>
          </div>
        </FirstRunCard>
      )}
    </PageGrid>
  );
}

/** A link dressed as the small button beside it, so the row reads as one. */
const PRIMARY_LINK =
  'focus-ring inline-flex items-center justify-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-lg min-h-9 bg-accent text-accent-ink border border-transparent hover:bg-accent-strong';
const OUTLINE_LINK =
  'focus-ring inline-flex items-center justify-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-lg min-h-9 bg-transparent text-ink border border-line hover:bg-sunken';

function FirstRunCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">{title}</h2>
      </div>
      {children}
    </Card>
  );
}
