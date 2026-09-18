// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PROTOCOLS, getProtocol } from '@/content/protocols';
import { DRILLS } from '@/content/drills';
import type { BodyPart } from '@/content/bodyParts';
import { exerciseLoads, partsNamedIn, unspokenFor } from '@/engine/bodyLoad';
import { PROGRAMS, loadPrograms } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';
import { SafetyNote, protocolsIn } from './SafetyNote';

/**
 * What the program's author wrote about not getting hurt, driven
 * (PLAN.md M153, M267).
 *
 * `protocolSafety` is well covered in `bodyLoad.test.ts`; the card that
 * renders it, and the rule deciding when the app's own keyword scan steps
 * aside for it, had no test at all. Those two are where the three rules in
 * `SafetyNote`'s header live — every rule rather than the worst one, once
 * per method rather than once per line, and the urgent ones first.
 */

const campus = PROTOCOLS['campus_ladder']!;

afterEach(cleanup);

const note = (protocol: Parameters<typeof SafetyNote>[0]['protocol'], injured: string[] = []) =>
  render(<SafetyNote protocol={protocol} injured={injured as never} />).container;

describe('the safety note', () => {
  it('says nothing when there is nothing authored to say', () => {
    expect(note(undefined, ['elbow']).textContent).toBe('');
    expect(note(PROTOCOLS['front_lever'], ['elbow']).textContent).toBe('');
    expect(note({ safety: [] }, ['elbow']).textContent).toBe('');
  });

  it('shows every rule, not the worst one', () => {
    // Three of the seven rules in the catalogue name no body part, so no
    // ranking by injury could ever raise them. Ranking is the house pattern
    // on an exercise row and the wrong pattern here.
    const items = [...note(campus, ['elbow']).querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toHaveLength(campus.safety!.length);
    expect(new Set(items)).toEqual(new Set(campus.safety));
  });

  it('shows them all when nothing is hurt, rather than waiting to be asked', () => {
    const items = [...note(campus).querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(campus.safety);
  });

  it('leads with the rule that is about this climber, and weights it', () => {
    const lis = [...note(campus, ['elbow']).querySelectorAll('li')];
    expect(lis[0]!.textContent).toBe('Never campus with any existing finger or elbow symptom.');
    expect(lis[0]!.querySelector('span')!.className).toContain('font-semibold');
    expect(lis[1]!.querySelector('span')!.className).not.toContain('font-semibold');
  });

  it('names the method it belongs to, so two notes are told apart', () => {
    expect(note({ ...campus, name: 'Campus Laddering' }, []).textContent).toContain(
      'Campus Laddering — safety',
    );
    expect(note({ safety: ['Be careful.'] }, []).textContent).toContain('Safety');
  });
});

describe('the protocols named inside a block', () => {
  const ex = (name: string, protocolId?: string) => ({ name, protocolId });
  const lookup = (id: string) => PROTOCOLS[id as keyof typeof PROTOCOLS];

  it('lists each one once, however many lines use it', () => {
    // Iron Grip's Spark phase is three campus exercises in a row; saying the
    // same three rules nine times is how a warning stops being read.
    const found = protocolsIn(
      [ex('Campus Laddering', 'campus_ladder'), ex('Campus Skips', 'campus_ladder'), ex('Campus Double Dynos', 'campus_ladder')],
      lookup,
    );
    expect(found.map((p) => p.id)).toEqual(['campus_ladder']);
  });

  it('keeps the order the block reads in', () => {
    const found = protocolsIn(
      [ex('Max Hangs', 'max_hangs_10s'), ex('Pull-ups'), ex('Campus Skips', 'campus_ladder'), ex('Max Hangs again', 'max_hangs_10s')],
      lookup,
    );
    expect(found.map((p) => p.id)).toEqual(['max_hangs_10s', 'campus_ladder']);
  });

  it('skips a line with no method and an id the registry does not know', () => {
    expect(protocolsIn([ex('Pull-ups'), ex('Mystery', 'not_a_protocol')], lookup)).toEqual([]);
  });
});

/**
 * The drill card runs the same rule and has never once used it.
 *
 * Eleven of the 156 drills name a protocol and all eleven name `arcing`,
 * whose single rule — *"If you pump out, you went too hard"* — names no body
 * part. So no drill's authored rules can ever be urgent, the suppression on
 * that card has been inert since M153, and the mutation battery cannot tell
 * the fixed expression from the broken one there.
 *
 * Pinned rather than left as an accident: when a drill points at a protocol
 * whose rules name a part, this fails and says the branch is live now.
 */
describe('the drill half of the same rule', () => {
  it('is not reachable from any drill the catalogue ships', () => {
    const named = (Object.values(DRILLS) as { id: string; protocolId?: string }[])
      .filter((drill) => drill.protocolId !== undefined)
      .filter((drill) => {
        const protocol = getProtocol(drill.protocolId as never);
        return (protocol?.safety ?? []).some((rule) => partsNamedIn(rule).length > 0);
      })
      .map((drill) => drill.id);
    expect(named, 'a drill now names a protocol with a rule about a body part').toEqual([]);
  });

  it('is a rule about drills that do name a protocol, all the same', () => {
    // A probe that cannot find a known-present instance is not a probe: the
    // check above is only meaningful because drills do name protocols.
    const withProtocol = (Object.values(DRILLS) as { protocolId?: string }[]).filter(
      (drill) => drill.protocolId !== undefined,
    );
    expect(withProtocol.length).toBeGreaterThan(0);
  });
});

/**
 * The logger, with two injuries and one authored rule between them.
 *
 * The scan is advisory and over-flags, so where the author has written a
 * rule about the same injury the guess under it is noise. It was silencing
 * the whole line, including the parts the rule never mentioned.
 */
describe('a rule about one injury, and a second injury it never mentions', () => {
  const DATE = today();

  /**
   * A real line whose authored rule covers some of what it loads and not
   * the rest, read out of the catalogue rather than named here.
   *
   * On no track, because a tracked line is hidden until the climber picks
   * that track and this fixture has no business making that choice. Iron
   * Grip's three campus lines are the ones this milestone's comment quotes
   * and all three are `track: 'board'`, so the case driven here is one of
   * the others.
   */
  function gap() {
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const block of type.blocks ?? []) {
          for (const [phaseId, phase] of Object.entries(block.perPhase ?? {})) {
            for (const ex of phase.exercises ?? []) {
              if (!ex.protocolId || ex.track) continue;
              const protocol = getProtocol(ex.protocolId);
              if (!protocol?.safety?.length) continue;
              const loads = exerciseLoads(ex);
              const left = unspokenFor(protocol, loads);
              const covered = loads.filter((part) => !left.includes(part));
              if (left.length > 0 && covered.length > 0) {
                return { program, typeId: type.id, phaseId, ex, protocol, covered, left };
              }
            }
          }
        }
      }
    }
    return null;
  }

  async function logger(parts: BodyPart[], found: NonNullable<ReturnType<typeof gap>>): Promise<void> {
    await reset();
    // A block's exercises hang off its **phase**, not the block, so the
    // program has to start far enough back that today lands inside it.
    const phase = found.program.phases.find((ph) => ph.id === found.phaseId)!;
    const start = addDays(startOfWeek(DATE), -(phase.weekStart - 1) * 7);
    await putSession({
      ...newSession(DATE, 0, { completed: false }),
      programId: found.program.id,
      sessionTypeId: found.typeId,
    } as never);
    await hydrate();
    useProfile.setState({
      activeProgramId: found.program.id,
      startDates: { [found.program.id]: start },
      plans: { [found.program.id]: { [dayOfWeek(DATE)]: found.typeId } },
      weekOverrides: {},
      adaptations: {},
      injuries: parts.map((part, i) => ({
        id: `i${i}`,
        part,
        since: DATE,
        severity: 'managing' as const,
        status: 'active' as const,
      })) as never,
    });
    useSettings.setState({ logView: 'full' });
    renderAt('/', <DayBody date={DATE} />);
    await screen.findAllByText(new RegExp(found.ex.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  /** That one line alone: other lines in the same day carry no protocol and
   *  warn perfectly correctly, so a page-wide assertion passes for the
   *  wrong reason. */
  const row = (name: string) =>
    screen.getByLabelText(`Mark ${name} done`).closest('li')?.textContent ?? '';

  it('is a case the shipped catalogue actually contains', async () => {
    await loadPrograms();
    // A probe that cannot find a known-present instance is not a probe.
    expect(gap(), 'some line loads more than its safety rule names').toBeTruthy();
  });

  it('says the authored rule and still warns about the other injury', async () => {
    await loadPrograms();
    const found = gap()!;
    await logger([found.covered[0]!, found.left[0]!], found);
    // The rule is about one part; it was silencing the line about the other.
    expect(document.body.textContent).toContain(found.protocol.safety![0]);
    expect(row(found.ex.name)).toMatch(new RegExp(`Loads your ${found.left[0]}`));
  });

  it('still says nothing twice when the rule covers the only injury', async () => {
    await loadPrograms();
    const found = gap()!;
    await logger([found.covered[0]!], found);
    expect(document.body.textContent).toContain(found.protocol.safety![0]);
    expect(row(found.ex.name)).not.toMatch(/Loads your/);
  });

  it('warns normally when no rule speaks to the injury at all', async () => {
    await loadPrograms();
    const found = gap()!;
    await logger([found.left[0]!], found);
    expect(row(found.ex.name)).toMatch(new RegExp(`Loads your ${found.left[0]}`));
  });
});
