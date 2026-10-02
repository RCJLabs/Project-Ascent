import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { PencilLine, Upload, X } from 'lucide-react';
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
import { MAX_OPEN_BLOCKS, blockSeries, sameBlock, type BlockSeries } from '@/engine/blockSeries';
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
 *
 * **Several at once since M362**, so a coach can see an athlete across
 * blocks. They are held exactly as one was, which is what was decided:
 * the comparison is of open files, and nothing about it is kept.
 */
export function SharedBlockPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<SharedBlock[]>([]);
  // Mirrored, so a read that finishes after another can add to what that one
  // opened rather than to what was open when it started.
  const open = useRef<SharedBlock[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  // Whether the page is still here when a file read finishes (PLAN.md M332).
  // Set in the setup as well as cleared: `StrictMode` runs the cleanup on mount.
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => void (onScreen.current = false);
  }, []);

  /** A block file the app was opened with, the same path as the picker. */
  useEffect(() => {
    const opened = takeLaunchFile();
    if (opened) void read([opened]);
    // Once, on mount: `takeLaunchFile` clears as it returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Every file picked, added to what is open (PLAN.md M362).
   *
   * A file that cannot be read is named and the rest still open; one that
   * is already open, or one past the limit, is said rather than dropped in
   * silence. With a single file the sentence is the parser's own, as it was.
   */
  async function read(files: readonly File[]): Promise<void> {
    const said: string[] = [];
    const parsed: SharedBlock[] = [];
    for (const file of files) {
      try {
        parsed.push(parseBlockFile(await file.text()));
      } catch (e) {
        const why = e instanceof BlockFileError ? e.message : 'That file could not be read.';
        said.push(files.length > 1 ? `${file.name}: ${why}` : why);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    // A launched file is read on mount, after which the page may be gone
    // (PLAN.md M332).
    if (!onScreen.current) return;
    const next = [...open.current];
    for (const block of parsed) {
      if (next.some((b) => sameBlock(b, block))) {
        said.push(`${block.program} to ${shortLabel(block.through)} is already open.`);
      } else if (next.length >= MAX_OPEN_BLOCKS) {
        said.push(`${block.program} to ${shortLabel(block.through)} was not opened: ${MAX_OPEN_BLOCKS} blocks at once is the most this shows.`);
      } else {
        next.push(block);
      }
    }
    open.current = next;
    setBlocks(next);
    setProblems(said);
  }

  function startAgain(): void {
    open.current = [];
    setBlocks([]);
    setProblems([]);
  }

  const series = blockSeries(blocks);
  const newest = series.blocks.at(-1);

  return (
    <>
      <BackLink />
      <PageHeader
        title="A block somebody sent you"
        subtitle="Open the files an athlete saved from their own Block review."
      />

      <PageGrid>
        <Card>
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            It carries what their block moved and nothing else — no sessions, no places, no
            partners, no notes, no photos. Nothing on this screen is saved: it is here while the
            tab is, and none of it touches your own grades, your log or your numbers.
          </p>
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Open several from one athlete to see their blocks side by side. The files do not say
            whose they are, so keep each athlete's together.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> {blocks.length === 0 ? 'Open block files' : 'Add another block'}
            </Button>
            {blocks.length > 0 && (
              <Button variant="ghost" onClick={startAgain}>
                <X size={15} /> Start again
              </Button>
            )}
          </div>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              if (picked.length > 0) void read(picked);
            }}
          />
          {problems.map((problem) => (
            <p key={problem} className="text-sm text-danger mt-3">
              {problem}
            </p>
          ))}
        </Card>

        {series.blocks.length > 1 && <SeriesCard series={series} />}
        {/* Newest first: the block a coach is answering is the last one. */}
        {[...series.blocks].reverse().map((block) => (
          <BlockView key={`${block.program}|${block.from}|${block.through}`} block={block} />
        ))}
        {newest && <WriteBack block={newest} />}
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

/**
 * The blocks against each other (PLAN.md M362).
 *
 * What each ended on, oldest first, and nothing worked out between them —
 * `engine/blockSeries.ts` says why. A table, because the question is read
 * down a column and along a row at once, and a reader is told what each
 * column is rather than left with a date.
 *
 * **A test's name is a row of its own, above its readings.** Beside them,
 * at the largest text on a 360px phone, the names wrapped to four lines and
 * pushed the third block's column off the card — the newest block, which is
 * the one being answered. Each test is its own row group, so a screen reader
 * still says which test a number belongs to.
 */
function SeriesCard({ series }: { series: BlockSeries }) {
  return (
    <Card title={`Across ${series.blocks.length} blocks`}>
      <ol className="grid grid-cols-1 gap-1 text-sm text-ink-soft">
        {series.blocks.map((block) => (
          <li key={`${block.program}|${block.from}|${block.through}`}>
            <span className="font-bold text-ink">{shortLabel(block.through)}</span>{' '}
            {[block.program, `${block.weeksRun} ${block.weeksRun === 1 ? 'week' : 'weeks'}`, outcomeWord(block.outcome)].join(' · ')}
          </li>
        ))}
      </ol>
      {series.rows.length === 0 ? (
        <p className="text-sm text-ink-soft mt-3">
          No test was measured in two of these blocks, so there is nothing to put side by side.
        </p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <caption className="sr-only">What each block ended on, oldest first</caption>
            <thead>
              <tr className="text-2xs uppercase tracking-widest text-ink-soft">
                {series.blocks.map((block) => (
                  <th
                    key={`${block.program}|${block.from}|${block.through}`}
                    scope="col"
                    className="text-right font-bold pb-1 pl-3 first:pl-0 whitespace-nowrap"
                  >
                    {shortLabel(block.through)}
                    <span className="sr-only">, {block.program}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {series.rows.map((row) => (
              <tbody key={row.metricId} className="border-t border-line">
                <tr>
                  <th scope="rowgroup" colSpan={series.blocks.length} className="text-left font-bold pt-1.5">
                    {row.label}
                  </th>
                </tr>
                <tr>
                  {row.readings.map((reading, i) => (
                    <td key={i} className="text-right tabular-nums pb-1.5 pl-3 first:pl-0 whitespace-nowrap">
                      {reading ?? (
                        <span className="text-ink-soft">
                          <span aria-hidden>—</span>
                          <span className="sr-only">not measured</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="text-2xs text-ink-soft mt-3 leading-relaxed">
        What each block ended on. Nothing is worked out between them: two programs test in their own
        conditions, and a grade moves in steps, not percent.
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
