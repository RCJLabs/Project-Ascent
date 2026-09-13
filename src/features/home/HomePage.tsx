import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { CalendarDays, ClipboardList, Compass, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { today } from '@/engine/dates';
import { useTips } from '@/features/coach/useTips';
import { DayHeading } from '@/features/log/DayHeading';
import { DayBody } from '@/features/log/LogPage';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { ReviewCard } from '@/features/review/ReviewPage';
import { useProfile } from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageGrid } from '@/ui/PageGrid';

/**
 * Home is today's session (PLAN.md M117).
 *
 * It used to be a dashboard — the climber strip, a "Today" card that
 * summarised the plan and linked to the logger, the coach, the altimeter,
 * the board, the review, the arcade, the program. Nine cards, and the one
 * thing a climber opens the app to do was a tap away behind the third.
 *
 * Now the front door *is* the day: the heading, the planned session with
 * everything the old card said about it, and the editor once it has
 * started. The cards that were about the training around it — the coach,
 * the review, the program — sit under the session. The four that were about
 * the game moved to the Game tab.
 *
 * **The logger is back on the boot path, and this time it was measured.**
 * M115 took it off because Home did not need it; Home is the logger now.
 * The split was still tried — heading eager, body behind a `lazy()` — and
 * lost on every number: the heading painted no earlier, and the session
 * button arrived ~300ms later on a throttled cold start and ~220ms later
 * warm, behind 32 requests instead of 3. `perf.test.ts` has the table.
 *
 * **A new install lands here too** (PLAN.md M123). Until then it was sent
 * to `/welcome` first — six steps and seven questions before it had seen
 * a single screen of the app it had just installed. Now the first screen
 * is today, with a button that logs a session, and the things onboarding
 * used to front-load sit under it as cards: the safety note, the offer of
 * the guided setup, the program catalogue. Each has a "not now" that
 * stays dismissed. The coach and the stats start quieter for a climber who
 * takes that route, which is the trade the audit accepted.
 */

export function HomePage() {
  const date = today();
  return (
    <>
      <DayHeading date={date} />
      <DayBody date={date} />
      <AroundTheSession />
    </>
  );
}

/** The training around today: what the coach has to say, the week, the block. */
function AroundTheSession() {
  const { program } = usePlannedDay(today());
  return (
    <PageGrid className="mt-3">
      <CoachCard />
      <FirstRunCards program={program !== undefined} />
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
 */
function FirstRunCards({ program }: { program: boolean }) {
  const dismissed = useProfile((s) => s.dismissedCards);
  const onboardedAt = useProfile((s) => s.onboardedAt);
  const dismissCard = useProfile((s) => s.dismissCard);
  const gone = (id: string) => dismissed.includes(id);
  return (
    <>
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
      {!program && !gone('programs') && (
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
    </>
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
