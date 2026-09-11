import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, Lock, Sparkles } from 'lucide-react';
import { V_GRADES, YDS_GRADES, displayRange } from '@/engine/grades';
import { useGradeOptions } from '@/ui/useGrade';
import { PageSkeleton } from '@/ui/Skeleton';
import { findProgram, type Experience, type FinderInput, type FinderResult, type Goal, type Recommendation } from '@/engine/finder';
import { finderInputFrom, gradesFromLog, type BaselineAnswers } from '@/engine/onboarding';
import {
  baselineDrift,
  describeDaysDrift,
  describeExperienceDrift,
} from '@/engine/baselineDrift';
import type { Session } from '@/db/sessions';
import { today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { useSessions } from '@/store/sessions';
import { injuryPolicy } from '@/engine/injury';
import type { Discipline, Equipment } from '@/content/types';
import type { BodyPart } from '@/content/warmups';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { useSettings } from '@/store/settings';
import { useIntent } from '@/store/intent';

const EXPERIENCE: { value: Experience; label: string; hint: string }[] = [
  { value: 'new', label: 'New to it', hint: 'Under a year, or never trained deliberately' },
  { value: 'returning', label: 'Coming back', hint: 'Climbed before, been away a while' },
  { value: 'intermediate', label: 'Established', hint: 'A few years of consistent climbing' },
  { value: 'advanced', label: 'Advanced', hint: 'Years in, training with intent' },
];

const DISCIPLINE: { value: Discipline; label: string }[] = [
  { value: 'boulder', label: 'Bouldering' },
  { value: 'sport', label: 'Ropes' },
  { value: 'both', label: 'Both' },
];

const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: 'prep', label: 'Get my body ready', hint: 'Before loading fingers and shoulders' },
  { value: 'fundamentals', label: 'Learn the basics', hint: 'Movement vocabulary and consistency' },
  { value: 'technique', label: 'Move better', hint: 'Footwork, body position, efficiency' },
  { value: 'fingers', label: 'Stronger fingers', hint: 'Hangboard, crimp strength' },
  { value: 'power', label: 'More power', hint: 'Lock-offs, limit strength' },
  { value: 'dynamic', label: 'Dynamic movement', hint: 'Dynos, deadpoints, coordination' },
  { value: 'endurance', label: 'Last longer', hint: 'Pump tolerance on routes' },
  { value: 'project', label: 'Send a project', hint: 'Peak for something specific' },
  { value: 'maintain', label: 'Just stay sharp', hint: 'Keep what I have without a peak' },
];

const EQUIPMENT: { value: Equipment; label: string; hint: string }[] = [
  { value: 'wall', label: 'Climbing wall', hint: 'Gym or home wall' },
  { value: 'hangboard', label: 'Hangboard', hint: 'Fingerboard with edges' },
  { value: 'campus', label: 'Campus board', hint: '' },
  { value: 'gym', label: 'Weights & bands', hint: 'Dumbbells, bar, resistance bands' },
  { value: 'weight', label: 'Added weight', hint: 'Belt, backpack, or plates' },
];

const BODY_PARTS: { value: BodyPart; label: string }[] = [
  { value: 'fingers', label: 'Fingers' },
  { value: 'pulley', label: 'Pulley' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'back', label: 'Back' },
  { value: 'knee', label: 'Knee' },
];

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <OptionCard active={selected} onClick={onClick} label={children} />
  );
}

function RecCard({ rec, headline }: { rec: Recommendation; headline?: boolean }) {
  const display = useSettings((s) => s.display);
  return (
    <Card className={headline ? 'border-accent' : undefined}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h2 className="font-bold text-lg">{rec.program.name}</h2>
        {rec.program.kind === 'program' && (
          <span className="text-xs font-semibold text-accent">
            {displayRange(rec.program.gradeRange, display)}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-soft mb-3">{rec.program.subtitle}</p>

      <ul className="grid grid-cols-1 gap-1.5 mb-3">
        {rec.reasons.map((r) => (
          <li key={r} className="text-sm flex gap-2">
            <Check size={15} className="text-positive shrink-0 mt-0.5" />
            {r}
          </li>
        ))}
      </ul>

      {rec.cautions.length > 0 && (
        <ul className="grid grid-cols-1 gap-1.5 mb-3">
          {rec.cautions.map((c) => (
            <li key={c} className="text-sm flex gap-2 text-ink-soft">
              <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
              {c}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/train/${rec.program.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
      >
        See the program →
      </Link>
    </Card>
  );
}

/**
 * The store hydrates a moment after mount, so the form waits for it rather
 * than seeding itself from an empty profile — the same trap the equipment
 * fields below are written to avoid.
 */
export function FinderPage() {
  const hydrated = useProfile((s) => s.hydrated);
  // Benchmarks decide the entry standards the seven questions cannot ask
  // about, so wait for them too: an empty set reads as unmeasured, and
  // running before they land would answer a different climber's question
  // from the one the same climber gets a second later (PLAN.md M35).
  const metricsReady = useMetrics((s) => s.hydrated);
  const baseline = useProfile((s) => s.baseline);
  const byDate = useSessions((s) => s.byDate);
  const sessionsReady = useSessions((s) => s.hydrated);
  // The grades the log says, where they beat the ones typed at onboarding
  // (PLAN.md M85). Computed here rather than inside the form so the form
  // keeps taking plain values and stays easy to test.
  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const logged = useMemo(
    () => gradesFromLog(baseline, deriveClimberState(sessions)),
    [baseline, sessions],
  );
  // Not `null`: with nothing in `main` the page has no height, so the
  // layout collapses and snaps back a frame later — which reads as a fault
  // rather than as loading (PLAN.md M22).
  if (!hydrated || !metricsReady || !sessionsReady) return <PageSkeleton title="Find my program" />;
  return <FinderForm baseline={baseline} grades={logged} sessions={sessions} />;
}

/** What the log says, beside an answer that no longer matches it. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-ink-soft mt-3 flex items-start gap-1.5">
      <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

function FinderForm({
  baseline,
  grades,
  sessions,
}: {
  baseline: BaselineAnswers | null;
  grades: { boulderGrade: string; sportGrade: string };
  sessions: Session[];
}) {
  const gradeOptions = useGradeOptions();
  // Seeded from the first-run baseline where there is one: these are the same
  // five questions, and asking them twice is how a finder gets abandoned.
  const [experience, setExperience] = useState<Experience>(baseline?.experience ?? 'intermediate');
  const [discipline, setDiscipline] = useState<Discipline>(baseline?.discipline ?? 'both');
  const [boulderGrade, setBoulderGrade] = useState(grades.boulderGrade);
  const [sportGrade, setSportGrade] = useState(grades.sportGrade);
  const [goal, setGoal] = useState<Goal>(baseline?.goal ?? 'technique');
  const [daysPerWeek, setDaysPerWeek] = useState(baseline?.daysPerWeek ?? 4);
  // Weeks until whatever they are training for. Not part of the baseline: a
  // trip is a fact about this month, not about the climber (PLAN.md M57).
  const [weeksAvailable, setWeeksAvailable] = useState<number | null>(null);
  // Read and write the profile directly rather than copying into local
  // state: what you tell the finder about your gear and injuries *is* your
  // profile, and a local copy seeded at mount goes stale when the store
  // hydrates a moment later.
  const equipment = useProfile((s) => s.equipment);
  const setEquipment = useProfile((s) => s.setEquipment);
  const storedInjuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const removeInjury = useProfile((s) => s.removeInjury);
  // Two different lists, deliberately. The chips show everything recorded;
  // the finder only blocks on what load should stay off, or a niggle would
  // rule out the program it barely affects.
  const injuries = storedInjuries.map((i) => i.part);
  const blocking = useMemo(() => injuryPolicy(storedInjuries).excluded, [storedInjuries]);
  const metrics = useMetrics((s) => s.entries);
  const display = useSettings((s) => s.display);
  const setIntentWeeks = useIntent((s) => s.setWeeksAvailable);
  const updateBaseline = useProfile((s) => s.updateBaseline);

  /**
   * Where what you said stops matching what you do (PLAN.md M93).
   *
   * Measured against the *stored* answer, not against the chips — the note
   * is about the record the app has been carrying, and it has to stop
   * being shown the moment the climber changes the chip rather than
   * arguing with a selection they just made.
   */
  const drift = useMemo(
    () =>
      baseline === null
        ? { days: null, experience: null }
        : baselineDrift({
            stated: { experience: baseline.experience, daysPerWeek: baseline.daysPerWeek },
            sessions,
            today: today(),
          }),
    [baseline, sessions],
  );

  const toggleInjury = (part: BodyPart) => {
    const existing = storedInjuries.find((i) => i.part === part);
    if (existing) removeInjury(existing.id);
    else addInjury(part);
  };
  const [result, setResult] = useState<FinderResult | null>(null);

  // Arriving from the baseline flow means the seven questions were just
  // answered; showing the form again would be asking them twice. Runs once,
  // so "Change my answers" is not bounced straight back to the result.
  const autoRan = useRef(false);
  useEffect(() => {
    // Marked before the baseline is checked, not after (PLAN.md M93). The
    // page waits for every store before this form mounts, so the first run
    // of this effect sees the real answer — and once M93 made the finder
    // write its answers back, a version that only marked itself on the
    // baseline path would fire *again* the moment a climber pressed Find,
    // replacing the result they had just asked for with one built from the
    // stored baseline, which does not carry the weeks they have.
    if (autoRan.current) return;
    autoRan.current = true;
    if (!baseline) return;
    // And not when the log has stopped agreeing with the stored answers
    // (PLAN.md M93). The auto-run exists so a climber who has just answered
    // is not asked twice; handing them a recommendation built on answers
    // the app has itself flagged as out of date is the opposite of that.
    if (drift.days || drift.experience) return;
    setResult(
      findProgram({
        ...finderInputFrom(baseline, equipment, blocking, metrics),
        // The grades the log says, not the ones typed at onboarding
        // (PLAN.md M85). Applied here too, or the auto-run recommends for a
        // climber two grades behind the one it is recommending to.
        ...(grades.boulderGrade ? { boulderGrade: grades.boulderGrade } : {}),
        ...(grades.sportGrade ? { sportGrade: grades.sportGrade } : {}),
        display,
      }),
    );
  }, [baseline, equipment, blocking, metrics, display, grades, drift]);

  function run() {
    // Carried to the start screen, which is the only place it can be acted
    // on (PLAN.md M59). Set on every run, including back to null, so an
    // answer changed here is the answer that travels.
    setIntentWeeks(weeksAvailable);
    const input: FinderInput = {
      metrics,
      display,
      discipline,
      experience,
      ...(boulderGrade ? { boulderGrade } : {}),
      ...(sportGrade ? { sportGrade } : {}),
      goal,
      daysPerWeek,
      ...(weeksAvailable !== null ? { weeksAvailable } : {}),
      equipment,
      injuries: blocking,
      comingOffBreak: experience === 'returning',
    };
    // Keep it. The finder asks the five questions the baseline holds and
    // used to throw every answer away, so a correction made here lasted
    // exactly as long as the page did (PLAN.md M93).
    updateBaseline({ discipline, experience, goal, daysPerWeek, boulderGrade, sportGrade });
    setResult(findProgram(input));
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (result) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setResult(null)} className="mb-1.5 -ml-3">
          <ArrowLeft size={15} /> Change my answers
        </Button>
        <PageHeader
          title={result.fallback ? 'Start here for now' : 'Your program'}
          subtitle={
            result.fallback
              ? 'Nothing was a confident match, so this is the honest starting point.'
              : 'Based on your grade, goal, schedule, and what you can train on.'
          }
        />

        <div className="grid grid-cols-1 gap-3">
          <RecCard rec={result.top} headline />

          {/* Above the alternatives, below the pick: the pick is still the
              best available answer, and this is why it is not the right one
              (PLAN.md M39). */}
          {result.gap && (
            <Card>
              <div className="flex gap-2">
                <AlertTriangle size={16} className="text-warn shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-ink-soft">{result.gap}</p>
              </div>
            </Card>
          )}

          {result.alternatives.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mt-2">
                Also worth considering
              </h2>
              {result.alternatives.map((alt) => (
                <RecCard key={alt.program.id} rec={alt} />
              ))}
            </>
          )}

          {result.blocked.length > 0 && (
            <Card title="Out of reach for now">
              <ul className="grid grid-cols-1 gap-2.5">
                {result.blocked.map((b) => (
                  <li key={b.program.id} className="text-sm">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Lock size={13} className="text-ink-soft" />
                      {b.program.name}
                    </div>
                    {/* Spaced, not stacked: a program can be out of reach
                        for two unrelated reasons — no hangboard *and* an
                        unmet entry standard — and with no gap the two
                        sentences ran together as one (PLAN.md M35). */}
                    <div className="ml-5 grid grid-cols-1 gap-1">
                      {b.blockers.map((blocker) => (
                        <p key={blocker} className="text-ink-soft">
                          {blocker}
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Find your program" subtitle="Seven questions. No account, nothing sent anywhere." />

      <div className="grid grid-cols-1 gap-4">
        <Card title="How long have you been climbing?">
          <div className="grid grid-cols-1 gap-2">
            {EXPERIENCE.map((e) => (
              <Chip key={e.value} selected={experience === e.value} onClick={() => setExperience(e.value)}>
                <div className="font-semibold">{e.label}</div>
                <div className="text-ink-soft text-xs mt-0.5">{e.hint}</div>
              </Chip>
            ))}
          </div>
          {/* Offered, never applied: the stored answer stays selected until
              the climber changes it themselves. This is something they said
              about themselves and the app's evidence is a count of rows
              (PLAN.md M93). Hidden once the chip has moved, so it stops
              arguing with a selection just made. */}
          {drift.experience && experience === drift.experience.stated && (
            <Note>{describeExperienceDrift(drift.experience)}</Note>
          )}
        </Card>

        <Card title="What do you climb?">
          <div className="grid grid-cols-3 gap-2">
            {DISCIPLINE.map((d) => (
              <Chip key={d.value} selected={discipline === d.value} onClick={() => setDiscipline(d.value)}>
                <span className="font-semibold">{d.label}</span>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="What grade do you climb consistently?">
          <p className="text-sm text-ink-soft mb-3">Leave either blank if it does not apply.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-ink-soft mb-1">Boulder</span>
              <Select value={boulderGrade} onChange={(e) => setBoulderGrade(e.target.value)}>
                <option value="">—</option>
                {gradeOptions('V', V_GRADES).map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="block text-ink-soft mb-1">Route</span>
              <Select value={sportGrade} onChange={(e) => setSportGrade(e.target.value)}>
                <option value="">—</option>
                {gradeOptions('YDS', YDS_GRADES).map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </Card>

        <Card title="What do you want most right now?">
          <div className="grid grid-cols-1 gap-2">
            {GOALS.map((g) => (
              <Chip key={g.value} selected={goal === g.value} onClick={() => setGoal(g.value)}>
                <div className="font-semibold">{g.label}</div>
                <div className="text-ink-soft text-xs mt-0.5">{g.hint}</div>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="How long until you need it?">
          <p className="text-sm text-ink-soft mb-3">
            A trip, a project, a season. Leave it open if there is no date — most of the time
            there is not.
          </p>
          <div className="grid grid-cols-5 gap-2">
            <Chip selected={weeksAvailable === null} onClick={() => setWeeksAvailable(null)}>
              <span className="font-semibold block text-center text-xs">Open</span>
            </Chip>
            {[4, 6, 8, 12].map((n) => (
              <Chip key={n} selected={weeksAvailable === n} onClick={() => setWeeksAvailable(n)}>
                {/* One string, not a number over a unit: "6" alone is also a
                    days-per-week answer, and two chips reading 6 on one
                    screen is a question a climber has to re-read. */}
                <span className="font-semibold block text-center text-xs">{n} wk</span>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="How many days a week can you train?">
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} selected={daysPerWeek === n} onClick={() => setDaysPerWeek(n)}>
                <span className="font-semibold block text-center">{n}</span>
              </Chip>
            ))}
          </div>
          {drift.days && daysPerWeek === drift.days.stated && (
            <Note>{describeDaysDrift(drift.days)}</Note>
          )}
        </Card>

        <Card title="What can you train on?">
          <div className="grid grid-cols-1 gap-2">
            {EQUIPMENT.map((e) => (
              <Chip
                key={e.value}
                selected={equipment.includes(e.value)}
                onClick={() =>
                  setEquipment(
                    equipment.includes(e.value)
                      ? equipment.filter((x) => x !== e.value)
                      : [...equipment, e.value],
                  )
                }
              >
                <div className="font-semibold">{e.label}</div>
                {e.hint && <div className="text-ink-soft text-xs mt-0.5">{e.hint}</div>}
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="Anything currently injured?">
          <p className="text-sm text-ink-soft mb-3">
            Optional. Used to steer you away from programs that would load it hard, and kept out of
            your warmups. Saved to your profile.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {BODY_PARTS.map((part) => (
              <Chip
                key={part.value}
                selected={injuries.includes(part.value)}
                onClick={() => toggleInjury(part.value)}
              >
                <span className="font-semibold">{part.label}</span>
              </Chip>
            ))}
          </div>
        </Card>

        <Button size="lg" onClick={run} className="w-full">
          <Sparkles size={18} />
          Find my program
        </Button>
        <p className="text-xs text-ink-soft text-center pb-2">
          Rule-based, and it shows its reasoning. No AI, no network.
        </p>
      </div>
    </>
  );
}
