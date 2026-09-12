import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, X } from 'lucide-react';
import { PROGRAMS } from '@/content/programs';
import type { ProgramId } from '@/content/types';
import { fromKey, today } from '@/engine/dates';
import type { Objective } from '@/engine/objectives';
import { describeSeason, MAX_BLOCKS, season } from '@/engine/season';
import { useProfile } from '@/store/profile';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';

/**
 * The blocks you mean to run before it (PLAN.md M109).
 *
 * This card exists because `peak.ts` told the climber to go and do
 * something the app could not help with: past twelve weeks it withholds the
 * runway and says *"pick a program for the first part of it and come back
 * when the trip is closer."* Picking it meant `/find`, one block at a time,
 * with nowhere to see the shape of the whole thing.
 *
 * **Order is the only input.** Every date under it is derived, backwards
 * from the target, and nothing here shortens a block to make the sum work —
 * that is a training decision, and the program's own page makes it with the
 * lengths that program actually supports.
 */
export function SeasonCard({
  objective,
  onChange,
}: {
  objective: Objective;
  onChange: (season: ProgramId[]) => void;
}) {
  const adaptations = useProfile((s) => s.adaptations);
  const picked = objective.season ?? [];

  const plan = useMemo(
    () =>
      objective.targetDate
        ? season({ programIds: picked, targetDate: objective.targetDate, today: today(), adaptations })
        : null,
    [picked, objective.targetDate, adaptations],
  );
  const said = plan === null ? null : describeSeason(plan);

  const when = (key: string) =>
    fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Card title="The season">
      <p className="text-sm text-ink-soft leading-relaxed mb-3">
        Too far out for a peak, which is the point: this is where the blocks go. Put them in
        the order you mean to run them and the dates fall out of the target.
      </p>

      {picked.length > 0 && (
        <ol className="grid grid-cols-1 gap-2 mb-3">
          {plan!.blocks.map((block, i) => (
            <li
              key={`${block.programId}-${i}`}
              className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2.5"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm truncate">{block.program.name}</span>
                <span className="block text-xs text-ink-soft">
                  {when(block.from)} – {when(block.to)} · {block.weeks} weeks
                  {block.when === 'past' ? ' · already gone' : block.when === 'running' ? ' · now' : ''}
                </span>
              </span>
              <IconButton
                onClick={() => onChange(picked.filter((_, n) => n !== i))}
                label={`Take ${block.program.name} out of the season`}
              >
                <X size={14} />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      {said !== null && <p className="text-sm leading-relaxed mb-3">{said}</p>}

      {picked.length < MAX_BLOCKS ? (
        <div className="flex flex-wrap gap-1.5">
          {PROGRAMS.filter((p) => !picked.includes(p.id)).map((program) => (
            <Chip key={program.id} active={false} onClick={() => onChange([...picked, program.id])}>
              {program.name}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-soft">
          Four blocks is a year of training. More than that is a plan nobody keeps.
        </p>
      )}

      {picked.length > 0 && (
        <>
          <p className="text-xs text-ink-soft mt-3 leading-relaxed">
            Nothing here places a session or starts anything. It is an intention, and the app
            never marks a season missed — a season that did not go to plan is a season.
          </p>
          <Link href="/find" className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-accent mt-2">
            Not sure what follows what? <ArrowRight size={14} />
          </Link>
        </>
      )}
    </Card>
  );
}
