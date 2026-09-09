import { Link } from 'wouter';
import { ChevronRight, Flag, PenLine, Sparkles, TriangleAlert } from 'lucide-react';
import { PROGRAMS, STAGE_META, STAGE_ORDER } from '@/content/programs';
import { canRun } from '@/engine/customProgram';
import { activeObjectives } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { useCustomPrograms } from '@/store/programs';
import { PageHeader } from '@/ui/PageHeader';

export function TrainPage() {
  const custom = useCustomPrograms((s) => s.custom);
  const objectives = useObjectives((s) => s.objectives);
  const active = activeObjectives(objectives);
  return (
    <>
      <PageHeader title="Train" subtitle="Structured climbing programs" />
      <Link
        href="/find"
        className="bg-accent text-accent-ink rounded-2xl p-4 flex items-center gap-3 mb-5 hover:bg-accent-strong transition-colors"
      >
        <Sparkles size={20} className="shrink-0" />
        <div className="flex-1">
          <div className="font-bold">Find my program</div>
          <div className="text-sm opacity-90">Answer seven questions and get a pick with its reasoning</div>
        </div>
        <ChevronRight size={18} className="shrink-0" />
      </Link>
      <Link
        href="/objectives"
        className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 mb-5 hover:border-accent transition-colors"
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
      <div className="grid grid-cols-1 gap-5">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Yours</h2>
          <p className="text-sm text-ink-soft mb-2">Programs you wrote, and copies you have changed.</p>
          <div className="grid grid-cols-1 gap-2">
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
              <div className="grid grid-cols-1 gap-2">
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
                          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft border border-line rounded px-1.5 py-0.5">
                            Log only
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-accent">
                            {program.gradeRange.label}
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
