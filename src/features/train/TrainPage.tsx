import { Link } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { PROGRAMS, STAGE_META, STAGE_ORDER } from '@/content/programs';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

export function TrainPage() {
  return (
    <>
      <PageHeader title="Train" subtitle="Structured climbing programs" />
      <div className="grid gap-5">
        {STAGE_ORDER.map((stage) => {
          const inStage = PROGRAMS.filter((p) => p.stage === stage);
          if (inStage.length === 0) return null;
          const meta = STAGE_META[stage];
          return (
            <section key={stage}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">{meta.label}</h2>
              <p className="text-sm text-ink-soft mb-2">{meta.blurb}</p>
              <div className="grid gap-2">
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

        <Card>
          <p className="text-sm text-ink-soft">
            All eleven programs are here. The finder that picks the right one for you — from your
            grade, goals, equipment, available days, and injuries — arrives with the next milestone.
          </p>
        </Card>
      </div>
    </>
  );
}
