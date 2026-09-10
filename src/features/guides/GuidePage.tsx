import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { GUIDES, getGuide, guideLength } from '@/content/guides';
import { getProgram } from '@/content/programs';
import { BackLink } from '@/ui/BackLink';
import { EmptyState } from '@/ui/EmptyState';
import { DisclosureButton } from '@/ui/Disclosure';
import { PageHeader } from '@/ui/PageHeader';
import { Block } from './GuideBody';
import { RecordNotFound } from '@/ui/RecordNotFound';

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
export function GuidePage({ params }: { params: { id: string; section?: string } }) {
  const guide = getGuide(params.id);
  /**
   * The section a link asked for, as an index (PLAN.md M65).
   *
   * One-based in the URL because that is the number printed beside the
   * heading, and a link a climber can read is worth an off-by-one here.
   * Anything that is not a section of this guide is ignored rather than
   * treated as the first one — a stale link should open the document, not
   * silently show a different passage.
   */
  const asked = Number(params.section);
  const wanted =
    guide !== undefined && Number.isInteger(asked) && asked >= 1 && asked <= guide.sections.length
      ? asked - 1
      : null;

  // Opened in the initial state as well as in the effect below, so the
  // first paint is already on the asked-for section. The effect covers a
  // later change of section; this covers the flash of section one before it
  // runs, which is real on screen and invisible to a test.
  const [open, setOpen] = useState<number[]>([wanted ?? 0]);
  const target = useRef<HTMLElement | null>(null);

  // A different guide — or a different section of one — is a different
  // place to be, so it starts there rather than where the last one was.
  useEffect(() => {
    setOpen([wanted ?? 0]);
  }, [params.id, wanted]);

  // And it is scrolled to, because opening the ninth section of a guide
  // without moving leaves a climber looking at the first one.
  //
  // Whenever a section was *asked for*, including the first — skipping the
  // scroll for section one meant following a link to it from section six
  // left the reader 1,473 pixels below the thing they had asked to read. A
  // guide opened without a section in the URL is a different case and is
  // left where it starts.
  useEffect(() => {
    if (wanted === null) return;
    target.current?.scrollIntoView({ block: 'start' });
  }, [params.id, wanted]);

  const program = useMemo(() => (guide ? getProgram(guide.id) : undefined), [guide]);

  if (!guide) {
    return (
      <RecordNotFound what="That guide" backTo="/guides" backLabel="Back to guides">
        Every guide the app ships is listed there.
      </RecordNotFound>
    );
  }

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
                {program.adaptedFrom ?? program.weeks} weeks · the program this guide is about
              </p>
            </div>
            <ArrowRight size={16} className="text-ink-soft shrink-0" />
          </Link>
        )}

        {/* The guide is written against the program as written. A climber
            running it over fewer weeks is reading week numbers that no
            longer match their calendar, and finding that out from the
            calendar is finding it out too late (PLAN.md M56). */}
        {program?.adaptedFrom !== undefined && (
          <p className="text-sm text-warn border border-line rounded-2xl p-4">
            You are running {program.name} over {program.weeks} weeks. This guide describes the
            written {program.adaptedFrom}-week block, so its week numbers are that one&apos;s — the
            phases and the sessions are the same.
          </p>
        )}

        {guide.sections.map((section, index) => {
          const isOpen = open.includes(index);
          return (
            <section
              key={section.title}
              ref={index === wanted ? target : undefined}
              className="bg-surface border border-line rounded-2xl scroll-mt-4"
            >
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
