import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Activity, AlertTriangle, BookOpen, ChevronDown, ChevronRight, ChevronUp, Clock, FileText, Layers, Pencil, Play, Timer } from 'lucide-react';
import { getDrill } from '@/content/drills';
import { drillText } from '@/content/drillText';
import { guideSummaryFor } from '@/content/guides/summary';
import { getMetric } from '@/content/metrics';
import { getProtocol } from '@/content/protocols';
import { PROGRAMS, getProgram } from '@/content/programs';
import { INTENSITY_LABEL, type Exercise, type Phase, type Program, type SessionType, type TrackId } from '@/content/types';
import { today } from '@/engine/dates';
import { dosageLine } from '@/engine/prescription';
import { countChanges, programChanges } from '@/engine/programChanges';
import { handoutName, programHandout } from '@/engine/programHandout';
import { downloadText } from '@/lib/download';
import { intensityOf } from '@/engine/scheduler';
import { describeWork, sessionMinutes } from '@/engine/sessionLength';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { Term } from '@/ui/Term';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { EQUIPMENT_LABELS } from '@/engine/customProgram';
import { displayRange } from '@/engine/grades';
import { prescriptionLine } from '@/engine/prescription';
import { DELOAD_STEP, deloadLightens } from '@/engine/plan';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { useSettings } from '@/store/settings';
import { useProfile } from '@/store/profile';
import { kitList, missingKit } from '@/engine/kit';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  program,
  phase,
  blockName,
  track,
  deloadWeeks,
}: {
  type: SessionType;
  program: Program;
  phase: Phase;
  blockName: (blockId: string) => string;
  track: TrackId | null;
  deloadWeeks: Set<number>;
}) {
  // How hard and how long, on the page where a climber is choosing a
  // program rather than starting one (PLAN.md M138). The number existed for
  // the day you were about to do and not for the block you were picking.
  const spent = describeWork(
    sessionMinutes({ type, program, week: phase.weekStart, ...(track ? { trackId: track } : {}) }),
  );
  return (
    <Card>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg leading-none">{type.icon}</span>
        <h3 className="font-bold">{type.name}</h3>
      </div>
      <p className="text-sm mb-1">
        <span className="font-semibold">{INTENSITY_LABEL[intensityOf(type)]}</span>
        {spent && <span className="text-ink-soft"> · {spent}</span>}
      </p>
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
                {/* How the dose moves inside the phase (PLAN.md M127, M128).
                    The week numbers are the program's, not the phase's: an
                    author writes "week 2 of this phase" and a climber reads
                    "week 6", and the page is for the climber.

                    Deload weeks the block said nothing about are in here
                    too, derived. They are the ones a climber most needs to
                    see in advance, and before M128 the only sign of one was
                    a marker in the drill list. */}
                {(() => {
                  const rows = Array.from(
                    { length: phase.weekEnd - phase.weekStart + 1 },
                    (_, i) => i + 1,
                  ).flatMap((inPhase) => {
                    const week = phase.weekStart + inPhase - 1;
                    const authored = entry.perWeek?.find((w) => w.week === inPhase);
                    if (authored) return [{ week, step: authored.step, deload: deloadWeeks.has(week) }];
                    if (!deloadWeeks.has(week) || !deloadLightens(entry)) return [];
                    return [{ week, step: DELOAD_STEP, deload: true }];
                  });
                  if (rows.length === 0) return null;
                  return (
                    <div className="mt-2.5 pt-2.5 border-t border-line">
                      <p className="text-2xs font-bold uppercase tracking-wide text-ink-soft mb-1.5">
                        How it moves
                      </p>
                      <ul className="grid grid-cols-1 gap-1.5">
                        {rows.map((r) => (
                          <li key={r.week} className="text-sm text-ink-soft leading-relaxed flex gap-2">
                            <span className="font-semibold text-ink shrink-0 tabular-nums">
                              Wk {r.week}
                            </span>
                            <span>
                              {/* Only where the sentence does not already
                                  say it. Both the derived note and the two
                                  authored deload weeks open with the word,
                                  and the marker beside them read "Deload
                                  Deload. Three sets on the same edge" —
                                  caught in the browser. */}
                              {r.deload && !/^deload/i.test(r.step) && (
                                <span className="text-2xs font-bold uppercase tracking-wide text-warn mr-1.5">
                                  Deload
                                </span>
                              )}
                              {r.step}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
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
                    <p className="text-sm text-ink-soft mt-1 leading-relaxed">{drillText(drill.id)}</p>
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

/**
 * What the button says when you are already running something
 * (PLAN.md M126).
 *
 * It said *Start this program* unconditionally — on the program you are in
 * week 6 of, with no sign that you are, and on a second program with no
 * sign that starting it ends the first. `startProgram` closes the open row
 * with `'switched'` and always did; the record was honest and the screen
 * said nothing, so the climber was the only one who did not know.
 *
 * Three states: this is the block you are on, another block is open, or
 * nothing is running. Only the last one is the plain button it used to be.
 */
/**
 * The half of "what you need" that was missing (PLAN.md M251).
 *
 * The comment above that block has said since it was written that the finder
 * already refuses a program on kit and the page did not — and the page went on
 * printing the requirement without ever comparing it to the climber's answer.
 * A climber with the default `['wall', 'gym']` could open Iron Grip, read
 * *"Climbing wall · Hangboard"*, tap Start, and meet the gap at the first
 * fingerboard session, while the finder two taps away called the same program
 * blocked.
 *
 * **It says and does not decide.** That is `kit.ts`'s own rule about this
 * field — the climber may be at a friend's board, may have bought one this
 * morning, and M236 reads *running a program* as evidence of owning its kit.
 * So the button is untouched and the sentence is a warning, in the finder's
 * words, from the finder's rule.
 */
function MissingKit({ program }: { program: Program }): React.ReactElement | null {
  const equipment = useProfile((s) => s.equipment);
  const missing = missingKit(program.equipment, equipment);
  // Helpful kit never blocks in the finder either: "if the program runs
  // without it, it runs." The ternary below is what keeps a program from
  // saying both — a second guard here read as belt and braces and was dead
  // code, which the battery pointed out by removing it to no effect.
  const helpful = missingKit(program.helpfulEquipment ?? [], equipment);
  if (missing.length === 0 && helpful.length === 0) return null;
  return (
    <p className={`text-xs mb-2 flex items-start gap-1.5 ${missing.length > 0 ? 'text-warn' : 'text-ink-soft'}`}>
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
      <span>
        {missing.length > 0
          ? `This needs ${kitList(missing)}, which your kit does not list. You can still run it — Settings is where the answer lives if it has changed.`
          : `Runs without ${kitList(helpful, 'or')}, which your kit does not list — some of the loading work needs improvising.`}
      </span>
    </p>
  );
}

function StartOrOpen({ programId, kind }: { programId: string; kind: string }) {
  const { program: runningProgram, day } = usePlannedDay(today());
  if (kind !== 'program') return null;

  const mine = runningProgram?.id === programId;
  const week =
    day === undefined || day.over
      ? null
      : `Week ${day.week} of ${runningProgram?.weeks ?? '?'}${day.phase ? ` · ${day.phase.name}` : ''}`;
  // Without the phase, because this one reads mid-sentence. Lowercasing the
  // full line to make it fit turned The Anvil (Repeaters) into "the anvil
  // (repeaters)", which the browser caught and jsdom could not.
  const weekShort =
    day === undefined || day.over ? null : `week ${day.week} of ${runningProgram?.weeks ?? '?'}`;

  if (mine) {
    return (
      <div className="grid grid-cols-1 gap-2">
        <Link
          href="/finish"
          className="focus-ring inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3 hover:bg-accent-strong transition-colors"
        >
          <Activity size={16} /> {day?.over === true ? 'See how it went' : 'How this block is going'}
        </Link>
        <p className="text-xs text-ink-soft text-center">
          {day?.over === true
            ? 'You are on this one, and it has run its weeks.'
            : `You are on this one${week ? ` · ${week}` : ''}.`}
        </p>
        <Link
          href={`/train/${programId}/start`}
          className="focus-ring inline-flex items-center justify-center gap-2 w-full bg-transparent text-ink border border-line font-semibold rounded-xl py-2.5 hover:bg-sunken transition-colors"
        >
          Change my week
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <Link
        href={`/train/${programId}/start`}
        className="focus-ring inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3 hover:bg-accent-strong transition-colors"
      >
        <Play size={16} /> Start this program
      </Link>
      {runningProgram !== undefined && (
        <p className="text-xs text-warn flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            Starting this ends {runningProgram.name}
            {weekShort ? ` in ${weekShort}` : ''}. Your history keeps it, and you can pick it up
            again where you left off.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * What a copy changed from the program it was copied from, as a way to the
 * list (PLAN.md M334).
 *
 * M333 put the list above the builder, which is where an athlete lands when
 * they open the program their coach sent — and this page, not the builder,
 * is where they decide to run it and tap Start. So it says here too, in one
 * row: whose changes, how many, and where in the program. The lines
 * themselves stay in the builder, because this page is one screen on
 * purpose (M121) and a coach's reply can run to dozens of them.
 */
function ChangedFrom({ program }: { program: Program }) {
  const origin = program.forkedFrom;
  const source = origin ? PROGRAMS.find((p) => p.id === origin.id) : undefined;
  const groups = useMemo(() => (source ? programChanges(source, program) : []), [source, program]);
  if (!origin) return null;

  const count = countChanges(groups);
  const title = program.author
    ? `What ${program.author} changed from ${origin.name}`
    : `What changed from ${origin.name}`;
  const detail = !source
    ? `${origin.name} is not in this version of the app, so there is nothing to compare with`
    : count === 0
      ? `Nothing — it is still ${origin.name} as the app ships it`
      : `${count} ${count === 1 ? 'change' : 'changes'}: ${groups.map((g) => g.title).join(', ')}`;
  return (
    <Link
      href={`/build/${program.id}`}
      className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
    >
      <Pencil size={18} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{title}</div>
        <p className="text-xs text-ink-soft">{detail}</p>
      </div>
      <ChevronRight size={16} className="text-ink-soft shrink-0" />
    </Link>
  );
}

export function ProgramDetailPage({ params }: { params: { id: string } }) {
  const display = useSettings((s) => s.display);
  const program = getProgram(params.id);
  const guide = guideSummaryFor(params.id);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [track, setTrack] = useState<TrackId | null>(null);
  /**
   * The week-by-week, folded (PLAN.md M121).
   *
   * The page was the whole program at once — pitch, rhythm, rules, the
   * week, the tracks, every phase's every session's every exercise, the
   * benchmarks, what comes after — and a climber deciding whether to run
   * it scrolled through all of that to find the button. One screen now:
   * what it is for, how long, what a week looks like, what you need, the
   * guide, and Start. What's in it is a tap, and not remembered: a program
   * page is read once, not opened every day.
   */
  const [open, setOpen] = useState(false);

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

          {/* What a week looks like, on the overview rather than four cards
              down: it is the thing a climber with a job checks first. */}
          {program.recommendedLayout && (
            <div className="mb-3">
              <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
                A week · {program.recommendedLayout.name}
              </div>
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
              <p className="text-xs text-ink-soft mt-1.5">{program.recommendedLayout.description}</p>
            </div>
          )}

          {/* What you need. The finder already refuses a program on this;
              the page said nothing, so a climber arriving from the
              catalogue found out at the first fingerboard session. */}
          <div className="mb-3">
            <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
              What you need
            </div>
            <p className="text-sm">
              {program.equipment.length === 0 || (program.equipment.length === 1 && program.equipment[0] === 'none')
                ? EQUIPMENT_LABELS.none
                : program.equipment
                    .filter((e) => e !== 'none')
                    .map((e) => EQUIPMENT_LABELS[e])
                    .join(' · ')}
            </p>
          </div>

          <MissingKit program={program} />
          <StartOrOpen programId={program.id} kind={program.kind} />
        </Card>

        <ChangedFrom program={program} />

        {program.prerequisites && (
          <Card title="Before you start">
            <p className="text-sm leading-relaxed">{program.prerequisites.note}</p>
          </Card>
        )}

        {guide && (
          <Link
            href={`/guides/${guide.id}`}
            className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
          >
            <BookOpen size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Read the full guide</div>
              <p className="text-xs text-ink-soft truncate">
                {guide.sections} sections on why this program is built the way it is
              </p>
            </div>
            <ChevronRight size={16} className="text-ink-soft shrink-0" />
          </Link>
        )}

        <Button
          variant="outline"
          className="w-full"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <>
              <ChevronUp size={16} /> Less
            </>
          ) : (
            <>
              <ChevronDown size={16} /> What's in it — how it runs, every session, the benchmarks
            </>
          )}
        </Button>

        {open && (
          <>
        <Card title="How it runs">
          <ul className="grid grid-cols-1 gap-2 mb-3">
            {program.intro.rhythm.map((line, i) => (
              <li key={i} className="text-sm text-ink-soft leading-relaxed flex gap-2">
                <span className="text-accent font-bold shrink-0">{i + 1}</span>
                {line}
              </li>
            ))}
          </ul>
          {/* Only where there is something to put in it (PLAN.md M155).
              The two programs with no constraints are the logging modes,
              General Training and Outdoor Climbing, and for them this was a
              grey panel with nothing in it under a heading promising to say
              how the program runs. What they have to say is the rhythm
              above, which is where they say it. */}
          {program.constraints.length > 0 && (
            <div className="bg-sunken rounded-xl p-3 grid grid-cols-1 gap-1.5">
              {program.constraints.map((c, i) => (
                <p key={i} className="text-sm flex gap-2 items-start">
                  <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
                  {c.note}
                </p>
              ))}
            </div>
          )}
        </Card>

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
                  program={program}
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
          </>
        )}

        {/**
         * The program, for someone who has not got the app (PLAN.md M317).
         *
         * M288 built this and put it in the builder, where it could only
         * ever hand over a program the coach had written themselves — and a
         * coach is at least as likely to put an athlete on Iron Grip. The
         * generator took any `Program` from the day it was written.
         *
         * Outside the fold rather than behind it. What is back there is the
         * program explained to the person deciding whether to run it; this
         * is a thing you do with the program once you have decided, and the
         * fold's label does not mention it — M295 settled that a fold which
         * lists half its contents is worse than one that lists none, so a
         * card nobody would think to look behind goes in front.
         *
         * No *"Save as a file"* beside it, which the builder does have. The
         * file exists to carry a program to another copy of the app, and
         * every copy of the app already has this one.
         */}
        <Card title="Write it out">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            One page of text an athlete can open anywhere — the week, the blocks, every session and
            its doses. Nothing to install, and nothing that needs this app.
          </p>
          <Button variant="outline" onClick={() => shareHandout(program)}>
            <FileText size={15} /> Save as a handout
          </Button>
        </Card>
      </div>
    </>
  );
}

/**
 * The same download the builder offers, from the page the catalogue has.
 *
 * `downloadText` rather than an anchor of its own: M292 found two bugs in
 * the hand-rolled version — a detached anchor and a synchronous revoke —
 * and `lib/download.ts` exists to have them fixed in one place.
 */
function shareHandout(program: Program): void {
  downloadText(programHandout(program, today()), handoutName(program), 'text/markdown');
}
