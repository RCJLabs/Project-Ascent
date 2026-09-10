import { useEffect, useRef } from 'react';
import { Copy, Plus } from 'lucide-react';
import type { Climb } from '@/db/sessions';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { useGradeOptions } from '@/ui/useGrade';

export type Outcome = 'onsight' | 'flash' | 'send' | 'attempt';

/**
 * What "same as last time" carries over: a climb, minus the name.
 *
 * Derived from `Climb` rather than written out again — a second declaration
 * of the same shape drifts from the first, and the drift shows up as a
 * climb that will not copy.
 */
export type RepeatableClimb = Omit<Climb, 'name'>;

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'send', label: 'Sent' },
  { value: 'flash', label: 'Flash' },
  { value: 'onsight', label: 'On-sight' },
  { value: 'attempt', label: 'Tried' },
];

/**
 * Adding a climb, in taps rather than pickers (PLAN.md M21).
 *
 * This was three native `<select>`s. Measured on a typical bouldering
 * session — V4×3, V5×2, V3×4 and one V6 attempt — it cost **20 interactions**,
 * because a select is open, scroll, choose before it is a choice at all, and
 * a native picker on a phone is about a second and a half of that.
 *
 * Chips make every one of those a single direct tap on a target already on
 * screen. The count only falls to 15; the time falls much further, and that
 * is the honest way round — the win here is the kind of interaction, not the
 * arithmetic.
 *
 * The grade row scrolls horizontally rather than wrapping. A wrapping row of
 * seventeen grades is four lines tall on a phone and pushes everything below
 * it off the screen, and the grades a climber wants are always near the one
 * they last used — which is why the row scrolls itself there.
 */
export function ClimbEntry({
  scale,
  grade,
  outcome,
  onScale,
  onGrade,
  onOutcome,
  onAdd,
}: {
  scale: GradeScale;
  grade: string;
  outcome: Outcome;
  onScale: (scale: GradeScale) => void;
  onGrade: (grade: string) => void;
  onOutcome: (outcome: Outcome) => void;
  onAdd: () => void;
}) {
  const gradeOptions = useGradeOptions();
  const grades = gradeOptions(scale, scale === 'V' ? V_GRADES : YDS_GRADES);
  const row = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLButtonElement>(null);

  // Bring the chosen grade into view when it changes — including on first
  // render, where a climber logging V8 would otherwise start looking at V0.
  useEffect(() => {
    const el = selected.current;
    const container = row.current;
    if (!el || !container) return;
    const left = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, left), behavior: 'instant' as ScrollBehavior });
  }, [grade, scale]);

  return (
    <div className="mb-3">
      <div className="flex gap-1.5 mb-2">
        <Chip
          active={scale === 'V'}
          onClick={() => {
            onScale('V');
            onGrade('V3');
          }}
        >
          Boulder
        </Chip>
        <Chip
          active={scale === 'YDS'}
          onClick={() => {
            onScale('YDS');
            onGrade('5.10a');
          }}
        >
          Route
        </Chip>
      </div>

      {/* `-mx-4 px-4` so the row bleeds to the card's edges: a scrolling
          strip that stops short of the edge reads as a cut-off list rather
          than something you can push. */}
      <div
        ref={row}
        role="group"
        aria-label="Grade"
        className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-2 mb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {grades.map((g) => (
          <button
            key={g.value}
            ref={g.value === grade ? selected : undefined}
            type="button"
            onClick={() => onGrade(g.value)}
            aria-pressed={g.value === grade}
            className={`focus-ring shrink-0 min-h-9 px-3 rounded-xl text-sm font-bold tabular-nums border transition-colors ${
              g.value === grade
                ? 'bg-accent text-on-accent border-accent'
                : 'bg-surface border-line text-ink-soft'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {OUTCOMES.map((o) => (
          <Chip key={o.value} active={outcome === o.value} onClick={() => onOutcome(o.value)}>
            {o.label}
          </Chip>
        ))}
        <Button size="sm" onClick={onAdd} className="ml-auto" aria-label="Add climb">
          <Plus size={16} /> Add
        </Button>
      </div>
    </div>
  );
}

/**
 * The whole of last time, in one tap (PLAN.md M21).
 *
 * The measured cost of a typical bouldering session is fifteen taps once the
 * pickers are gone, and ten of those are the climbs themselves — irreducible
 * if each one is entered. But a climber training a program repeats sessions:
 * the same four grades, most weeks. For them this is fifteen taps down to
 * one, which is a bigger win than anything the entry row can do.
 *
 * It copies counts as well as grades, because "the same session" means the
 * same session — and it only replaces an empty list, so it can never
 * overwrite something already logged. Names are dropped: a named climb is a
 * specific piece of rock, and claiming you sent it again because you logged
 * it last week is the app inventing an ascent.
 */
export function RepeatLast({
  previous,
  onRepeat,
}: {
  previous: { climbs: RepeatableClimb[]; label: string } | null;
  onRepeat: (climbs: RepeatableClimb[]) => void;
}) {
  if (!previous || previous.climbs.length === 0) {
    return <p className="text-sm text-ink-soft">Nothing logged yet.</p>;
  }

  const total = previous.climbs.reduce((n, c) => n + c.count, 0);

  return (
    <div className="bg-sunken rounded-xl p-3">
      <p className="text-sm text-ink-soft leading-relaxed">
        Nothing logged yet. Last time ({previous.label}) you did {total} climb
        {total === 1 ? '' : 's'}.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2.5"
        onClick={() =>
          onRepeat(
            previous.climbs.map((c) => ({
              ...c,
              id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            })),
          )
        }
      >
        <Copy size={15} /> Same as last time
      </Button>
    </div>
  );
}
