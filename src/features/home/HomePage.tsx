import { Link } from 'wouter';
import { CalendarDays, MessageSquare, Sparkles } from 'lucide-react';
import { today } from '@/engine/dates';
import { useTips } from '@/features/coach/useTips';
import { DayHeading } from '@/features/log/DayHeading';
import { DayBody } from '@/features/log/LogPage';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { ReviewCard } from '@/features/review/ReviewPage';
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
      <Link href="/review" className="block bg-surface border border-line rounded-2xl p-4">
        <ReviewCard />
      </Link>
      {program ? (
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
      ) : (
        <Card>
          <p className="text-sm leading-relaxed mb-3">
            Nothing active yet. Answer seven questions and get a program picked for your grade,
            goals, schedule, and what you can train on.
          </p>
          <Link
            href="/find"
            className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3"
          >
            <Sparkles size={16} /> Find my program
          </Link>
        </Card>
      )}
    </PageGrid>
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
