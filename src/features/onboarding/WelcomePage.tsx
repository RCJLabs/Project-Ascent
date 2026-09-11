import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Check, ShieldAlert } from 'lucide-react';
import { METRICS } from '@/content/metrics';
import type { BodyPart } from '@/content/warmups';
import type { Discipline, Equipment } from '@/content/types';
import { today } from '@/engine/dates';
import { V_GRADES, YDS_GRADES } from '@/engine/grades';
import { useGradeOptions } from '@/ui/useGrade';
import type { Experience, Goal } from '@/engine/finder';
import {
  EMPTY_BASELINE,
  answeredCount,
  baselineEntries,
  benchmarksFor,
  type BaselineAnswers,
} from '@/engine/onboarding';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats, STAT_LABELS, type StatId } from '@/engine/stats';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip, OptionCard, SelectableCard } from '@/ui/Chip';
import { Meter } from '@/ui/Meter';
import { Input, Select } from '@/ui/Field';

const GEAR: { value: Equipment; label: string; note: string }[] = [
  { value: 'wall', label: 'Climbing wall', note: 'A gym or a home wall' },
  { value: 'hangboard', label: 'Hangboard', note: 'Any edge you can hang' },
  { value: 'campus', label: 'Campus board', note: 'Rungs, not a system board' },
  { value: 'gym', label: 'Weights & bands', note: 'Barbell, dumbbells, or bands' },
  { value: 'weight', label: 'Added weight', note: 'A belt, a backpack, plates' },
];

const PARTS: BodyPart[] = ['fingers', 'pulley', 'wrist', 'elbow', 'shoulder', 'back', 'hip', 'knee', 'ankle'];

const EXPERIENCE: { value: Experience; label: string; note: string }[] = [
  { value: 'new', label: 'New to it', note: 'Under a year, still learning to move' },
  { value: 'returning', label: 'Coming back', note: 'Climbed before, off for a while' },
  { value: 'intermediate', label: 'Established', note: 'A few years, plateaus are the problem' },
  { value: 'advanced', label: 'Advanced', note: 'Training deliberately for a long time' },
];

const GOALS: { value: Goal; label: string }[] = [
  { value: 'fundamentals', label: 'Build a base' },
  { value: 'technique', label: 'Move better' },
  { value: 'fingers', label: 'Finger strength' },
  { value: 'power', label: 'Power' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'dynamic', label: 'Dynamic movement' },
  { value: 'project', label: 'Send a project' },
  { value: 'prep', label: 'Prep for a trip' },
  { value: 'maintain', label: 'Just maintain' },
];

const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'boulder', label: 'Boulder' },
  { value: 'sport', label: 'Routes' },
  { value: 'both', label: 'Both' },
];

const STEPS = ['Welcome', 'You', 'Gear', 'Body', 'Baseline', 'Done'] as const;

export function WelcomePage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<BaselineAnswers>(EMPTY_BASELINE);

  const equipment = useProfile((s) => s.equipment);
  const setEquipment = useProfile((s) => s.setEquipment);
  const injuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const removeInjury = useProfile((s) => s.removeInjury);
  const completeOnboarding = useProfile((s) => s.completeOnboarding);
  const recordEntry = useMetrics((s) => s.record);

  const gradeOptions = useGradeOptions();
  const set = (patch: Partial<BaselineAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const setBenchmark = (id: string, value: string) =>
    setAnswers((a) => ({ ...a, benchmarks: { ...a.benchmarks, [id]: value } }));

  const battery = useMemo(() => benchmarksFor(equipment), [equipment]);
  const entries = useMemo(() => baselineEntries(answers, today()), [answers]);
  const preview = useMemo(
    () => deriveStats({ state: deriveClimberState([]), metrics: entries }),
    [entries],
  );

  async function finish() {
    for (const entry of entries) await recordEntry(entry);
    completeOnboarding(answers);
    navigate('/find');
  }

  // Skipping stores no answers, not a set of defaults: a finder seeded with
  // guesses nobody made would recommend a program on nothing at all.
  function skipAll() {
    completeOnboarding(null);
    navigate('/');
  }

  return (
    <div className="min-h-dvh max-w-2xl mx-auto px-4 py-8 flex flex-col">
      <ol className="flex gap-1.5 mb-6" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`}
            aria-current={i === step ? 'step' : undefined}
          />
        ))}
      </ol>

      <div className="flex-1 grid grid-cols-1 gap-3 content-start">
        {step === 0 && (
          <>
            <h1 className="text-3xl font-black tracking-tight leading-tight">
              Let's find out where you're starting from.
            </h1>
            <p className="text-ink-soft leading-relaxed">
              Five minutes of questions. They pick your program, build your warmups, and give your
              climber real numbers instead of zeroes.
            </p>
            <Card>
              <p className="text-sm leading-relaxed">
                Everything stays on this device. No account, no sign-in, nothing sent anywhere. That
                also means there is no cloud copy — export a backup from Settings now and then.
              </p>
            </Card>
            <Card>
              <div className="flex items-baseline gap-2 mb-1.5">
                <ShieldAlert size={15} className="text-warn shrink-0 translate-y-0.5" />
                <h2 className="font-bold text-sm">Before you train</h2>
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">
                This app is training software, not a coach or a clinician. Hangboarding and campusing
                injure fingers and elbows when loaded too soon. Warm up, stop when something hurts,
                and see a physio for anything that persists. You are responsible for what you climb.
              </p>
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Head title="Your climbing" sub="Rough answers are fine. You can change all of it later." />
            <Card title="What do you climb?">
              <Choices
                options={DISCIPLINES}
                value={answers.discipline}
                onChange={(discipline) => set({ discipline })}
              />
            </Card>
            <Card title="How long have you been at it?">
              <div className="grid grid-cols-1 gap-2">
                {EXPERIENCE.map((e) => (
                  <OptionCard
                    key={e.value}
                    active={answers.experience === e.value}
                    onClick={() => set({ experience: e.value })}
                    label={e.label}
                    blurb={e.note}
                  />
                ))}
              </div>
            </Card>
            <Card title="Your hardest send">
              <p className="text-sm text-ink-soft mb-3">
                The hardest thing you have actually done, not what you are working. Leave either blank.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <GradeSelect
                  label="Boulder"
                  grades={gradeOptions('V', V_GRADES)}
                  value={answers.boulderGrade}
                  onChange={(boulderGrade) => set({ boulderGrade })}
                />
                <GradeSelect
                  label="Route"
                  grades={gradeOptions('YDS', YDS_GRADES)}
                  value={answers.sportGrade}
                  onChange={(sportGrade) => set({ sportGrade })}
                />
              </div>
            </Card>
            <Card title="What are you after?">
              <Choices options={GOALS} value={answers.goal} onChange={(goal) => set({ goal })} />
            </Card>
            <Card title="Days a week you can train">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Chip
                    key={n}
                    active={answers.daysPerWeek === n}
                    onClick={() => set({ daysPerWeek: n })}
                    className="flex-1 justify-center text-center"
                  >
                    {n}
                  </Chip>
                ))}
              </div>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Head
              title="What can you train on?"
              sub="This decides which programs are even possible, and what your warmups can use."
            />
            <div className="grid grid-cols-1 gap-2">
              {GEAR.map((g) => {
                const on = equipment.includes(g.value);
                return (
                  <SelectableCard
                    key={g.value}
                    selected={on}
                    onClick={() =>
                      setEquipment(on ? equipment.filter((e) => e !== g.value) : [...equipment, g.value])
                    }
                    label={g.label}
                    className="bg-sunken py-3"
                  >
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {on && <Check size={14} className="text-accent" />}
                      {g.label}
                    </div>
                    <div className="text-xs text-ink-soft">{g.note}</div>
                  </SelectableCard>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Head
              title="Anything hurt?"
              sub="Anything you mark is kept out of your warmups, flagged on drills that load it, and steers the program pick."
            />
            <div className="flex flex-wrap gap-2">
              {PARTS.map((part) => {
                const existing = injuries.find((i) => i.part === part);
                return (
                  <Chip
                    key={part}
                    active={existing !== undefined}
                    onClick={() => (existing ? removeInjury(existing.id) : addInjury(part))}
                    className="capitalize"
                  >
                    {part}
                  </Chip>
                );
              })}
            </div>
            <p className="text-sm text-ink-soft">Nothing selected is the right answer if nothing hurts.</p>
          </>
        )}

        {step === 4 && (
          <>
            <Head
              title="Your baseline"
              sub="Skip anything you cannot test right now — a blank is better than a guess, and you can add it any time from Assessments."
            />
            {battery.map((b) => {
              const metric = METRICS[b.metricId];
              if (!metric) return null;
              return (
                <Card key={b.metricId} title={metric.label}>
                  {/* The test is described once, in the registry (PLAN.md
                      M99b); this page used to carry a second copy that had
                      already drifted from it. What stays here is the entry
                      convention, which the registry cannot say. */}
                  {metric.description && (
                    <p className="text-sm text-ink-soft mb-2 leading-relaxed">{metric.description}</p>
                  )}
                  {b.entry && <p className="text-sm text-ink-soft mb-3 leading-relaxed">{b.entry}</p>}
                  <div className="flex items-center gap-2">
                    <Input
                      value={answers.benchmarks[b.metricId] ?? ''}
                      onChange={(e) => setBenchmark(b.metricId, e.target.value)}
                      placeholder={b.hint}
                      inputMode={metric.kind === 'number' ? 'decimal' : 'text'}
                      aria-label={metric.label}
                      className="flex-1"
                    />
                    {metric.unit && <span className="text-sm text-ink-soft w-16">{metric.unit}</span>}
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {step === 5 && (
          <>
            <Head
              title="Here's your climber"
              sub={`${answeredCount(answers, equipment)} of ${battery.length + 2} questions answered.`}
            />
            <Card>
              <dl className="grid grid-cols-1 gap-2.5">
                {(Object.keys(STAT_LABELS) as StatId[]).map((id) => (
                  <div key={id} className="grid grid-cols-1 gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <dt className="font-semibold">{STAT_LABELS[id].name}</dt>
                      <dd className="font-bold tabular-nums">{preview[id].value}</dd>
                    </div>
                    <Meter
                      value={preview[id].value / 100}
                      label={STAT_LABELS[id].name}
                      valueText={`${preview[id].value} of 100`}
                    />
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Why three of them are on the floor">
              <p className="text-sm text-ink-soft leading-relaxed">
                Strength and Mobility come from things you can measure today, so they are real
                already. Endurance, Technique and Mental are built from what you log — sessions,
                weeks that held together, drills, days on rock. Nothing you could tell us would
                honestly move them, so nothing does. They are the reason to come back.
              </p>
            </Card>
            <Card title="Your altimeter starts at zero">
              <p className="text-sm text-ink-soft leading-relaxed">
                Every metre you climb from here adds up, all the way past Everest. Handing you a
                head start for a questionnaire would spend the whole thing before you began.
              </p>
            </Card>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pt-6">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} /> Back
          </Button>
        )}
        {step === 0 && (
          <Button variant="ghost" onClick={skipAll}>
            Skip
          </Button>
        )}
        <div className="flex-1" />
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={() => setStep(step + 1)}>
            {step === 0 ? 'Start' : 'Next'} <ArrowRight size={16} />
          </Button>
        ) : (
          <Button size="lg" onClick={() => void finish()}>
            Find my program <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-1">
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      <p className="text-sm text-ink-soft leading-relaxed mt-1">{sub}</p>
    </div>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function GradeSelect({
  label,
  grades,
  value,
  onChange,
}: {
  label: string;
  grades: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="block text-ink-soft mb-1">{label}</span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        
      >
        <option value="">—</option>
        {grades.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
