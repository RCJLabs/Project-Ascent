import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, BookOpen, ChevronRight, Clock, Layers, Play, Timer } from 'lucide-react';
import { getDrill } from '@/content/drills';
import { guideSummaryFor } from '@/content/guides/summary';
import { getMetric } from '@/content/metrics';
import { getProtocol } from '@/content/protocols';
import { getProgram } from '@/content/programs';
import type { Exercise, Phase, SessionType, TrackId } from '@/content/types';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { Term } from '@/ui/Term';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { displayRange } from '@/engine/grades';
import { prescriptionLine } from '@/engine/prescription';
import { useSettings } from '@/store/settings';

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
            <Term name={ex.name} className="font-semibold text-sm" />
            {protocol?.timer && (
              <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-accent border border-accent/40 rounded px-1.5 py-0.5">
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
                  <div className="mb-2.5 pb-2.5 border-b border-line">
                    <p className="text-2xs font-bold uppercase tracking-wide text-ink-soft">
                      {prescriptionLine(entry.selection, entry.circuit, shown.length)}
                    </p>
                    {/* How to choose, which is the part that moves from
                        phase to phase in a menu whose dose does not
                        (PLAN.md M90). Eighteen prescriptions carry one and
                        nothing had ever rendered it. */}
                    {entry.selection?.note && (
                      <p className="text-sm text-ink-soft mt-1.5">{entry.selection.note}</p>
                    )}
                  </div>
                )}
                <ul className="grid grid-cols-1 gap-2.5">
                  {shown.map((ex, i) => (
                    <ExerciseRow key={`${ex.name}-${i}`} ex={ex} />
                  ))}
                </ul>
                {/* Below the dose, because that is where the question forms
                    (PLAN.md M90). M33 required this sentence of any block
                    that runs an identical dose for the whole program, on the
                    grounds that such a block "has to say so out loud rather
                    than reading as an oversight" — and then nothing rendered
                    it, so the block went on reading as an oversight. */}
                {block.constantDose && (
                  <p className="text-xs text-ink-soft leading-relaxed mt-3 pt-3 border-t border-line">
                    {/* Not "Same all 12 weeks": two of the four authored
                        reasons open with "Same", and the label stuttered
                        into them. The sentence carries the duration. */}
                    <span className="font-bold uppercase tracking-wide text-2xs">
                      Unchanged by design ·{' '}
                    </span>
                    {block.constantDose}
                  </p>
                )}
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
                      <span className="text-2xs font-bold uppercase tracking-wide text-ink-soft">
                        Week {week}
                      </span>
                      {deloadWeeks.has(week) && (
                        <span className="text-2xs font-bold uppercase tracking-wide text-warn">
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
  const display = useSettings((s) => s.display);
  const program = getProgram(params.id);
  const guide = guideSummaryFor(params.id);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [track, setTrack] = useState<TrackId | null>(null);

  if (!program) {
    // Was "That program has not been converted yet" — true of the prototype
    // port, and untrue since every program in the catalogue is data.
    return (
      <RecordNotFound what="That program" backTo="/train" backLabel="Back to Train">
        It may have been a custom program you deleted.
      </RecordNotFound>
    );
  }

  const phase = program.phases[phaseIndex]!;
  const activeTrack = track ?? program.tracks?.[0]?.id ?? null;
  const deloadWeeks = new Set(program.deloadWeeks ?? []);
  const blockName = (blockId: string) =>
    program.sessionTypes.flatMap((t) => t.blocks ?? []).find((b) => b.id === blockId)?.name ?? blockId;

  return (
    <>
      <BackLink />
      <PageHeader
        title={program.name}
        subtitle={program.author ? `${program.subtitle} · by ${program.author}` : program.subtitle}
      />

      <div className="grid grid-cols-1 gap-3">
        {guide && (
          <Link
            href={`/guides/${guide.id}`}
            className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
          >
            <BookOpen size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Read the guide</div>
              <p className="text-xs text-ink-soft truncate">
                {guide.sections} sections on why this program is built the way it is
              </p>
            </div>
            <ChevronRight size={16} className="text-ink-soft shrink-0" />
          </Link>
        )}

        <Card>
          <div className="flex gap-4 mb-3">
            <div>
              <div className="text-2xl font-black leading-none">{program.weeks}</div>
              <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1">
                {program.adaptedFrom === undefined ? 'Weeks' : `of ${program.adaptedFrom}`}
              </div>
            </div>
            <div>
              <div className="text-2xl font-black leading-none">
                {displayRange(program.gradeRange, display)}
              </div>
              <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1">Grades</div>
            </div>
            <div>
              <div className="text-2xl font-black leading-none">{program.phases.length}</div>
              <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1">Phases</div>
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
                    <div className="text-2xs font-bold uppercase text-ink-soft">{label}</div>
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
                <OptionCard
                  key={t.id}
                  active={activeTrack === t.id}
                  onClick={() => setTrack(t.id)}
                  label={t.name}
                  blurb={t.description}
                />
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
              <Button
                key={p.id}
                variant={i === phaseIndex ? 'primary' : 'outline'}
                onClick={() => setPhaseIndex(i)}
                aria-pressed={i === phaseIndex}
                className="shrink-0 flex-col gap-0 items-start"
              >
                <span className="block text-2xs uppercase tracking-wide opacity-80">
                  Weeks {p.weekStart}-{p.weekEnd}
                </span>
                {p.name}
              </Button>
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
