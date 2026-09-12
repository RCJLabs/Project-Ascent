import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Copy, Plus, Upload, TriangleAlert } from 'lucide-react';
import { PROGRAMS } from '@/content/programs';
import { blankProgram, forkProgram, validateProgram } from '@/engine/customProgram';
import { ProgramFileError, parseProgramFile } from '@/engine/programFile';
import { takeLaunchFile } from '@/lib/launchFile';
import { useCustomPrograms } from '@/store/programs';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { useLocation } from 'wouter';

export function BuilderList() {
  const custom = useCustomPrograms((s) => s.custom);
  const save = useCustomPrograms((s) => s.save);
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; lines: string[] } | null>(null);

  async function create(program = blankProgram()) {
    await save(program);
    navigate(`/build/${program.id}`);
  }

  /**
   * A program file the app was opened with (PLAN.md M111).
   *
   * The same path as the file picker, so a shared block opened from a file
   * manager behaves exactly as one chosen by hand — including naming what
   * could not survive the trip.
   */
  useEffect(() => {
    const opened = takeLaunchFile();
    if (opened) void readProgram(opened);
    // Once, on mount: `takeLaunchFile` clears as it returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await readProgram(file);
  }

  async function readProgram(file: File) {
    try {
      const { program, dropped } = parseProgramFile(await file.text());
      await save(program);
      // An import is never silently lossy: if anything could not survive the
      // trip, it is named before the program opens.
      setNotice({
        tone: 'good',
        lines: [
          `Imported "${program.name}"${program.author ? ` by ${program.author}` : ''}.`,
          ...dropped.map((d) => `Left out: ${d}.`),
        ],
      });
      if (dropped.length === 0) navigate(`/build/${program.id}`);
    } catch (e) {
      setNotice({
        tone: 'bad',
        lines: [e instanceof ProgramFileError ? e.message : 'That file could not be read.'],
      });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title="Your programs"
        subtitle="Write one from scratch, or take a copy of one that already works and change it."
      />

      <PageGrid>
        {notice && (
          <Card>
            <ul className="grid grid-cols-1 gap-1">
              {notice.lines.map((line, i) => (
                <li key={i} className={`text-sm ${i === 0 && notice.tone === 'bad' ? 'text-danger' : 'text-ink-soft'}`}>
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        )}

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

        <Card title="From someone else">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Open a program file a coach sent you. It arrives as a copy of your own — editable, and
            with no way to touch anything you already wrote.
          </p>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Open a program file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importFile(e.target.files)}
          />
        </Card>
      </PageGrid>
    </>
  );
}
