import { useState } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, Check } from 'lucide-react';
import { getProgram } from '@/content/programs';
import {
  DAY_NAMES,
  DAY_SHORT,
  layoutsFor,
  planFromLayout,
  validateWeek,
  type WeekPlan,
} from '@/engine/scheduler';
import type { DayOfWeek } from '@/content/types';
import { useProfile } from '@/store/profile';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip, OptionCard, SelectableCard } from '@/ui/Chip';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function StartProgramPage({ params }: { params: { id: string } }) {
  const program = getProgram(params.id);
  const [, navigate] = useLocation();
  const startDates = useProfile((s) => s.startDates);
  const startProgram = useProfile((s) => s.startProgram);

  const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(undefined);
  const [availableDays, setAvailableDays] = useState<DayOfWeek[]>([]);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [track, setTrack] = useState<string | undefined>(program?.tracks?.[0]?.id);
  const [restart, setRestart] = useState(false);

  if (!program) {
    return <RecordNotFound what="That program" backTo="/train" backLabel="Back to Train" />;
  }

  const layouts = layoutsFor(program, {
    ...(daysPerWeek !== undefined ? { daysPerWeek } : {}),
    ...(availableDays.length > 0 ? { availableDays } : {}),
  });
  const generated = layouts.filter((l) => l.name !== 'Recommended');
  const noFit = daysPerWeek !== undefined && generated.length === 0;
  const layout = layouts[Math.min(layoutIndex, layouts.length - 1)];
  // A generated week can come back shorter than the one asked for: some
  // programs have no legal week at that many days on those days, and a
  // shorter week that works beats an empty list (PLAN.md M55). This is a
  // fact about what could be generated, not about the shape now selected —
  // reading it off the selection made it disappear behind the recommended
  // week, which is the one shape that never shortens.
  const asked =
    daysPerWeek !== undefined
      ? Math.min(daysPerWeek, availableDays.length || 7)
      : availableDays.length || undefined;
  const offered = generated[0] ? Object.keys(generated[0].slots).length : 0;
  const shortened = asked !== undefined && offered > 0 ? asked - offered : 0;
  const plan: WeekPlan = layout ? planFromLayout(layout) : {};
  const violations = validateWeek(program, plan);
  const previouslyStarted = startDates[program.id];

  function commit() {
    startProgram(program!.id, plan, track, restart);
    navigate('/calendar');
  }

  return (
    <>
      <BackLink href={`/train/${program.id}`} title={program.name} />
      <PageHeader title="Plan your week" subtitle={program.name} />

      <div className="grid grid-cols-1 gap-3">
        {program.tracks && (
          <Card title="Track">
            <div className="grid grid-cols-1 gap-2">
              {program.tracks.map((t) => (
                <OptionCard
                  key={t.id}
                  active={track === t.id}
                  onClick={() => setTrack(t.id)}
                  label={t.name}
                  blurb={t.description}
                />
              ))}
            </div>
          </Card>
        )}

        <Card title="Days per week">
          <div className="flex gap-2 flex-wrap">
            <Chip
              active={daysPerWeek === undefined}
              onClick={() => {
                setDaysPerWeek(undefined);
                setLayoutIndex(0);
              }}
            >
              As written
            </Chip>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Chip
                key={n}
                active={daysPerWeek === n}
                onClick={() => {
                  setDaysPerWeek(n);
                  setLayoutIndex(0);
                }}
                className="min-w-11 justify-center"
              >
                {n}
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="Days you can train">
          <p className="text-sm text-ink-soft mb-3">
            Leave this alone for any day of the week. Pick days if your week is fixed — the
            shapes below are built only from the days you choose.
          </p>
          <div className="flex gap-1.5 flex-wrap">
            <Chip
              active={availableDays.length === 0}
              onClick={() => {
                setAvailableDays([]);
                setLayoutIndex(0);
              }}
            >
              Any day
            </Chip>
            {DAYS.map((d) => (
              <Chip
                key={d}
                active={availableDays.includes(d)}
                onClick={() => {
                  setAvailableDays((current) =>
                    current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort((a, b) => a - b),
                  );
                  setLayoutIndex(0);
                }}
                className="min-w-11 justify-center"
              >
                <span className="sr-only">{DAY_NAMES[d]}</span>
                <span aria-hidden>{DAY_SHORT[d]}</span>
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="Weekly shape">
          {noFit && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              No {daysPerWeek}-day week fits this program&apos;s rules — every arrangement breaks one of
              them. Showing the prescribed week instead.
            </p>
          )}
          {shortened > 0 && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              These are {offered}-day weeks — the days you have leave no room for a{' '}
              {asked}-day one without breaking one of this program&apos;s own rules.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {layouts.map((l, i) => {
              const selected = l === layout;
              const preview = planFromLayout(l);
              return (
                <SelectableCard
                  key={`${l.name}-${i}`}
                  selected={selected}
                  onClick={() => setLayoutIndex(i)}
                  label={`${l.name}: ${l.description}${l.note ? ` ${l.note}` : ''}`}
                  className="bg-sunken"
                >
                  <div className="font-semibold text-sm">{l.name}</div>
                  <p className="text-sm text-ink-soft mt-0.5 mb-2">{l.description}</p>
                  {l.note && <p className="text-sm text-warn mt-0.5 mb-2">{l.note}</p>}
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS.map((d) => {
                      const typeId = preview[d];
                      const type = program.sessionTypes.find((t) => t.id === typeId);
                      return (
                        <div
                          key={d}
                          className={`rounded-lg px-0.5 py-1.5 text-center text-2xs overflow-hidden ${
                            type && !type.isRest ? 'bg-accent/20' : 'bg-surface'
                          }`}
                        >
                          <div className="font-bold text-ink-soft">{DAY_SHORT[d]}</div>
                          <div className="text-base leading-tight">{type ? type.icon : '·'}</div>
                        </div>
                      );
                    })}
                  </div>
                </SelectableCard>
              );
            })}
          </div>

          {violations.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-1.5">
              {violations.map((v, i) => (
                <p key={i} className="text-sm flex gap-2 items-start">
                  <AlertTriangle
                    size={14}
                    className={`${v.severity === 'error' ? 'text-danger' : 'text-warn'} shrink-0 mt-0.5`}
                  />
                  {v.message}
                </p>
              ))}
            </div>
          )}
          {violations.length === 0 && (
            <p className="text-sm text-positive flex gap-2 items-center mt-3">
              <Check size={15} /> This week fits the program&apos;s rules.
            </p>
          )}
        </Card>

        {previouslyStarted && (
          <Card title="You have run this before">
            <p className="text-sm text-ink-soft mb-3">
              Started {previouslyStarted}. Resume keeps your place in the program; restart begins again
              at week 1.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant={restart ? 'outline' : 'primary'} onClick={() => setRestart(false)}>
                Resume
              </Button>
              <Button size="sm" variant={restart ? 'primary' : 'outline'} onClick={() => setRestart(true)}>
                Restart at week 1
              </Button>
            </div>
          </Card>
        )}

        <Button size="lg" className="w-full" onClick={commit}>
          {previouslyStarted && !restart ? 'Resume this program' : 'Start this program'}
        </Button>
      </div>
    </>
  );
}
