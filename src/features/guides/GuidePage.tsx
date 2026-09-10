import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { GUIDES, getGuide, guideLength } from '@/content/guides';
import { getProgram } from '@/content/programs';
import { BackLink } from '@/ui/BackLink';
import { EmptyState } from '@/ui/EmptyState';
import { DisclosureButton } from '@/ui/Disclosure';
import { PageHeader } from '@/ui/PageHeader';
import { Block } from './GuideBody';

/** Every guide, in reading order. */
export function GuideList() {
  return (
    <>
      <BackLink />
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
      <BackLink />
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
              {/* The heading wraps the control, which is the accordion
                  pattern a screen reader can navigate by heading. A span
                  inside a button is neither. */}
              <h2>
                <DisclosureButton
                  open={isOpen}
                  onToggle={() => toggle(index)}
                  className="flex items-center gap-2.5 p-4"
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
                </DisclosureButton>
              </h2>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-line pt-3">
                  {section.content.map((block, i) => (
                    <Block
                      key={i}
                      block={block}
                      {...(program?.deloadWeeks ? { deloadWeeks: program.deloadWeeks } : {})}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <EmptyState>
          Guides explain; the programs decide. Nothing here changes a plan, a session or a
          prescription — if a guide and its program disagree, the program is what the app runs and
          the guide is what needs fixing.
        </EmptyState>
      </div>
    </>
  );
}
