// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { DRILLS, getDrill, offWallDrills } from '@/content/drills';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { loadPrograms } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { buildTips } from '@/engine/coach';
import { deriveClimberState } from '@/engine/derive';
import { dayOfWeek, today } from '@/engine/dates';
import { useSessions } from '@/store/sessions';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { CoachPage } from '@/features/coach/CoachPage';
import { DayBody } from '@/features/log/LogPage';
import { DrillPage } from '@/features/drills/DrillPage';

/**
 * A day you cannot climb, and a coach that stops promising a drill
 * (PLAN.md M132).
 *
 * Every one of the 144 drills the library shipped with declared a wall, so
 * `filterDrills` handed a climber with nothing an empty library and
 * `novelStimulus` fell out of the bottom of its preference order into a
 * generic sentence. And `session.drillId` was written in exactly one place —
 * the plan's drill for the week — so a drill nothing prescribes could never
 * be done at all.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

describe('the library has something for a climber with nothing', () => {
  it('offers more than a token handful', () => {
    expect(offWallDrills().length).toBeGreaterThan(8);
  });

  it('offers more than one kind of day', () => {
    // Twelve mobility drills would satisfy a count and leave nothing to
    // think with, and nothing to do when the reason you are off the wall is
    // that you are frightened rather than injured.
    const categories = new Set(offWallDrills().map((d) => d.category));
    expect(categories.has('recovery')).toBe(true);
    expect(categories.has('mental')).toBe(true);
    expect(categories.size).toBeGreaterThan(2);
  });

  it('does not tell a climber in a chair they need somewhere to climb', async () => {
    // The page's one line about kit read "needs nothing but somewhere to
    // climb" and had never been rendered in its life: it only shows for a
    // drill declaring no kit, and every drill declared a wall. These are
    // the first to reach it.
    await hydrate();
    renderAt('/drills/off_box_breathing', <DrillPage params={{ id: 'off_box_breathing' }} />);
    await screen.findByText('How to run it');
    expect(screen.getByText(/no wall, no board, no weights/)).toBeTruthy();
  });

  it('says nothing about kit for a drill that names some', async () => {
    await hydrate();
    renderAt('/drills/sticky_feet', <DrillPage params={{ id: 'sticky_feet' }} />);
    await screen.findByText('How to run it');
    expect(screen.queryByText(/Needs nothing/)).toBeNull();
  });

  it('does not quietly need a wall after all', () => {
    for (const drill of offWallDrills()) {
      expect(drill.equipment, drill.id).toEqual(['none']);
    }
  });

  it('leaves the rest of the library alone', () => {
    // The off-wall set is an addition, not a retagging: the drills that are
    // climbing still say so.
    expect(DRILLS.filter((d) => d.equipment.includes('wall')).length).toBeGreaterThan(140);
  });
});

describe('a drill can be put on today', () => {
  async function drillPage(id: string) {
    await hydrate();
    renderAt(`/drills/${id}`, <DrillPage params={{ id }} />);
    await screen.findByText('How to run it');
  }

  it('starts a session when there is not one', async () => {
    await drillPage('off_box_breathing');
    expect(screen.getByText(/Nothing logged today yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Put this on today/ }));
    await waitFor(() => {
      const sessions = useSessions.getState().byDate[TODAY] ?? [];
      expect(sessions[0]?.drillId).toBe('off_box_breathing');
    });
  });

  it('opens the log on the view the drill is actually in', async () => {
    // The quick view is climbs and effort; the drill card is in the full
    // one. Without this the button wrote the drill and handed the climber
    // a screen with no sign of it — which is what a browser showed.
    useSettings.setState({ logView: 'quick' });
    await drillPage('off_box_breathing');
    fireEvent.click(screen.getByRole('button', { name: /Put this on today/ }));
    await waitFor(() => expect(useSettings.getState().logView).toBe('full'));
  });

  it('puts it on the session that is already there', async () => {
    await putSession(newSession(TODAY, 0, { completed: false }) as never);
    await drillPage('off_box_breathing');
    expect(screen.getByText(/Today already has a session/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Put this on today/ }));
    await waitFor(() => {
      const sessions = useSessions.getState().byDate[TODAY] ?? [];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.drillId).toBe('off_box_breathing');
    });
  });

  it('replaces the drill the plan placed, because that is the point', async () => {
    await putSession(
      newSession(TODAY, 0, { completed: false, drillId: 'sticky_feet' }) as never,
    );
    await drillPage('off_extensor_work');
    fireEvent.click(screen.getByRole('button', { name: /Put this on today/ }));
    await waitFor(() => {
      expect(useSessions.getState().byDate[TODAY]?.[0]?.drillId).toBe('off_extensor_work');
    });
  });

  it('does not tick it done — that is the climber’s to do', async () => {
    await drillPage('off_skin_repair');
    fireEvent.click(screen.getByRole('button', { name: /Put this on today/ }));
    await waitFor(() => {
      expect(useSessions.getState().byDate[TODAY]?.[0]?.drillId).toBe('off_skin_repair');
    });
    expect(useSessions.getState().byDate[TODAY]?.[0]?.drillDone).toBeUndefined();
  });

  /**
   * The other half, and the one jsdom let through.
   *
   * The button wrote `drillId` and the logger rendered the *plan's* drill
   * for the week — so a chosen drill was recorded, invisible, impossible to
   * tick done, and therefore never counted. Found in a browser, where the
   * logger opened on a session with a drill on it and showed nothing.
   */
  it('shows up in the logger, where it can be ticked off', async () => {
    await putSession(
      newSession(TODAY, 0, { completed: false, drillId: 'off_box_breathing' }) as never,
    );
    await hydrate();
    // The drill card is part of the full log, not the quick one, and quick
    // is the default view.
    useSettings.setState({ logView: 'full' });
    renderAt('/', <DayBody date={TODAY} />);
    expect(await screen.findByText('Box Breathing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mark done/ })).toBeTruthy();
  });

  it('wins over the drill the plan put there', async () => {
    // The precedence, which only shows itself when there is a plan to
    // disagree with: the session carries what the climber chose and the
    // week carries what the program asked for, and the card is about this
    // session.
    const planned = getDrill(
      IRON_GRIP.sessionTypes.find((t) => t.id === 'perf')!.drillsByWeek![1]!,
    )!;
    await putSession(
      newSession(TODAY, 0, {
        completed: false,
        programId: 'iron_grip',
        sessionTypeId: 'perf',
        drillId: 'off_box_breathing',
      }) as never,
    );
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: TODAY },
      plans: { iron_grip: { [dayOfWeek(TODAY)]: 'perf' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    useSettings.setState({ logView: 'full' });
    renderAt('/', <DayBody date={TODAY} />);
    expect(await screen.findByText('Box Breathing')).toBeTruthy();
    expect(screen.queryByText(planned.name)).toBeNull();
  });

  it('says so when it is already on today', async () => {
    await putSession(
      newSession(TODAY, 0, { completed: false, drillId: 'off_skin_repair' }) as never,
    );
    await drillPage('off_skin_repair');
    expect(screen.getByText(/on today already/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open today/ })).toBeTruthy();
  });
});

describe('the coach stops promising a drill nobody prescribes', () => {
  /** Eight sessions, none of them with a drill: the gap the tip is for. */
  const eight = () =>
    Array.from({ length: 8 }, (_, i) =>
      newSession(`2026-0${(i % 8) + 1}-0${(i % 8) + 1}`, 0, { completed: true }),
    );

  const drillTip = (prescribesDrills: boolean | undefined) => {
    const sessions = eight();
    const state = deriveClimberState(sessions);
    const tips = buildTips({ state, sessions, ...(prescribesDrills === undefined ? {} : { prescribesDrills }) });
    return tips.find((t) => t.id === 'domain:drills') ?? null;
  };

  it('still says what a program with drills prescribes', () => {
    const tip = drillTip(true);
    expect(tip?.body).toMatch(/prescribes a drill each week/);
    expect(tip?.action?.href).toBe('/train');
  });

  it('says the true thing to the six programs that prescribe none', () => {
    // Ground Zero, The Cruiser, Two Days a Week, Trip Prep, General
    // Training and Outdoor Climbing ship no drills at all, and every one of
    // their climbers was being told they skip one every week.
    const tip = drillTip(false);
    expect(tip?.body).not.toMatch(/prescribes a drill each week/);
    expect(tip?.body).toMatch(/does not prescribe drills/);
  });

  it('points them somewhere a drill can actually be chosen', () => {
    expect(drillTip(false)?.action?.href).toBe('/drills');
  });

  /**
   * And the third state, which M132 folded into the second (PLAN.md M249).
   *
   * No program at all is not a program that prescribes nothing. This tip
   * opens at eight sessions with no drill logged, which is exactly where a
   * climber who has not started a program tends to be — so the branch
   * naming one was reaching the climbers least able to make sense of it.
   */
  it('names no program to a climber who is not running one', () => {
    const tip = drillTip(undefined);
    expect(tip?.body).toMatch(/not running a program/);
    expect(tip?.body, 'nothing about what "your program" does').not.toMatch(/[Yy]our program/);
    expect(tip?.action?.href).toBe('/drills');
  });

  it('says a different thing in each of the three states', () => {
    const said = [drillTip(true), drillTip(false), drillTip(undefined)].map((t) => t?.body);
    expect(said.every((b) => typeof b === 'string')).toBe(true);
    expect(new Set(said).size, said.join('\n\n')).toBe(3);
  });

  it('says nothing at all to a climber who has done one', () => {
    const sessions = [
      ...eight(),
      newSession('2026-03-01', 0, { completed: true, drillId: 'sticky_feet', drillDone: true }),
    ];
    const state = deriveClimberState(sessions);
    const tips = buildTips({ state, sessions, prescribesDrills: false });
    expect(tips.find((t) => t.id === 'domain:drills')).toBeUndefined();
  });

  /**
   * The wiring, from the screen rather than from the engine.
   *
   * `prescribesDrills` is computed in `useTips` from the running program,
   * and nothing tested `useTips` at all — so the engine could be perfectly
   * right about both sentences while the screen handed it the wrong fact
   * forever.
   */
  describe('reading the running program', () => {
    async function coach(programId: string | null): Promise<void> {
      for (const [i, session] of eight().entries()) {
        await putSession({ ...session, id: `s${i}`, date: `2026-01-0${i + 1}` } as never);
      }
      await hydrate();
      useProfile.setState({
        activeProgramId: programId,
        startDates: programId === null ? {} : { [programId]: '2026-01-01' },
        plans: {},
        weekOverrides: {},
        adaptations: {},
        injuries: [],
        dismissedTips: {},
      });
      renderAt('/coach', <CoachPage />);
      await screen.findByText('No drills yet');
    }

    it('tells an Iron Grip climber their program prescribes one', async () => {
      await coach('iron_grip');
      expect(screen.getByText(/prescribes a drill each week/)).toBeTruthy();
    });

    it('tells a Cruiser climber the truth instead', async () => {
      // The Cruiser has four session types and not one `drillsByWeek` entry.
      await coach('the_cruiser');
      expect(screen.getByText(/does not prescribe drills/)).toBeTruthy();
    });

    /**
     * And the wiring for the third state. `Boolean(program?.…)` turned "no
     * program" into "a program prescribing nothing" before the hook ever
     * reached the engine, so the engine could be right about all three and
     * the screen still say the wrong one (PLAN.md M249).
     */
    it('tells a climber running nothing that they are running nothing', async () => {
      await coach(null);
      expect(screen.getByText(/not running a program/)).toBeTruthy();
      expect(screen.queryByText(/does not prescribe drills/)).toBeNull();
    });
  });
});
