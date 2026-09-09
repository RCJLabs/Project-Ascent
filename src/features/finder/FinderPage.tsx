import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, Lock, Sparkles } from 'lucide-react';
import { V_GRADES, YDS_GRADES } from '@/engine/grades';
import { findProgram, type Experience, type FinderInput, type FinderResult, type Goal, type Recommendation } from '@/engine/finder';
import type { Discipline, Equipment } from '@/content/types';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

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
];

const BODY_PARTS = ['Fingers', 'A2 Pulley', 'Elbow', 'Shoulder', 'Wrist', 'Back', 'Knee'];

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
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl px-3 py-2.5 border text-sm transition-colors ${
        selected ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function RecCard({ rec, headline }: { rec: Recommendation; headline?: boolean }) {
  return (
    <Card className={headline ? 'border-accent' : undefined}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h3 className="font-bold text-lg">{rec.program.name}</h3>
        {rec.program.kind === 'program' && (
          <span className="text-xs font-semibold text-accent">{rec.program.gradeRange.label}</span>
        )}
      </div>
      <p className="text-sm text-ink-soft mb-3">{rec.program.subtitle}</p>

      <ul className="grid gap-1.5 mb-3">
        {rec.reasons.map((r) => (
          <li key={r} className="text-sm flex gap-2">
            <Check size={15} className="text-positive shrink-0 mt-0.5" />
            {r}
          </li>
        ))}
      </ul>

      {rec.cautions.length > 0 && (
        <ul className="grid gap-1.5 mb-3">
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

export function FinderPage() {
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [discipline, setDiscipline] = useState<Discipline>('both');
  const [boulderGrade, setBoulderGrade] = useState('');
  const [sportGrade, setSportGrade] = useState('');
  const [goal, setGoal] = useState<Goal>('technique');
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [equipment, setEquipment] = useState<Equipment[]>(['wall', 'gym']);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [result, setResult] = useState<FinderResult | null>(null);

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function run() {
    const input: FinderInput = {
      discipline,
      experience,
      ...(boulderGrade ? { boulderGrade } : {}),
      ...(sportGrade ? { sportGrade } : {}),
      goal,
      daysPerWeek,
      equipment,
      injuries,
      comingOffBreak: experience === 'returning',
    };
    setResult(findProgram(input));
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (result) {
    return (
      <>
        <button
          onClick={() => setResult(null)}
          className="inline-flex items-center gap-1 text-sm text-ink-soft mb-3"
        >
          <ArrowLeft size={15} /> Change my answers
        </button>
        <PageHeader
          title={result.fallback ? 'Start here for now' : 'Your program'}
          subtitle={
            result.fallback
              ? 'Nothing was a confident match, so this is the honest starting point.'
              : 'Based on your grade, goal, schedule, and what you can train on.'
          }
        />

        <div className="grid gap-3">
          <RecCard rec={result.top} headline />

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
              <ul className="grid gap-2.5">
                {result.blocked.map((b) => (
                  <li key={b.program.id} className="text-sm">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Lock size={13} className="text-ink-soft" />
                      {b.program.name}
                    </div>
                    {b.blockers.map((blocker) => (
                      <p key={blocker} className="text-ink-soft ml-5">
                        {blocker}
                      </p>
                    ))}
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

      <div className="grid gap-4">
        <Card title="How long have you been climbing?">
          <div className="grid gap-2">
            {EXPERIENCE.map((e) => (
              <Chip key={e.value} selected={experience === e.value} onClick={() => setExperience(e.value)}>
                <div className="font-semibold">{e.label}</div>
                <div className="text-ink-soft text-xs mt-0.5">{e.hint}</div>
              </Chip>
            ))}
          </div>
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
              <select
                value={boulderGrade}
                onChange={(e) => setBoulderGrade(e.target.value)}
                className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5"
              >
                <option value="">—</option>
                {V_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-ink-soft mb-1">Route</span>
              <select
                value={sportGrade}
                onChange={(e) => setSportGrade(e.target.value)}
                className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5"
              >
                <option value="">—</option>
                {YDS_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        <Card title="What do you want most right now?">
          <div className="grid gap-2">
            {GOALS.map((g) => (
              <Chip key={g.value} selected={goal === g.value} onClick={() => setGoal(g.value)}>
                <div className="font-semibold">{g.label}</div>
                <div className="text-ink-soft text-xs mt-0.5">{g.hint}</div>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="How many days a week can you train?">
          <div className="grid grid-cols-5 gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} selected={daysPerWeek === n} onClick={() => setDaysPerWeek(n)}>
                <span className="font-semibold block text-center">{n}</span>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="What can you train on?">
          <div className="grid gap-2">
            {EQUIPMENT.map((e) => (
              <Chip
                key={e.value}
                selected={equipment.includes(e.value)}
                onClick={() => toggle(equipment, e.value, setEquipment)}
              >
                <div className="font-semibold">{e.label}</div>
                {e.hint && <div className="text-ink-soft text-xs mt-0.5">{e.hint}</div>}
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="Anything currently injured?">
          <p className="text-sm text-ink-soft mb-3">
            Optional. Used to steer you away from programs that would load it hard.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {BODY_PARTS.map((part) => (
              <Chip
                key={part}
                selected={injuries.includes(part)}
                onClick={() => toggle(injuries, part, setInjuries)}
              >
                <span className="font-semibold">{part}</span>
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
