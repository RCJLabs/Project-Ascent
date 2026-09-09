import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Copy, Plus, TriangleAlert } from 'lucide-react';
import { PROGRAMS } from '@/content/programs';
import { blankProgram, forkProgram, validateProgram } from '@/engine/customProgram';
import { useCustomPrograms } from '@/store/programs';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { useLocation } from 'wouter';

export function BuilderList() {
  const custom = useCustomPrograms((s) => s.custom);
  const save = useCustomPrograms((s) => s.save);
  const [, navigate] = useLocation();

  async function create(program = blankProgram()) {
    await save(program);
    navigate(`/build/${program.id}`);
  }

  return (
    <>
      <Link href="/train" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Train
      </Link>
      <PageHeader
        title="Your programs"
        subtitle="Write one from scratch, or take a copy of one that already works and change it."
      />

      <div className="grid grid-cols-1 gap-3">
        {custom.map((program) => {
          const issues = validateProgram(program);
          const errors = issues.filter((i) => i.level === 'error').length;
          return (
            <Link
              key={program.id}
              href={`/build/${program.id}`}
              className="block bg-surface border border-line rounded-2xl p-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-bold flex-1 min-w-0 truncate">{program.name}</span>
                <ArrowRight size={15} className="text-ink-soft shrink-0" />
              </div>
              <p className="text-sm text-ink-soft mt-0.5">
                {program.weeks} weeks · {program.sessionTypes.length} session type
                {program.sessionTypes.length === 1 ? '' : 's'}
              </p>
              {errors > 0 && (
                <p className="text-xs text-warn mt-1.5 flex items-center gap-1.5">
                  <TriangleAlert size={12} /> {errors} thing{errors === 1 ? '' : 's'} to finish before
                  you can run it
                </p>
              )}
            </Link>
          );
        })}

        <Card>
          <Button className="w-full mb-2" onClick={() => void create()}>
            <Plus size={16} /> Write a program
          </Button>
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Or start from one that already works. A copy is yours to change — the original is left
            alone.
          </p>
          <div className="flex flex-wrap gap-2">
            {PROGRAMS.filter((p) => p.kind === 'program').map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => void create(forkProgram(p))}>
                <Copy size={14} /> {p.name}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
