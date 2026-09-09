import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, Check } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { DAY_SHORT, layoutsFor, planFromLayout, validateWeek, type WeekPlan } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip, OptionCard, SelectableCard } from '@/ui/Chip';
import { PageHeader } from '@/ui/PageHeader';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function StartProgramPage({ params }: { params: { id: string } }) {
  const program = getProgram(params.id);
  const [, navigate] = useLocation();
  const startDates = useProfile((s) => s.startDates);
  const startProgram = useProfile((s) => s.startProgram);

  const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(undefined);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [track, setTrack] = useState<string | undefined>(program?.tracks?.[0]?.id);
  const [restart, setRestart] = useState(false);

  if (!program) {
    return (
      <>
        <PageHeader title="Program not found" />
        <Card>
          <Link href="/train" className="text-accent font-semibold text-sm">
            Back to Train
          </Link>
        </Card>
      </>
    );
  }

  const layouts = layoutsFor(program, daysPerWeek);
  const generated = layouts.filter((l) => l.name !== 'Recommended');
  const noFit = daysPerWeek !== undefined && generated.length === 0;
  const layout = layouts[Math.min(layoutIndex, layouts.length - 1)];
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
            {[2, 3, 4, 5, 6].map((n) => (
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

        <Card title="Weekly shape">
          {noFit && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              No {daysPerWeek}-day week fits this program&apos;s rules — every arrangement breaks one of
              them. Showing the prescribed week instead.
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
                  label={`${l.name}: ${l.description}`}
                  className="bg-sunken"
                >
                  <div className="font-semibold text-sm">{l.name}</div>
                  <p className="text-sm text-ink-soft mt-0.5 mb-2">{l.description}</p>
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS.map((d) => {
                      const typeId = preview[d];
                      const type = program.sessionTypes.find((t) => t.id === typeId);
                      return (
                        <div
                          key={d}
                          className={`rounded-lg px-0.5 py-1.5 text-center text-[10px] overflow-hidden ${
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
