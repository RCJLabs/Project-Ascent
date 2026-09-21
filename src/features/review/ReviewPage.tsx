import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { addDays, fromKey, shortLabel, startOfWeek, today as todayKey } from '@/engine/dates';
import { describeDayLoad, describeParts } from '@/engine/bodyLoad';
import { getProgram } from '@/content/programs';
import { weeklyChallenges, type Challenge } from '@/engine/challenges';
import { deriveClimberState } from '@/engine/derive';
import { weeklyTargetOf, type PlannedSlot } from '@/engine/review';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { weekCard } from '@/ui/shareCard';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { useSessions, allSessions } from '@/store/sessions';
import { useDeloadDates } from '@/store/deload';
import { ShareButton } from '@/features/share/ShareSheet';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { weekHref } from '@/ui/routes';
import { TONE, useReview } from './weekNote';
import { useGradeLabel } from '@/ui/useGrade';


/**
 * The week's challenges, resolved here rather than inside `buildReview`.
 *
 * This page is the only screen that reads them and it is a lazy route, so it
 * is the only one that should pay for `engine/challenges.ts` — see the note
 * on `useReview` (PLAN.md M230). The target is the review engine's own, so
 * the challenges cannot be scaled to a different number than the adherence
 * line above them.
 */
function useWeeklyChallenges(anchor: string): Challenge[] {
  const byDate = useSessions((s) => s.byDate);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const display = useSettings((s) => s.display);
  const deloadDates = useDeloadDates();

  return useMemo(() => {
    const sessions = allSessions(byDate).filter((s) => s.completed);
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    return weeklyChallenges(
      sessions,
      deriveClimberState(sessions, { deloadDates }),
      anchor,
      weeklyTargetOf(program),
      display,
    );
  }, [byDate, activeProgramId, display, anchor, deloadDates]);
}

export function ReviewPage() {
  const gradeLabel = useGradeLabel();
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const [anchor, setAnchor] = useState(() => startOfWeek(todayKey()));
  const challenges = useWeeklyChallenges(anchor);
  const review = useReview(anchor, challenges);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const atCurrentWeek = anchor >= startOfWeek(todayKey());
  const { color, Icon } = TONE[review.note.tone];

  return (
    <>
      <BackLink />

      <PageHeader
        title="Weekly review"
        subtitle={`${shortLabel(review.from)} – ${shortLabel(review.to)}${review.inProgress ? ' · still running' : ''}`}
        action={<ShareButton content={weekCard(review)} filename={`ascent-week-${review.from}.png`} />}
      />

      <div className="flex items-center justify-between gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, -7))} className="text-accent">
          <ArrowLeft size={15} /> Earlier
        </Button>
        {!atCurrentWeek && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, 7))} className="text-accent">
            Later <ChevronRight size={15} />
          </Button>
        )}
      </div>

      <PageGrid>
        <Card>
          <div className="flex items-start gap-2.5">
            <Icon size={18} style={{ color }} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-bold">{review.note.headline}</h2>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">{review.note.body}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Sessions" value={`${review.sessions}`} sub={`of ${review.target}`} />
            <Stat label="Sends" value={String(review.sends)} />
            <Stat label="Hours" value={(review.minutes / 60).toFixed(1)} />
            <Stat label="Feet" value={review.feet.toLocaleString()} />
          </div>
        </Card>

        <Card title="Load">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-2xl font-black tabular-nums leading-none">{review.load}</span>
            <Delta delta={review.loadDelta} />
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">
            {review.loadPrior > 0
              ? `Last week was ${review.loadPrior}. `
              : 'Nothing logged the week before. '}
            {review.acwr !== null
              ? `Acute:chronic ${review.acwr.toFixed(2)}${
                  review.acwrPrior !== null ? `, up from ${review.acwrPrior.toFixed(2)}` : ''
                }.`
              : 'Not enough history for a load ratio yet.'}
          </p>
        </Card>

        {(review.best.length > 0 || review.records.length > 0 || review.projectSends.length > 0) && (
          <Card title="Best of the week">
            <ul className="grid grid-cols-1 gap-2">
              {review.records.map((r) => (
                <Moment
                  key={`pr-${r.grade}`}
                  label={`First ${gradeLabel(r.scale, r.grade)}`}
                  detail={shortLabel(r.date)}
                  highlight
                />
              ))}
              {review.projectSends.map((name) => (
                <Moment key={`proj-${name}`} label={`Sent ${name}`} detail="project" highlight />
              ))}
              {review.best.map((b) => (
                <Moment
                  key={`best-${b.scale}`}
                  label={`${gradeLabel(b.scale, b.grade)} ×${b.count}`}
                  detail={b.scale === 'V' ? 'hardest boulder' : 'hardest route'}
                />
              ))}
            </ul>
          </Card>
        )}

        <Card title="The board">
          <ul className="grid grid-cols-1 gap-2">
            {review.challenges.list.map((c) => (
              <li key={c.id} className="flex items-baseline gap-2 text-sm">
                {c.done ? (
                  <Check size={13} className="text-positive shrink-0 translate-y-0.5" />
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
                <span className={c.done ? 'font-semibold' : 'text-ink-soft'}>{c.title}</span>
                <span className="text-xs text-ink-soft ml-auto tabular-nums shrink-0">
                  {c.progress} / {c.target}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft mt-3">
            {review.challenges.done} of {review.challenges.total} weekly challenges ·{' '}
            {review.xp.toLocaleString()} XP earned this week
          </p>
        </Card>

        <Card title="Habits">
          <dl className="grid grid-cols-1 gap-1.5 text-sm">
            <Row label="Warmed up" value={`${review.warmups} of ${review.sessions}`} />
            <Row label="Drills done" value={String(review.drills)} />
            <Row label="Rest days logged" value={String(review.restDays)} />
            <Row label="Days outside" value={String(review.outdoorDays)} />
            {review.projectBurns > 0 && <Row label="Project burns" value={String(review.projectBurns)} />}
          </dl>
        </Card>

        {review.nextWeek.length > 0 && <NextWeek slots={review.nextWeek} />}
      </PageGrid>
    </>
  );
}

/**
 * The week ahead, with what it loads of what is hurt (PLAN.md M89).
 *
 * A list rather than the calendar grid on purpose: a month of forty-pixel
 * cells already carries moving and preview state in its borders and tints,
 * and a third signal there would collide with both. Seven rows have room
 * for a number.
 *
 * The parts are named once under the list, not on every row — five rows
 * each ending "load your elbow" is the same sentence read five times.
 */
function NextWeek({ slots }: { slots: PlannedSlot[] }) {
  const parts = [...new Set(slots.flatMap((s) => s.load.parts))];

  return (
    <Card title="Next week">
      <ul className="grid grid-cols-1 gap-1.5">
        {slots.map((slot) => (
          <li key={slot.date} className="flex items-baseline gap-2.5 text-sm">
            <span className="text-xs text-ink-soft w-10 shrink-0">
              {fromKey(slot.date).toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span className="shrink-0">{slot.icon}</span>
            <span className={slot.isRest ? 'text-ink-soft' : 'font-semibold'}>{slot.label}</span>
            {slot.load.conflicts.length > 0 && (
              <span className="text-warn text-xs flex items-center gap-1 ml-auto shrink-0 tabular-nums">
                <AlertTriangle size={12} aria-hidden="true" />
                {/* The caption below carries the part for a reader who can
                    see the whole card at once. Someone hearing the rows in
                    order has not reached it yet, so the badge says the
                    sentence in full rather than a bare number. */}
                <span aria-hidden="true">{slot.load.conflicts.length}</span>
                <span className="sr-only">{describeDayLoad(slot.load)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {parts.length > 0 && (
        <p className="text-xs text-ink-soft mt-3 flex items-start gap-1.5">
          <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
          <span>Counts what that day loads of {describeParts(parts)}.</span>
        </p>
      )}
      {/* The week has a screen of its own since M135 — the dose, the step,
          what is done, and the moves. This card stays as the reading it
          was built for; the door is the door. */}
      <Link href={weekHref(slots[0]!.date)} className="text-accent font-semibold text-sm inline-block mt-3">
        Open the week →
      </Link>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xl font-black tabular-nums leading-none">{value}</div>
      <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-sm text-ink-soft">no comparison</span>;
  const pct = Math.round(delta * 100);
  if (pct === 0) return <span className="text-sm text-ink-soft">level with last week</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${up ? 'text-ink' : 'text-ink-soft'}`}>
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {up ? '+' : ''}
      {pct}% on last week
    </span>
  );
}

function Moment({ label, detail, highlight }: { label: string; detail: string; highlight?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 bg-sunken rounded-xl px-3 py-2">
      <span className={`text-sm ${highlight ? 'font-bold' : 'font-semibold'}`}>{label}</span>
      <span className="text-xs text-ink-soft shrink-0">{detail}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex itemsex-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
