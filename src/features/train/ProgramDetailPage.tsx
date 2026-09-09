import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, Clock, Layers, Play, Timer } from 'lucide-react';
import { getDrill } from '@/content/drills';
import { getMetric } from '@/content/metrics';
import { getProtocol } from '@/content/protocols';
import { getProgram } from '@/content/programs';
import type { CircuitFormat, Exercise, Phase, SelectionRule, SessionType, TrackId } from '@/content/types';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Renders dosage as a compact line: "3-5 sets × 6 hangs per set · 60-70% max · 3 min rest" */
function dosageLine(ex: Exercise): string {
  const parts: string[] = [];
  if (ex.sets) parts.push(`${ex.sets} ${ex.sets === '1' ? 'set' : 'sets'}`);
  if (ex.reps) parts.push(`× ${ex.reps}`);
  if (ex.hold) parts.push(`× ${ex.hold}`);
  if (ex.load) parts.push(`· ${ex.load}`);
  if (ex.rest) parts.push(`· ${ex.rest} rest`);
  return parts.join(' ');
}

function ExerciseRow({ ex }: { ex: Exercise }) {
  const protocol = ex.protocolId ? getProtocol(ex.protocolId) : undefined;
  return (
    <li className="border-t border-line pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{ex.name}</span>
            {protocol?.timer && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent border border-accent/40 rounded px-1.5 py-0.5">
                <Timer size={10} />
                {protocol.timer.workSec}s / {protocol.timer.restSec}s
              </span>
            )}
          </div>
          {dosageLine(ex) && <p className="text-sm text-ink-soft mt-0.5">{dosageLine(ex)}</p>}
          {ex.notes && <p className="text-sm text-ink-soft/80 mt-1 italic">{ex.notes}</p>}
        </div>
      </div>
    </li>
  );
}

function formatLine(
  selection: SelectionRule | undefined,
  circuit: CircuitFormat | undefined,
  poolSize: number,
): string {
  const parts: string[] = [];
  if (selection) parts.push(`Pick ${selection.pick} of ${poolSize}`);
  if (!circuit) return parts.join(' · ');
  if (circuit.work) parts.push(`${circuit.work} each`);
  if (circuit.restBetween) parts.push(`${circuit.restBetween} rest`);
  parts.push(`${circuit.rounds} ${circuit.rounds === '1' ? 'round' : 'rounds'}`);
  if (circuit.restBetweenRounds) parts.push(`${circuit.restBetweenRounds} between rounds`);
  return parts.join(' · ');
}

function SessionTypeCard({
  type,
  phase,
  blockName,
  track,
  deloadWeeks,
}: {
  type: SessionType;
  phase: Phase;
  blockName: (blockId: string) => string;
  track: TrackId | null;
  deloadWeeks: Set<number>;
}) {
  return (
    <Card>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg leading-none">{type.icon}</span>
        <h3 className="font-bold">{type.name}</h3>
      </div>
      <p className="text-sm text-ink-soft mb-3">{type.description}</p>

      {type.blocks?.map((block) => {
        const entry = block.perPhase[phase.id];
        if (!entry) return null;
        const shown = track ? entry.exercises.filter((ex) => !ex.track || ex.track === track) : entry.exercises;
        return (
          <div key={block.id} className="mb-4 last:mb-0">
            <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-1.5">
              {block.name}
            </h4>
            <p className="text-sm text-ink-soft leading-relaxed mb-2.5">{entry.rationale}</p>

            {entry.mergedInto ? (
              <p className="text-sm bg-sunken rounded-xl p-3 flex items-center gap-2">
                <Layers size={14} className="text-accent shrink-0" />
                Performed inside <span className="font-semibold">{blockName(entry.mergedInto)}</span> this phase.
              </p>
            ) : (
              <div className="bg-sunken rounded-xl p-3">
                {(entry.selection || entry.circuit) && (
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2.5 pb-2.5 border-b border-line">
                    {formatLine(entry.selection, entry.circuit, entry.exercises.length)}
                  </p>
                )}
                <ul className="grid grid-cols-1 gap-2.5">
                  {shown.map((ex, i) => (
                    <ExerciseRow key={`${ex.name}-${i}`} ex={ex} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {type.drillsByWeek && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-2">
            Weekly drills · weeks {phase.weekStart}-{phase.weekEnd}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: phase.weekEnd - phase.weekStart + 1 }, (_, i) => phase.weekStart + i).map(
              (week) => {
                const drill = getDrill(type.drillsByWeek![week] ?? '');
                if (!drill) return null;
                return (
                  <div key={week} className="bg-sunken rounded-xl p-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                        Week {week}
                      </span>
                      {deloadWeeks.has(week) && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-warn">
                          Deload
                        </span>
                      )}
                      <span className="font-semibold text-sm">{drill.name}</span>
                    </div>
                    <p className="text-sm text-ink-soft mt-1 leading-relaxed">{drill.description}</p>
                    <p className="text-xs text-ink-soft/80 mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {drill.duration}
                      </span>
                      <span>· {drill.focus}</span>
                    </p>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}

    </Card>
  );
}

export function ProgramDetailPage({ params }: { params: { id: string } }) {
  const program = getProgram(params.id);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [track, setTrack] = useState<TrackId | null>(null);

  if (!program) {
    return (
      <>
        <PageHeader title="Program not found" />
        <Card>
          <p className="text-sm text-ink-soft">
            That program has not been converted yet.{' '}
            <Link href="/train" className="text-accent font-semibold">
              Back to Train
            </Link>
          </p>
        </Card>
      </>
    );
  }

  const phase = program.phases[phaseIndex]!;
  const activeTrack = track ?? program.tracks?.[0]?.id ?? null;
  const deloadWeeks = new Set(program.deloadWeeks ?? []);
  const blockName = (blockId: string) =>
    program.sessionTypes.flatMap((t) => t.blocks ?? []).find((b) => b.id === blockId)?.name ?? blockId;

  return (
    <>
      <Link href="/train" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Train
      </Link>
      <PageHeader title={program.name} subtitle={program.subtitle} />

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="flex gap-4 mb-3">
            <div>
              <div className="text-2xl font-black leading-none">{program.weeks}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft mt-1">Weeks</div>
            </div>
            <div>
              <div className="text-2xl font-black leading-none">{program.gradeRange.label}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft mt-1">Grades</div>
            </div>
            <div>
              <div className="text-2xl font-black leading-none">{program.phases.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft mt-1">Phases</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-3">{program.intro.pitch}</p>
          {program.kind === 'program' && (
            <Link
              href={`/train/${program.id}/start`}
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3 hover:bg-accent-strong transition-colors"
            >
              <Play size={16} /> Start this program
            </Link>
          )}
        </Card>

        <Card title="How it runs">
          <ul className="grid grid-cols-1 gap-2 mb-3">
            {program.intro.rhythm.map((line, i) => (
              <li key={i} className="text-sm text-ink-soft leading-relaxed flex gap-2">
                <span className="text-accent font-bold shrink-0">{i + 1}</span>
                {line}
              </li>
            ))}
          </ul>
          <div className="bg-sunken rounded-xl p-3 grid grid-cols-1 gap-1.5">
            {program.constraints.map((c, i) => (
              <p key={i} className="text-sm flex gap-2 items-start">
                <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
                {c.note}
              </p>
            ))}
          </div>
        </Card>

        {program.prerequisites && (
          <Card title="Before you start">
            <p className="text-sm leading-relaxed">{program.prerequisites.note}</p>
          </Card>
        )}

        {program.recommendedLayout && (
          <Card title={`Recommended week · ${program.recommendedLayout.name}`}>
            <p className="text-sm text-ink-soft mb-3">{program.recommendedLayout.description}</p>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((label, day) => {
                const typeId = program.recommendedLayout!.slots[day as 0 | 1 | 2 | 3 | 4 | 5 | 6];
                const type = program.sessionTypes.find((t) => t.id === typeId);
                return (
                  <div
                    key={day}
                    // Seven columns on a 320px phone leaves ~29px of text
                    // room per cell. Side padding and letter-spacing are what
                    // pushed "WED" out of it.
                    className={`rounded-lg px-0.5 py-2 text-center overflow-hidden ${type ? 'bg-accent/10 border border-accent/30' : 'bg-sunken'}`}
                  >
                    <div className="text-[10px] font-bold uppercase text-ink-soft">{label}</div>
                    <div className="text-lg leading-tight mt-1">{type ? type.icon : '·'}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {program.tracks && (
          <Card title="Choose your track">
            <div className="grid grid-cols-1 gap-2">
              {program.tracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrack(t.id)}
                  className={`text-left rounded-xl p-3 border transition-colors ${
                    activeTrack === t.id ? 'border-accent bg-accent/10' : 'border-line bg-sunken'
                  }`}
                >
                  <div className="font-semibold text-sm">{t.name}</div>
                  <p className="text-sm text-ink-soft mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-2">
              Pick one and stay on it for the whole program.
            </p>
          </Card>
        )}

        <div>
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            {program.phases.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setPhaseIndex(i)}
                className={`shrink-0 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  i === phaseIndex
                    ? 'bg-accent text-accent-ink border-transparent'
                    : 'bg-surface text-ink-soft border-line'
                }`}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-80">
                  Weeks {p.weekStart}-{p.weekEnd}
                </span>
                {p.name}
              </button>
            ))}
          </div>

          <Card className="mb-3">
            <p className="text-sm leading-relaxed mb-3">{phase.description}</p>
            <h4 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">Goals</h4>
            <ul className="grid grid-cols-1 gap-1">
              {phase.goals.map((goal) => (
                <li key={goal} className="text-sm text-ink-soft flex gap-2">
                  <span className="text-accent">•</span>
                  {goal}
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-1 gap-3">
            {program.sessionTypes
              .filter((t) => !t.isRest)
              .map((type) => (
                <SessionTypeCard
                  key={type.id}
                  type={type}
                  phase={phase}
                  blockName={blockName}
                  track={activeTrack}
                  deloadWeeks={deloadWeeks}
                />
              ))}
          </div>
        </div>

        <Card title="Benchmarks tested">
          <ul className="grid grid-cols-1 gap-1.5">
            {program.assessments.map((id) => {
              const metric = getMetric(id);
              if (!metric) return null;
              return (
                <li key={id} className="text-sm flex justify-between gap-3">
                  <span>{metric.label}</span>
                  <span className="text-ink-soft shrink-0">{metric.unit || 'grade'}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="What comes next">
          <p className="text-sm leading-relaxed mb-3">{program.intro.graduation}</p>
          <ul className="grid grid-cols-1 gap-2">
            {program.nextPrograms.map((next) => {
              const target = getProgram(next.id);
              return (
                <li key={next.id} className="bg-sunken rounded-xl p-3">
                  <div className="font-semibold text-sm">
                    {target?.name ??
                      next.id
                        .split('_')
                        .map((w) => w[0]!.toUpperCase() + w.slice(1))
                        .join(' ')}
                  </div>
                  <p className="text-sm text-ink-soft mt-0.5">{next.reason}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
