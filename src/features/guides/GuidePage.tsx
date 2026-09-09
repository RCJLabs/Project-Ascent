import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { GUIDES, getGuide, guideLength } from '@/content/guides';
import { getProgram } from '@/content/programs';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { Block } from './GuideBody';

/** Every guide, in reading order. */
export function GuideList() {
  return (
    <>
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Settings
      </Link>
      <PageHeader
        title="Guides"
        subtitle="How the app works, how to start climbing, and the writing behind every program."
      />

      <div className="grid grid-cols-1 gap-2">
        {GUIDES.map((guide) => {
          const program = getProgram(guide.id);
          const { sections } = guideLength(guide);
          return (
            <Link
              key={guide.id}
              href={`/guides/${guide.id}`}
              className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 hover:border-accent transition-colors"
            >
              <BookOpen size={18} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{guide.name}</div>
                <p className="text-sm text-ink-soft truncate">
                  {guide.subtitle ?? `${sections} sections`}
                </p>
                {program && (
                  <p className="text-xs text-ink-soft mt-0.5">Companion to the {program.name} program</p>
                )}
              </div>
              <ChevronRight size={18} className="text-ink-soft shrink-0" />
            </Link>
          );
        })}
      </div>
    </>
  );
}

/**
 * One guide.
 *
 * Sections are collapsed by default with the first one open. These run to
 * thirteen sections and several thousand words; a single scroll would bury
 * the contents, and the contents are how anyone finds week seven again.
 */
export function GuidePage({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const guide = getGuide(params.id);
  const [open, setOpen] = useState<number[]>([0]);

  useEffect(() => {
    if (!guide) navigate('/guides', { replace: true });
  }, [guide, navigate]);

  // A different guide is a different document — start it at the top.
  useEffect(() => {
    setOpen([0]);
  }, [params.id]);

  const program = useMemo(() => (guide ? getProgram(guide.id) : undefined), [guide]);

  if (!guide) return null;

  const toggle = (index: number) =>
    setOpen((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );

  return (
    <>
      <Link href="/guides" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Guides
      </Link>
      <PageHeader title={guide.name} subtitle={guide.subtitle} />

      <div className="grid grid-cols-1 gap-2">
        {program && (
          <Link
            href={`/train/${program.id}`}
            className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 mb-1"
          >
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{program.name}</div>
              <p className="text-xs text-ink-soft truncate">
                {program.weeks} weeks · the program this guide is about
              </p>
            </div>
            <ArrowRight size={16} className="text-ink-soft shrink-0" />
          </Link>
        )}

        {guide.sections.map((section, index) => {
          const isOpen = open.includes(index);
          return (
            <section key={section.title} className="bg-surface border border-line rounded-2xl">
              <button
                onClick={() => toggle(index)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 p-4 text-left"
              >
                <span className="text-xs font-bold text-ink-soft tabular-nums shrink-0 w-5">
                  {index + 1}
                </span>
                <span className="flex-1 min-w-0 font-bold">{section.title}</span>
                {isOpen ? (
                  <ChevronDown size={16} className="text-ink-soft shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-ink-soft shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-line pt-3">
                  {section.content.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <Card>
          <p className="text-sm text-ink-soft leading-relaxed">
            Guides explain; the programs decide. Nothing here changes a plan, a session or a
            prescription — if a guide and its program disagree, the program is what the app runs and
            the guide is what needs fixing.
          </p>
        </Card>
      </div>
    </>
  );
}
