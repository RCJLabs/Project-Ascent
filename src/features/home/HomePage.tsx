import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, ClipboardList, Compass, MessageSquare, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { Session } from '@/db/sessions';
import { today } from '@/engine/dates';
import { gymSummary } from '@/engine/gym';
import { useTips } from '@/features/coach/useTips';
import { DayHeading } from '@/features/log/DayHeading';
import { DayNudges, PreSessionCard } from '@/features/log/PreSession';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { ReviewCard } from '@/features/review/ReviewPage';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageGrid } from '@/ui/PageGrid';

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

export function HomePage() {
  const date = today();
  return (
    <>
      <DayHeading date={date} />
      <AroundTheSession />
      <TodayCard date={date} />
      <FirstRunCards />
    </>
  );
}

/** The training around today: what the coach has to say, the week, the block. */
function AroundTheSession() {
  const { program } = usePlannedDay(today());
  return (
    <PageGrid>
      <CoachCard />
      <Link href="/review" className="block bg-surface border border-line rounded-2xl p-4">
        <ReviewCard />
      </Link>
      {program && (
        <Card title="Your program">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold">{program.name}</div>
              <p className="text-sm text-ink-soft">{program.subtitle}</p>
            </div>
            <Link href="/calendar" className="text-accent shrink-0" aria-label="Open calendar">
              <CalendarDays size={20} />
            </Link>
          </div>
        </Card>
      )}
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
 * - **Before you train** — the safety note, until "Got it". Not gated on
 *   the program: the note was only ever on the welcome screen, and a
 *   climber who restored a backup, or who skips the setup, never saw it.
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
 */
function FirstRunCards() {
  const { program } = usePlannedDay(today());
  const dismissed = useProfile((s) => s.dismissedCards);
  const onboardedAt = useProfile((s) => s.onboardedAt);
  const dismissCard = useProfile((s) => s.dismissCard);
  const gone = (id: string) => dismissed.includes(id);
  return (
    <PageGrid className="mt-3">
      {!gone('safety') && (
        <FirstRunCard icon={<ShieldAlert size={15} className="text-warn" />} title="Before you train">
          <p className="text-sm leading-relaxed">
            This app is training software, not a coach or a clinician. Hangboarding and campusing
            injure fingers and elbows when loaded too soon. Warm up, stop when something hurts, and
            see a physio for anything that persists. You are responsible for what you climb.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => dismissCard('safety')}>
              Got it
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
            <Button size="sm" variant="ghost" onClick={() => dismissCard('setup')}>
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
            <Button size="sm" variant="ghost" onClick={() => dismissCard('programs')}>
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

/**
 * The loudest standing observation, or nothing. Home is not the board — it
 * carries one card so the board is worth opening, and stays silent when
 * there is genuinely nothing to say.
 */
function CoachCard() {
  const { visible } = useTips();
  const top = visible[0];
  if (!top) return null;
  const rest = visible.length - 1;
  const tone =
    top.tone === 'caution' ? 'text-warn' : top.tone === 'good' ? 'text-positive' : 'text-accent';
  return (
    <Link href="/coach" className="block bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={15} className={tone} />
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          Coach's Corner
        </span>
        {rest > 0 && <span className="text-xs text-ink-soft ml-auto">+{rest} more</span>}
      </div>
      <div className="font-bold leading-snug mb-1">{top.headline}</div>
      <p className="text-sm text-ink-soft leading-relaxed line-clamp-2">{top.body}</p>
    </Link>
  );
}
