import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { PencilLine, Upload } from 'lucide-react';
import { PROGRAMS } from '@/content/programs';
import { blankProgram, forkProgram } from '@/engine/customProgram';
import { holdWritingFor } from '@/lib/writingFor';
import { useCustomPrograms } from '@/store/programs';
import {
  BlockFileError,
  labelFor,
  outcomeWord,
  parseBlockFile,
  type SharedBlock,
  type SharedResult,
} from '@/engine/blockFile';
import { shortLabel } from '@/engine/dates';
import { takeLaunchFile } from '@/lib/launchFile';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';

/**
 * Somebody else's block, read and kept nowhere (PLAN.md M292).
 *
 * The coaching loop's return leg. `programFile.ts` sends a block out; this
 * reads one coming back, and the whole design turns on what it refuses to
 * do: **nothing here writes to a store.** M219's race tape is the precedent
 * and says why in one line — *"the run counts for the race and for nothing
 * else, and the card says so."*
 *
 * The alternative was the obvious one, and it is wrong: the app already has
 * two importers, and both of them merge into the climber's own records. An
 * athlete's block absorbed that way would move the coach's ladders, venues,
 * year and load ratio, which is a worse answer than not reading the file at
 * all.
 *
 * So the page holds it in state for as long as the tab is open, and says so
 * where a coach can read it rather than in a comment.
 */
export function SharedBlockPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [block, setBlock] = useState<SharedBlock | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** A block file the app was opened with, the same path as the picker. */
  useEffect(() => {
    const opened = takeLaunchFile();
    if (opened) void read(opened);
    // Once, on mount: `takeLaunchFile` clears as it returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function read(file: File): Promise<void> {
    try {
      setBlock(parseBlockFile(await file.text()));
      setProblem(null);
    } catch (e) {
      setBlock(null);
      setProblem(e instanceof BlockFileError ? e.message : 'That file could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title="A block somebody sent you"
        subtitle="Open the file an athlete saved from their own Block review."
      />

      <PageGrid>
        <Card>
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            It carries what their block moved and nothing else — no sessions, no places, no
            partners, no notes, no photos. Nothing on this screen is saved: it is here while the
            tab is, and none of it touches your own grades, your log or your numbers.
          </p>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Open a block file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void read(picked);
            }}
          />
          {problem && <p className="text-sm text-danger mt-3">{problem}</p>}
        </Card>

        {block && <BlockView block={block} />}
        {block && <WriteBack block={block} />}
      </PageGrid>
    </>
  );
}

/**
 * The way back (PLAN.md M322).
 *
 * A coach reads a block and then does one of two things: sends the same
 * program with changes, or writes a new one. Both of those already worked end
 * to end — `forkProgram` copies any catalogue program, the builder edits it,
 * *Save as a file* exports it and `BuilderList`'s **From someone else** opens
 * it at the athlete's end. What did not exist was the step between reading
 * their numbers and starting, so this is a link and not a fourth file format,
 * which is what M298a's entry asked for.
 *
 * **The program they ran is matched by name**, because that is what the file
 * carries: `blockFile.ts` writes `report.program.name` and no id, and adding
 * one would be a schema change for a lookup that already resolves for all
 * eleven programs a climber can run. A block from a program this app does not
 * ship — one they wrote themselves, or one of the two modes, which prescribe
 * nothing to change — matches nothing, and the card says so rather than
 * offering a copy of something else.
 */
function WriteBack({ block }: { block: SharedBlock }) {
  const save = useCustomPrograms((s) => s.save);
  const [, navigate] = useLocation();
  // `kind === 'program'`, the same filter the builder's own copy buttons use:
  // a mode is a menu with no prescription in it, so there is nothing a coach
  // could change and send back.
  const ran = PROGRAMS.find((p) => p.kind === 'program' && p.name === block.program);

  async function start(program: Parameters<typeof save>[0]) {
    await save(program);
    // Held in memory, not written: see `lib/writingFor.ts`. This is the one
    // thing that crosses the navigation, and it crosses it the way a launched
    // file does.
    holdWritingFor({
      programId: program.id,
      program: block.program,
      summary: block.summary,
      better: block.better,
      worse: block.worse,
      flat: block.flat,
      untested: block.untested,
    });
    navigate(`/build/${program.id}`);
  }

  return (
    <Card title="Write them one back">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        {ran
          ? `They ran ${ran.name}. Start from a copy and change what their numbers say to change — then Save as a file and send it back.`
          : `${block.program} is not a program this app ships, so there is nothing to copy — but you can still write them one from scratch.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {ran && (
          <Button onClick={() => void start(forkProgram(ran, `${ran.name} (revised)`))}>
            <PencilLine size={15} /> Start from {ran.name}
          </Button>
        )}
        <Button variant="outline" onClick={() => void start(blankProgram())}>
          <PencilLine size={15} /> Write a blank one
        </Button>
      </div>
      <p className="text-2xs text-ink-soft mt-3 leading-relaxed">
        The program is yours and is saved with your own. Their block is not: it goes when this tab
        does, exactly as it says above.
      </p>
    </Card>
  );
}

function BlockView({ block }: { block: SharedBlock }) {
  const window =
    block.from && block.through ? `${shortLabel(block.from)} – ${shortLabel(block.through)}` : '';
  const weeks = `${block.weeksRun} ${block.weeksRun === 1 ? 'week' : 'weeks'}`;
  return (
    <Card title={block.program}>
      <p className="text-sm text-ink-soft">
        {[weeks, outcomeWord(block.outcome), window].filter(Boolean).join(' · ')}
      </p>

      {block.sessions !== null && (
        <p className="text-sm text-ink-soft mt-1">
          {block.planned !== null && block.planned > 0
            ? `${block.sessions} of ${block.planned} sessions the plan placed`
            : `${block.sessions} ${block.sessions === 1 ? 'session' : 'sessions'}`}
        </p>
      )}

      {/* The four counts together, which is `describeBlock`'s own rule
          (PLAN.md M284): "a report that names three improvements and stays
          quiet about four untested metrics is a highlight reel". */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
        <span>{block.better} improved</span>
        <span>{block.flat} held</span>
        <span>{block.worse} down</span>
        <span>{block.untested} untested</span>
      </div>

      {block.results.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 mt-3">
          {block.results.map((result, i) => (
            <li key={`${result.metricId}-${i}`} className="text-sm flex flex-wrap gap-x-2">
              <span className="font-bold">{labelFor(result)}</span>
              <span className="text-ink-soft">{readingOf(result)}</span>
            </li>
          ))}
        </ul>
      )}

      {block.summary && (
        <p className="text-sm text-ink-soft mt-3 leading-relaxed">
          {block.summary}{' '}
          <span className="text-2xs uppercase tracking-widest">— their app’s words</span>
        </p>
      )}
    </Card>
  );
}

/**
 * One row's numbers, in the unit the metric is actually on.
 *
 * `blockReport.ts` sets the rule this follows and gives four reasons for it:
 * grades are ordinal so they move in steps, pass/fail is not a quantity, one
 * metric is text, and a baseline of zero has no percent. A row that printed
 * a percentage for all of them would be the chart that file refuses to draw.
 */
function readingOf(result: SharedResult): string {
  if (result.gap === 'never-tested') return 'not tested';
  if (result.gap === 'once-only') return 'baseline only';
  if (result.gap === 'not-a-number') return 'listed, not measured';

  const from = result.baselineDisplay ?? (result.baseline === null ? '' : String(result.baseline));
  const to = result.latestDisplay ?? (result.latest === null ? '' : String(result.latest));
  const move =
    result.steps !== null
      ? `${signed(result.steps)} ${Math.abs(result.steps) === 1 ? 'step' : 'steps'}`
      : result.percent !== null
        ? `${signed(Math.round(result.percent))}%`
        : result.moved === null
          ? ''
          : result.moved;
  return [from && to ? `${from} → ${to}` : from || to, move].filter(Boolean).join(' · ');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
