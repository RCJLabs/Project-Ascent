import { beforeAll, describe, expect, it } from 'vitest';
import { loadDrills } from '@/content/drills';
import { PROGRAMS, getProgram, loadPrograms } from '@/content/programs';
import type { Program, SessionType } from '@/content/types';
import { blankProgram } from './customProgram';
import { handoutName, programHandout } from './programHandout';

/**
 * A program an athlete can read (PLAN.md M288).
 *
 * `programFile.ts` exists so a coach can hand somebody a block, and the card
 * offering it says who for: *"Anyone with the app can import it."* The athlete
 * who has not got it is the common case.
 */

beforeAll(async () => {
  await loadPrograms();
  await loadDrills();
});

const DAY = '2026-09-19';
const iron = () => programHandout(getProgram('iron_grip')!, DAY);

describe('a shipped program, written out', () => {
  it('opens with what it is and who it is for', () => {
    const out = iron();
    expect(out.startsWith('# Iron Grip')).toBe(true);
    // Length, grades and kit on one line, the three a coach is asked first.
    // Iron Grip carries its range with no label of its own, and its pitch
    // says "V5-V8" too — so read the fact line, not the whole document.
    const facts = out.split('\n').find((l) => l.startsWith('12 weeks'));
    expect(facts).toBe('12 weeks · V5-V8 · Needs: Climbing wall, Hangboard');
  });

  it('lays out the week by name, not by number', () => {
    const out = iron();
    expect(out).toContain('- **Monday** — Finger Protocol + Engine');
    expect(out).toContain('- **Saturday** — Climbing Session');
  });

  it('names the blocks and the weeks they run', () => {
    expect(iron()).toContain('(weeks 1–4)');
    expect(iron()).toContain('(weeks 9–12)');
  });

  it('writes the doses the way the app writes them', () => {
    // `dosageLine`, shared with `ProgramDetailPage` since this milestone.
    expect(iron()).toContain('5 sets × 10s · 85-90% max added weight · 3-5 min rest');
  });

  /**
   * The one the first draft got wrong, found by reading its output rather
   * than by testing it: the Spark phase listed six campus exercises with
   * nothing to say they are alternatives, so the handout told an athlete to
   * do all six.
   */
  it('says which track a line belongs to, and what a track is', () => {
    const out = iron();
    expect(out).toContain('## Pick a track');
    expect(out).toContain('Pick one and stay on it');
    expect(out).toContain('*(Campus board)*');
    expect(out).toContain('*(No campus board)*');
  });

  /**
   * "Pick five of these" is part of the prescription, not a detail. A menu
   * block written out as a list reads as a list of things to do — which is
   * the same mistake the track tag fixed, one field over.
   */
  it('says how many of a menu block to pick', () => {
    const out = programHandout(getProgram('base_camp')!, DAY);
    expect(out).toMatch(/— pick \d/);
  });

  it('names the benchmarks rather than their ids', () => {
    const out = iron();
    expect(out).toContain('- Max Hang 20mm 7s');
    expect(out).not.toContain('max_hang_20mm_7s');
  });

  it('says where it came from, and when', () => {
    expect(iron()).toContain(`Iron Grip · written in Project Ascent · ${DAY}`);
  });
});

describe('what it refuses to invent', () => {
  const bare = (over: Partial<Program> = {}): Program => ({ ...blankProgram('Mine'), ...over });

  it('writes no week for a program that recommends none', () => {
    expect(programHandout(bare(), DAY)).not.toContain('## The week');
  });

  it('writes no track section for a program with none', () => {
    const out = programHandout(bare(), DAY);
    expect(out).not.toContain('## Pick a track');
    expect(out).not.toContain('stay on it');
  });

  it('writes no test section for a program that asks for nothing', () => {
    expect(programHandout(bare({ assessments: [] }), DAY)).not.toContain('## What gets tested');
  });

  /**
   * Found in the browser, on the sample climber's own program: two named
   * session types, no blocks, and a handout that gave the athlete a heading
   * and a void. A program written in the builder looks like that until
   * somebody fills it in.
   */
  it('says so when a session has nothing written under it', () => {
    const out = programHandout(
      bare({
        sessionTypes: [
          {
            id: 'board' as SessionType['id'],
            name: 'Board night',
            icon: 'grid',
            description: 'Hard moves on the board.',
            duration: '60 min',
          },
        ],
      }),
      DAY,
    );
    expect(out).toContain('### Board night — 60 min');
    expect(out).toContain('*Nothing written down for this one yet.*');
  });

  /**
   * And keeps quiet where the absence is the design (PLAN.md M317).
   *
   * The line above was written for the builder and is right there. Offered
   * for the catalogue it became a lie eleven times over: every shipped
   * program has a rest day, a rest day prescribes nothing because it is a
   * rest day, and the athlete read that their coach had not finished
   * writing it.
   */
  it('says nothing of the sort about a rest day', () => {
    const out = programHandout(
      bare({
        sessionTypes: [
          {
            id: 'rest' as SessionType['id'],
            name: 'Rest / Recovery',
            icon: 'moon',
            description: 'Full rest or light activity.',
            isRest: true,
          },
        ],
      }),
      DAY,
    );
    expect(out).toContain('### Rest / Recovery');
    expect(out).toContain('Full rest or light activity.');
    expect(out).not.toContain('Nothing written down');
  });

  it('nor about a mode, which prescribes nothing by definition', () => {
    const out = programHandout(
      bare({
        kind: 'mode',
        sessionTypes: [
          {
            id: 'crag' as SessionType['id'],
            name: 'Outdoor Bouldering',
            icon: 'rock',
            description: 'Bouldering on real rock.',
          },
        ],
      }),
      DAY,
    );
    expect(out).toContain('### Outdoor Bouldering');
    expect(out).toContain('Bouldering on real rock.');
    expect(out).not.toContain('Nothing written down');
  });

  it('and the whole catalogue is clear of it, which it was not', () => {
    // The measurement that opened M317: eleven of eleven programs said it
    // under their rest day, Outdoor Climbing said it six times, and General
    // Training twice.
    for (const program of PROGRAMS) {
      expect(programHandout(program, DAY), program.id).not.toContain('Nothing written down');
    }
    // A working session with nothing under it is still a gap, and the
    // catalogue having none of those is what makes the sweep above mean
    // something rather than passing on an empty rule.
    expect(PROGRAMS.length).toBeGreaterThan(10);
  });

  it('still says what it is, with nothing else filled in', () => {
    const out = programHandout(bare(), DAY);
    expect(out).toContain('# Mine');
    expect(out).toContain('8 weeks');
  });
});

describe('the file it saves as', () => {
  it('is named after the program, in markdown', () => {
    expect(handoutName(getProgram('iron_grip')!)).toBe('iron-grip.md');
  });

  it('survives a name that is all punctuation', () => {
    expect(handoutName({ name: '!!!' } as Program)).toBe('program.md');
  });

  it('does not leave a trailing dash on a name that ends in one', () => {
    expect(handoutName({ name: 'Peak — ' } as Program)).toBe('peak.md');
  });
});
