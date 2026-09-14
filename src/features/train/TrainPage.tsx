import { useMemo } from 'react';
import { Link } from 'wouter';
import { Activity, ChevronRight, Dumbbell, Flag, History, PenLine, Sparkles, Target, TriangleAlert } from 'lucide-react';
import { PROGRAMS, STAGE_META, STAGE_ORDER } from '@/content/programs';
import { canRun } from '@/engine/customProgram';
import { sortBlocks } from '@/engine/blocks';
import { today } from '@/engine/dates';
import { activeObjectives } from '@/engine/objectives';
import { activeProjects } from '@/engine/projects';
import { usePlannedDay } from '@/features/log/usePlannedDay';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { useCustomPrograms } from '@/store/programs';
import { useProjects } from '@/store/projects';
import { PickItUp } from './PickItUp';
import { PageHeader } from '@/ui/PageHeader';
import { displayRange } from '@/engine/grades';
import { useSettings } from '@/store/settings';

const HERO = 'bg-accent text-accent-ink rounded-2xl p-4 flex items-center gap-3 hover:bg-accent-strong transition-colors';
const ROW = 'bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors';

/**
 * The block you are running, on the tab named after it (PLAN.md M126).
 *
 * `TrainPage` read custom programs, objectives and projects and never
 * `activeProgramId`, so the tab called Train was a pure catalogue — it
 * offered to find you a program in week 6 of Iron Grip, and everything
 * about the block you were actually on lived on Home's card and the
 * calendar. A climber looking for *how is my block going* had nowhere to
 * look, and the one door to the block screen was a nudge that appears only
 * once a block has run out its weeks.
 *
 * So the running block is the hero here, and the finder steps down to a row
 * beneath it. When nothing is running the finder is the hero again, as it
 * was, with the history behind it if there is any.
 */
function YourBlock() {
  const { program, day } = usePlannedDay(today());
  const blocks = useProfile((s) => s.blocks);
  // Every row, not only the closed ones: this branch runs when nothing is
  // active, so there is no block to exclude — and a row left open by a
  // block that simply ran out its weeks is still one the climber ran
  // (`outcomeOf` reads that state as 'completed'). Newest first, the order
  // `sortBlocks` gives and the block screen relies on.
  const past = useMemo(() => sortBlocks(blocks), [blocks]);

  if (program === undefined) {
    return (
      <>
        <Link href="/find" className={`${HERO} mb-2`}>
          <Sparkles size={20} className="shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Find my program</div>
            <div className="text-sm opacity-90">Answer nine questions and get a pick with its reasoning</div>
          </div>
          <ChevronRight size={18} className="shrink-0" />
        </Link>
        {past.length > 0 && (
          <Link href="/finish" className={`${ROW} mb-5`}>
            <History size={18} className="shrink-0 text-accent" />
            <div className="flex-1 min-w-0">
              <div className="font-bold">Blocks you have run</div>
              <p className="text-sm text-ink-soft truncate">
                {past.length} behind you. The last was {past[0]!.name}.
              </p>
            </div>
            <ChevronRight size={18} className="text-ink-soft shrink-0" />
          </Link>
        )}
      </>
    );
  }

  // `day` is undefined when a program is active with no start date or plan,
  // which a restored backup can be. Saying "running" and nothing more is the
  // honest answer; the screen behind the link says the rest.
  const line =
    day === undefined
      ? 'Running now'
      : day.over
        ? 'Has run its course — see what it moved'
        : `Week ${day.week} of ${program.weeks}${day.phase ? ` · ${day.phase.name}` : ''}${day.isDeload ? ' · Deload' : ''}`;

  return (
    <>
      <Link href="/finish" className={`${HERO} mb-2`}>
        <Activity size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-2xs font-bold uppercase tracking-widest opacity-80">Your block</div>
          <div className="font-bold">{program.name}</div>
          <div className="text-sm opacity-90">{line}</div>
        </div>
        <ChevronRight size={18} className="shrink-0" />
      </Link>
      <Link href="/find" className={`${ROW} mb-5`}>
        <Sparkles size={18} className="shrink-0 text-accent" />
        <div className="flex-1 min-w-0">
          <div className="font-bold">Find another program</div>
          <p className="text-sm text-ink-soft">
            Starting one ends this block. Your history keeps it either way.
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </>
  );
}

export function TrainPage() {
  const display = useSettings((st) => st.display);
  const custom = useCustomPrograms((s) => s.custom);
  const objectives = useObjectives((s) => s.objectives);
  const active = activeObjectives(objectives);
  const projects = useProjects((s) => s.projects);
  const working = activeProjects(projects);
  return (
    <>
      <PageHeader title="Train" subtitle="Structured climbing programs" />
      {/* Above the block it is about, and only when there is a gap to talk
          about (PLAN.md M149). The coach says on Home that you have been
          away; this is the tab where something can be done about it. */}
      <PickItUp />
      <YourBlock />
      {/* Objectives and projects side by side (PLAN.md M117): the thing a
          program is for, and the climbs it is for. Projects had a tab of
          their own until the bar went to five; a project is training, so
          it lives with the training. */}
      <div className="grid grid-cols-1 gap-2 mb-5 sm:grid-cols-2">
        <Link
          href="/objectives"
          className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
        >
          <Flag size={18} className="shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">Objectives</div>
            <p className="text-sm text-ink-soft truncate">
              {active.length === 0
                ? 'The thing a program is for. Name what you are training toward.'
                : active.map((o) => o.name).join(' · ')}
            </p>
          </div>
          <ChevronRight size={18} className="text-ink-soft shrink-0" />
        </Link>
        <Link
          href="/projects"
          className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
        >
          <Target size={18} className="shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">Projects</div>
            <p className="text-sm text-ink-soft truncate">
              {working.length === 0
                ? 'Climbs you are working, with their burns and high points.'
                : working.map((p) => p.name).join(' · ')}
            </p>
          </div>
          <ChevronRight size={18} className="text-ink-soft shrink-0" />
        </Link>
        {/* The library, where the app's own guide has always said it is
            (PLAN.md M152). Its one in-app door was a chip in Settings'
            reference row, beside the guides and the glossary — but a drill
            is prescribed by a program and put on today's session, which is
            training rather than documentation. */}
        <Link
          href="/drills"
          className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors sm:col-span-2"
        >
          <Dumbbell size={18} className="shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">Drills</div>
            <p className="text-sm text-ink-soft truncate">
              A hundred and fifty-odd, twelve of which need no wall. Any of them can go on today.
            </p>
          </div>
          <ChevronRight size={18} className="text-ink-soft shrink-0" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-5">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Yours</h2>
          <p className="text-sm text-ink-soft mb-2">Programs you wrote, and copies you have changed.</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {custom.map((program) => (
              <Link
                key={program.id}
                href={canRun(program) ? `/train/${program.id}` : `/build/${program.id}`}
                className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold">{program.name || 'Untitled'}</span>
                    <span className="text-xs font-semibold text-accent">{program.weeks} weeks</span>
                  </div>
                  <p className="text-sm text-ink-soft truncate">
                    {canRun(program) ? (
                      program.subtitle || 'Yours'
                    ) : (
                      <span className="text-warn inline-flex items-center gap-1">
                        <TriangleAlert size={12} /> Not finished yet
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight size={18} className="text-ink-soft shrink-0" />
              </Link>
            ))}
            <Link
              href="/build"
              className="bg-surface border border-line border-dashed rounded-2xl p-4 flex items-center gap-3 text-ink-soft"
            >
              <PenLine size={18} className="shrink-0" />
              <span className="flex-1 text-sm font-semibold">
                {custom.length === 0 ? 'Write your own program' : 'Write another'}
              </span>
              <ChevronRight size={18} className="shrink-0" />
            </Link>
          </div>
        </section>

        {STAGE_ORDER.map((stage) => {
          const inStage = PROGRAMS.filter((p) => p.stage === stage);
          if (inStage.length === 0) return null;
          const meta = STAGE_META[stage];
          return (
            <section key={stage}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">{meta.label}</h2>
              <p className="text-sm text-ink-soft mb-2">{meta.blurb}</p>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {inStage.map((program) => (
                  <Link
                    key={program.id}
                    href={`/train/${program.id}`}
                    className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold">{program.name}</span>
                        {program.kind === 'mode' ? (
                          <span className="text-2xs font-bold uppercase tracking-wide text-ink-soft border border-line rounded px-1.5 py-0.5">
                            Log only
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-accent">
                            {displayRange(program.gradeRange, display)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-soft truncate">{program.subtitle}</p>
                    </div>
                    <ChevronRight size={18} className="text-ink-soft shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

      </div>
    </>
  );
}
