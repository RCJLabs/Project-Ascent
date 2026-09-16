import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Play, Shield, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { HOOKS, VIEW } from '@/engine/ascent/config';
import {
  createRun,
  metres,
  modifiersFrom,
  step,
  type Input,
  type Mode,
  type RunState,
} from '@/engine/ascent/game';
import {
  Recorder,
  advanceGhost,
  createGhost,
  ghostGap,
  tapeToRace,
  type Ghost,
  type Tape,
} from '@/engine/ascent/replay';
import { payoutFor, wallNumber, type AscentPayout } from '@/engine/ascent/rewards';
import { BOONS, BOON_IDS } from '@/engine/ascent/boons';
import { dailySeed } from '@/engine/ascent/rng';
import { describeEndings, readEndings } from '@/engine/ascent/endingsRead';
import { describeBurns, describeClimb, restingFor } from '@/engine/ascent/resting';
import { describeScale, runHeight } from '@/engine/ascent/scale';
import { MARK_HOLD_MS, type Mark } from '@/engine/ascent/marks';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveAvatar } from '@/engine/avatar';
import { gameAchievements, runEarned, type Achievement } from '@/engine/achievements';
import { pageScroller } from '@/ui/mainScroll';
import { GAME_MARGIN, fitGameWidth, gameHeight } from './fit';
import { addDays, daysBetween, today as todayKey } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats } from '@/engine/stats';
import { deriveVitality } from '@/engine/vitality';
import {
  cueCoin,
  cueGameOver,
  cueHit,
  cueNewBest,
  cuePowerup,
  cueSave,
  unlock,
} from '@/lib/cues';
import { useChosenWall, useCurrency, useGame, useOwnedWalls, useXp } from '@/store/game';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useAllSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import type { UnitSystem } from '@/engine/units';
import { useSkills } from '@/store/skills';
import { unitsToXp } from '@/engine/economy';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { SelectableCard } from '@/ui/Chip';
// Aliased: the engine's `Input` in this file is a lane-change direction.
import { Input as FileInput } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { ShareButton } from '@/features/share/ShareSheet';
import { dailyWallCard } from '@/ui/shareCard';
import { ascentHistory, dayRun, describeAscent, type AscentHistory } from '@/engine/ascent/history';
import { FREE_SOLO_UNLOCK, describeFreeSoloUnlock } from '@/engine/ascent/unlock';
import {
  TAPE_PROBLEMS,
  decodeTape,
  describeTape,
  raceSetup,
  encodeTape,
  tapeFilename,
  type LoadedTape,
} from '@/engine/ascent/tapeFile';
import { downloadFile } from '@/lib/download';
import { buildWall, render } from './render';
import { WALLS, lockNote, unlocked, wallFor, type Palette } from '@/engine/ascent/walls';

/** How many coins in one frame get their own note. */
const COIN_CUES = 5;

type Phase = 'menu' | 'playing' | 'over';

interface Hud {
  metres: number;
  coins: number;
  lives: number;
  saves: number;
  slowmo: boolean;
  pure: boolean;
  /**
   * Metres climbed past the day's best, once that run has ended.
   *
   * Null until then, and null all run when there is no ghost. Height here
   * is time — the ramp is driven by `timeMs` and a lane change costs
   * nothing — so two runs on one wall sit exactly level until one of them
   * stops. A gap shown while both are climbing would read +0 m for the
   * whole race and mean nothing; this appears at the moment it starts to.
   */
  past: number | null;
}

const EMPTY_HUD: Hud = {
  metres: 0, coins: 0, lives: 1, saves: 0, slowmo: false, pure: true, past: null,
};

export function AscentPage() {
  const units = useSettings((s) => s.units);
  const display = useSettings((s) => s.display);
  const metricEntries = useMetrics((s) => s.entries);
  const projects = useProjects((s) => s.projects);
  const injuries = useProfile((s) => s.injuries);
  const palette = useProfile((s) => s.avatarPalette);
  const figure = useProfile((s) => s.avatarFigure);
  const xp = useXp();
  const skills = useSkills();
  const records = useGame((s) => s.ascent);
  /** Today's wall, and only today's: the tape is seeded from the date. */
  // The days behind today (PLAN.md M96).
  const history = useMemo(() => ascentHistory({ days: records.days, to: todayKey() }), [records.days]);
  const today = useMemo(
    () => {
      const day = dayRun(records.days, todayKey());
      return day !== null && day.recovered !== true ? day : null;
    },
    [records.days],
  );
  const recordRun = useGame((s) => s.recordRun);
  const hydrated = useGame((s) => s.hydrated);
  const loadGame = useGame((s) => s.load);

  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<Mode>('ascent');
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [payout, setPayout] = useState<AscentPayout | null>(null);
  /**
   * The one achievement the game can earn, reported where it happens
   * (PLAN.md M212, M229).
   *
   * Captured before the run and compared after, rather than asked as "is it
   * earned now" — which is true of every run after the first that crossed
   * it. The same shape the reward card uses for the other twenty-five, and
   * for the same reason: the question is which *run* earned it.
   */
  const [runAchievement, setRunAchievement] = useState<Achievement | null>(null);
  const hadRef = useRef<boolean>(false);
  /**
   * The named climb the run has just passed (PLAN.md M232).
   *
   * The line is drawn on the wall by the renderer; the name is said here,
   * where it can be read at a glance and by a screen reader rather than
   * being painted at the simulation's resolution over the part of the screen
   * the climber has to watch.
   *
   * The crossing itself is the engine's: `step` raises a `mark` event the
   * way it raises a coin or a hit, because the engine sees every tick where
   * this loop sees one frame of up to thirty. All that is left here is how
   * long the name stays up.
   */
  const [passed, setPassed] = useState<Mark | null>(null);
  const passedAtRef = useRef(0);
  const [newBest, setNewBest] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The record to beat, read before the run so recordRun cannot move it. */
  const beatRef = useRef(0);
  const runRef = useRef<RunState | null>(null);
  const frameRef = useRef<number>(0);
  const inputRef = useRef<Input>(0);
  /** The inputs of the run in progress, kept so the day's best can be raced. */
  const recorderRef = useRef<Recorder | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  /**
   * Someone else's run, loaded from a file and waiting to be raced
   * (PLAN.md M219).
   *
   * A ref as well as state: the frame loop's `finish` needs to know whether
   * the run it is closing was a challenge, and it must read that without
   * being re-created every time the menu's copy of it changes.
   */
  const [challenge, setChallenge] = useState<LoadedTape | null>(null);
  const [tapeProblem, setTapeProblem] = useState<string | null>(null);
  const challengeRef = useRef<LoadedTape | null>(null);
  /** The challenge the *finished* run was against, for the card to read. */
  const [raced, setRaced] = useState<LoadedTape | null>(null);
  const tapeFileRef = useRef<HTMLInputElement>(null);
  /** The run just finished, kept so it can be written to a file. */
  const [finished, setFinished] = useState<{ tape: Tape; date: string; metres: number } | null>(null);

  useEffect(() => {
    if (!hydrated) void loadGame();
  }, [hydrated, loadGame]);

  const sessions = useAllSessions();
  const derived = useMemo(() => {
    const state = deriveClimberState(sessions);
    const stats = deriveStats({ state, metrics: metricEntries, projects });
    const vitality = deriveVitality({
      state,
      endurance: stats.END,
      injuries,
      restBonus: skills.effects.restRecovery,
    });
    return {
      state,
      stats,
      vitality,
      feet: deriveAltimeter(sessions).feet,
      restedToday: state.restedWithin24h,
    };
  }, [sessions, metricEntries, projects, injuries, skills.effects.restRecovery]);

  const avatar = useMemo(
    () =>
      deriveAvatar({
        level: xp.progress.level,
        vitality: derived.vitality.state,
        feet: derived.feet,
        palette,
        figure,
      }),
    [xp.progress.level, derived.vitality.state, derived.feet, palette, figure],
  );

  /**
 * One wall in the picker: a swatch, a name, and why you cannot have it yet.
 *
 * `aria-pressed` rather than a checkmark, because that is the difference
 * between a button that does something and a button that *is* something —
 * and a locked row that can be bought is still a button, so the label has to
 * say which of the two a tap will do.
 */
function WallRow({
  name,
  blurb,
  palette,
  open,
  buyable = false,
  selected,
  onPick,
}: {
  name: string;
  blurb: string;
  palette: Palette;
  open: boolean;
  buyable?: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const shut = !open && !buyable;
  return (
    <SelectableCard
      selected={selected}
      onClick={onPick}
      disabled={shut}
      padded={false}
      label={open ? `Wall: ${name}` : `${name}: ${buyable ? `buy for ${blurb}` : blurb}`}
      className={`flex items-center gap-2.5 bg-sunken px-2.5 py-2 ${shut ? 'opacity-55' : ''}`}
    >
      {/* Two colours, because one is not enough to tell these apart: the
          sky is what most of the screen is and the rock is what you are
          dodging, and a wall that changed only the second would show an
          identical swatch to one that changed only the first. */}
      <span
        aria-hidden
        className="w-5 h-5 shrink-0 rounded border border-line"
        style={{
          background: `linear-gradient(135deg, ${palette.sky} 0 50%, ${palette.rock} 50% 100%)`,
        }}
      />
      <span className="min-w-0">
        <span className={`block text-sm ${selected ? 'font-semibold' : ''}`}>{name}</span>
        <span className="block text-2xs text-ink-soft leading-tight">
          {buyable ? `Buy · ${blurb}` : blurb}
        </span>
      </span>
    </SelectableCard>
  );
}

/** The boons the climber holds, for the list that says so. */
  const held = useMemo(
    () => new Set(skills.effects.ascentBoons.map((b) => b.id)),
    [skills.effects.ascentBoons],
  );

  const modifiers = useMemo(
    () =>
      modifiersFrom({
        end: derived.stats.END.value,
        agi: derived.stats.AGI.value,
        men: derived.stats.MEN.value,
        tec: derived.stats.TEC.value,
        str: derived.stats.STR.value,
        boons: skills.effects.ascentBoons.map((b) => b.id),
      }),
    [derived.stats, skills.effects.ascentBoons],
  );

  // Rest days get their own sky. Otherwise the wall follows the altimeter.
  const currency = useCurrency();
  const chosenWall = useChosenWall();
  const ownedWalls = useOwnedWalls();
  const chooseWall = useGame((s) => s.chooseWall);
  const buyWall = useGame((s) => s.buyWall);
  const access = useMemo(
    () => ({ feet: derived.feet, owned: ownedWalls, rested: derived.restedToday }),
    [derived.feet, ownedWalls, derived.restedToday],
  );
  const theme = wallFor(chosenWall, access).palette;

  // Named on the hooks card next to what each one buys. Two of the five are
  // fed almost entirely by assessment numbers, so a climber who only logs
  // sessions sits at the base of 10 and the hook does nothing — which the
  // card should say out loud rather than leave as a blank row.
  const stat = {
    STR: derived.stats.STR.value,
    END: derived.stats.END.value,
    TEC: derived.stats.TEC.value,
    MEN: derived.stats.MEN.value,
    AGI: derived.stats.AGI.value,
  };

  const seed = useMemo(() => dailySeed(todayKey()), []);
  const wall = useMemo(() => buildWall(seed), [seed]);
  const freeSoloUnlocked = records.best.ascent >= FREE_SOLO_UNLOCK;

  const finish = useCallback(
    (run: RunState) => {
      const climbed = metres(run);
      // One closing sound, not two: a record run rises instead of falling,
      // and the fatal hit is left silent so it does not tread on either.
      const beat = climbed > beatRef.current;
      setNewBest(beat);
      if (beat) cueNewBest();
      else cueGameOver();

      setPhase('over');
      const date = todayKey();
      // A tab left open past midnight finishes a run on yesterday's wall
      // under today's date. The height still counts; the tape does not,
      // because it would replay a pattern nobody can race today.
      const onTodaysWall = seed === dailySeed(date);
      const tape = onTodaysWall ? recorderRef.current?.take(run) : undefined;

      /**
       * A race is a race, and nothing else (PLAN.md M219).
       *
       * A challenge run is played on whatever wall the sender's tape was
       * recorded on. Recording it would set `best`, enter the day's history
       * and re-price the single `ascent:<date>` ledger entry on it — which
       * would make picking an easy wall a way to earn. So the run counts for
       * the race and for nothing else, and the card says so.
       */
      const against = challengeRef.current;
      setRaced(against);
      if (against !== null) {
        // Still writable to a file, so a reply can be sent back on the same
        // wall — that is the whole point of a tape that carries its seed.
        const own = recorderRef.current?.take(run);
        setFinished(own ? { tape: own, date: against.date, metres: climbed } : null);
        setPayout(null);
        return;
      }

      setFinished(tape ? { tape, date, metres: climbed } : null);
      const had = hadRef.current;
      void recordRun({
        mode: run.mode,
        metres: climbed,
        coins: run.coins,
        pure: run.pure,
        date,
        rested: derived.restedToday,
        units,
        endedBy: run.endedBy,
        ...(tape ? { tape } : {}),
      }).then((paid) => {
        setPayout(paid);
        // After the write, because the achievement is a question asked of
        // the day records and this run is not in them until `recordRun`
        // resolves.
        setRunAchievement(runEarned(had, gameAchievements(useGame.getState().ascent.days)));
      });
    },
    [recordRun, derived.restedToday, seed, units],
  );

  /**
   * The day's best in a given mode, if it left a tape on this wall.
   *
   * Takes the mode rather than reading the `mode` state: on the menu that
   * state is whatever was played last, and both buttons are on screen.
   */
  const raceable = useCallback(
    (which: Mode) => tapeToRace(today, { date: todayKey(), mode: which, seed }),
    [today, seed],
  );

  /**
   * Start a run, optionally against a run someone sent (PLAN.md M219).
   *
   * A challenge is played on **their** seed with **your** modifiers: the
   * same wall, each climber as they actually are. Handing the sender's
   * modifiers to the live run would be racing a copy of them rather than
   * racing them, and the difference between the two ghosts is the thing the
   * skill trees are for.
   */
  const start = useCallback(
    (chosen: Mode, against: LoadedTape | null = null) => {
      // Browsers refuse to start audio outside a gesture, and this is one.
      unlock();
      const { seed: wall, mode: played } = raceSetup(against, { seed, mode: chosen });
      setMode(played);
      challengeRef.current = against;
      beatRef.current = against?.metres ?? records.best[played];
      const run = createRun({ mode: played, seed: wall, modifiers });
      runRef.current = run;
      inputRef.current = 0;
      // Read off the run rather than from `modifiers` again: a tape has to
      // record the climber the run was *actually* played by, and two
      // parallel copies of that are two chances to disagree.
      //
      // **Equivalent to passing `modifiers` here**, and M219's battery said
      // so: `createRun` spreads its input over `NO_MODIFIERS`, so the two
      // are deep-equal. It is kept because the copy it removes is the one
      // the *other* mutant exploited — a `createRun` handed the sender's
      // modifiers while the recorder wrote down yours produced a tape that
      // described a run nobody played, and no test could see it.
      recorderRef.current = new Recorder(run.seed, run.mode, run.modifiers);
      const tape = against?.tape ?? raceable(played);
      ghostRef.current = tape ? createGhost(tape) : null;
      setPayout(null);
      setFinished(null);
      setNewBest(false);
      setRunAchievement(null);
      // A climb passed on the last run is not one passed on this one.
      setPassed(null);
      passedAtRef.current = 0;
      hadRef.current = gameAchievements(useGame.getState().ascent.days).some((a) => a.date !== null);
      setHud(EMPTY_HUD);
      setPhase('playing');
    },
    [seed, modifiers, records.best, raceable],
  );

  /** Read a run file the climber picked, and say what is wrong when it is. */
  const pickTape = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setChallenge(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setTapeProblem(TAPE_PROBLEMS.unreadable);
      return;
    }
    const loaded = decodeTape(text);
    if (typeof loaded === 'string') {
      setTapeProblem(TAPE_PROBLEMS[loaded]);
      return;
    }
    setTapeProblem(null);
    setChallenge(loaded);
  }, []);

  const saveRun = useCallback(() => {
    if (finished === null) return;
    downloadFile(
      new Blob([encodeTape(finished.tape, finished.date, finished.metres)], {
        type: 'application/json',
      }),
      tapeFilename(finished.date, finished.metres),
    );
  }, [finished]);

  // The loop. React never re-renders per frame — the HUD is refreshed on a
  // timer instead, so sixty frames a second cost one canvas draw each.
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = 1;

    /**
     * Measure the room and hand it to `fitGameWidth` (PLAN.md M226).
     *
     * Only the reading lives here. What to do with the numbers is in
     * `./fit`, where it can be tested — jsdom has no layout, so everything
     * this function measures comes back zero there.
     */
    const fit = () => {
      // `|| `, not `?? `: jsdom measures every element as zero, and a column
      // of no width would pin the wall to its floor in every page test.
      const column = canvas.parentElement?.clientWidth || canvas.clientWidth || VIEW.width;
      const scroller = pageScroller();
      let room = window.innerHeight;
      if (scroller) {
        // Measured from an unscrolled page, because what is wanted is the
        // canvas's place in the content rather than where it happens to be
        // sitting. Starting a run scrolled halfway down the menu is its own
        // small bug anyway.
        scroller.scrollTop = 0;
        const top = canvas.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        room = scroller.clientHeight - top - GAME_MARGIN;
      }
      const width = fitGameWidth(column, room);
      canvas.style.width = `${width}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(gameHeight(width) * dpr);
      scale = (width * dpr) / VIEW.width;
    };
    fit();
    window.addEventListener('resize', fit);

    let last = performance.now();
    let hudAt = 0;

    const frame = (now: number) => {
      const run = runRef.current;
      if (!run) return;
      const dt = now - last;
      last = now;

      // Recorded before the step, at the tick the run is about to simulate:
      // that is when the engine is handed the input, and a tape keyed on
      // the tick that eventually consumed it would replay the engine's own
      // decision back at itself.
      recorderRef.current?.at(run.ticks, inputRef.current);
      step(run, dt, inputRef.current);
      inputRef.current = 0;

      const ghost = ghostRef.current;
      if (ghost) advanceGhost(ghost, run.ticks);
      render(ctx, run, { palette: theme, wall, avatar, scale, ghost: ghost?.state });

      // Events accumulate across every tick this frame simulated, so a magnet
      // can hand back a dozen coins at once. Only the first few sound, as an
      // arpeggio; past that they would stack into one loud click.
      let coins = 0;
      for (const event of run.events) {
        if (event.kind === 'coin') {
          if (coins < COIN_CUES) cueCoin(coins);
          coins++;
        } else if (event.kind === 'powerup') {
          cuePowerup();
        } else if (event.kind === 'hit') {
          if (event.absorbed === 'save') cueSave();
          else if (!run.over) cueHit();
        } else if (event.kind === 'mark') {
          // Last one wins, on the vanishing chance a resumed frame simulated
          // two: `markCrossed` already reports the higher of any pair inside
          // one tick, and across ticks the later event is the higher climb.
          passedAtRef.current = now;
          setPassed(event.mark);
        }
      }

      // Cleared here rather than by a timer. The loop is already running and
      // already cancelled when the run ends, so a `setTimeout` would be a
      // second lifetime to get wrong — and one left behind by a run that
      // ended mid-announcement would fire into an unmounted page.
      if (passedAtRef.current > 0 && now - passedAtRef.current > MARK_HOLD_MS) {
        passedAtRef.current = 0;
        setPassed(null);
      }

      if (now - hudAt > 100) {
        hudAt = now;
        setHud({
          metres: metres(run),
          coins: Math.round(run.coins),
          lives: run.lives,
          saves: run.saves,
          slowmo: run.slowmoMs > 0,
          pure: run.pure,
          past: ghost?.state.over ? -ghostGap(run, ghost.state) : null,
        });
      }

      if (run.over) {
        setHud({
          metres: metres(run), coins: Math.round(run.coins), lives: 0,
          saves: run.saves, slowmo: false, pure: run.pure,
          past: ghost?.state.over ? -ghostGap(run, ghost.state) : null,
        });
        finish(run);
        return;
      }
      frameRef.current = requestAnimationFrame(frame);
    };

    frameRef.current = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener('resize', fit);
      cancelAnimationFrame(frameRef.current);
    };
  }, [phase, theme, wall, avatar, finish]);

  // Keys, taps and swipes all end up as the same single input.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') inputRef.current = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') inputRef.current = 1;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const pointerStart = useRef(0);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerStart.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dx = e.clientX - pointerStart.current;
    if (Math.abs(dx) > 24) {
      inputRef.current = dx > 0 ? 1 : -1;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    inputRef.current = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  };

  const best = records.best[mode];
  const run = runRef.current;
  // What the run amounted to, in climbs rather than in metres (PLAN.md
  // M210). A comparison and never a credit: the altimeter is the one number
  // no game action moves, and this reads its ladder without writing to it.
  // The climb you are actually working, which the game had never heard of
  // (PLAN.md M217). Read and never written: a sentence and a link.
  const resting = restingFor({ projects, sessions, display });
  // How the runs end, which a run used to forget the moment it did
  // (PLAN.md M214). Null until there are enough of them to mean anything.
  const endings = readEndings(records.endings);
  const runScale = describeScale(hud.metres, units);
  const bestScale = describeScale(records.best.ascent, units);

  return (
    <>
      {/* The wall gets the room a run needs (PLAN.md M226). The `h1` stays —
          a page without a heading is a page you cannot tell you have landed
          on — but the way back and the wall's name are both readable from
          the menu a tap away, and between them they are sixty pixels of a
          game that has to fit. */}
      {phase !== 'playing' && <BackLink />}

      <PageHeader
        title="The Ascent"
        {...(phase === 'playing'
          ? {}
          : {
              subtitle: `Daily Wall #${wallNumber(todayKey())}${
                derived.restedToday ? ' · recovery skies' : ''
              }`,
            })}
      />

      <div className="grid grid-cols-1 gap-3">
        {phase !== 'menu' && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-black text-xl tabular-nums">{runHeight(hud.metres, units).label}</span>
            <span className="text-ink-soft tabular-nums">◎ {hud.coins}</span>
            {hud.past !== null && (
              <span
                className="tabular-nums font-semibold text-positive"
                title="Past your best run today"
              >
                +{runHeight(Math.max(0, hud.past), units).label}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 text-ink-soft">
              {Array.from({ length: hud.lives }, (_, i) => (
                <Heart key={i} size={14} className="text-danger" fill="currentColor" />
              ))}
              {hud.saves > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Shield size={14} /> {hud.saves}
                </span>
              )}
              {hud.slowmo && <span className="text-accent font-semibold">SLOW-MO</span>}
            </span>
          </div>
        )}

        {/* The wall, and the name of the climb just passed over it
            (PLAN.md M232). The wrapper exists only to anchor that banner,
            and is hidden with the canvas so it holds no height in the menu. */}
        <div className="relative" style={{ display: phase === 'playing' ? 'block' : 'none' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            className="w-full mx-auto rounded-2xl border border-line touch-none select-none bg-sunken"
            style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
            aria-label="The Ascent"
          />
          {passed !== null && (
            /**
             * A quarter of the way down, which is above the climber and below
             * the height readout — the two places the eye already is.
             *
             * `pointer-events-none` because the canvas under it is the
             * control: a banner that swallowed a tap would cost a lane change
             * at the exact moment the player was told something, and the
             * crash would be the game's fault.
             *
             * Announced politely rather than assertively: it is worth hearing
             * and never worth cutting off the hit or power-up cues, which are
             * the ones that change what you should do next.
             */
            <div
              className="absolute inset-x-0 top-1/4 flex justify-center pointer-events-none"
              aria-live="polite"
              // Named, because the run-over card says "Past Half Dome. El
              // Capitan is 285 ft higher." and the two are otherwise the same
              // words in the same page. A reader gets the region it belongs
              // to; a test gets something to hold that is not prose.
              aria-label="Climb passed"
            >
              <span className="bg-surface/90 border border-line rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest shadow-sm">
                Past {passed.name}
              </span>
            </div>
          )}
        </div>

        {phase === 'menu' && (
          <>
            <Card>
              <p className="text-sm leading-relaxed mb-3">
                Climb an endless wall. Tap either side of the screen — or use the arrow keys — to
                switch lanes. Rocks end the run; the small fast ones are the ones that get you.
              </p>
              {raceable('ascent') && (
                <p className="text-sm text-ink-soft leading-relaxed mb-3">
                  Your best run today climbs it with you — a faint second climber on the same wall,
                  making the same moves. {runHeight(today?.metres ?? 0, units).label} to beat.
                </p>
              )}
              <Button size="lg" className="w-full" onClick={() => start('ascent')}>
                <Play size={18} /> Climb
              </Button>
            </Card>

            <Card title="Free Solo">
              <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                One life, thirty per cent faster, no hearts.{' '}
                {freeSoloUnlocked ? 'Unlocked.' : describeFreeSoloUnlock(units)}
                {raceable('freesolo') &&
                  ` Today's best Free Solo runs beside you — ${runHeight(today?.metres ?? 0, units).label} to beat.`}
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={!freeSoloUnlocked}
                onClick={() => start('freesolo')}
              >
                Free Solo
              </Button>
            </Card>

            {/* Two climbers on the same wall, with no server and no account
                (PLAN.md M219). */}
            <Card title="Race someone">
              <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                Save a run to a file and send it however you like. Whoever opens it climbs the same
                wall against your line — the file is the inputs, not the score, so it cannot claim a
                height it did not climb.
              </p>
              {challenge !== null ? (
                <>
                  <div className="rounded-xl bg-sunken px-3 py-2.5 mb-3">
                    <div className="text-lg font-black tabular-nums leading-none">
                      {runHeight(challenge.metres, units).label}
                    </div>
                    <p className="text-xs text-ink-soft mt-1 leading-relaxed">
                      {describeTape(challenge, todayKey())}
                      {challenge.claimed !== null &&
                        ` The file claimed ${runHeight(challenge.claimed, units).label}; this is what its inputs actually climb.`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {/* A Free Solo tape does not get past M218's gate. That
                        unlock is a proficiency check on the easier mode, and
                        a file from a friend is not a way to skip the belay
                        check — the race would otherwise be the one door into
                        a mode this climber has not opened. */}
                    <Button
                      className="flex-1"
                      disabled={challenge.tape.mode === 'freesolo' && !freeSoloUnlocked}
                      onClick={() => start(challenge.tape.mode, challenge)}
                    >
                      <Play size={16} /> Race it
                    </Button>
                    <Button variant="outline" onClick={() => setChallenge(null)}>
                      Clear
                    </Button>
                  </div>
                  {challenge.tape.mode === 'freesolo' && !freeSoloUnlocked && (
                    <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                      That is a Free Solo run. {describeFreeSoloUnlock(units)}
                    </p>
                  )}
                  <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                    A race counts for the race. It sets no record and pays nothing — the payout is
                    for your own wall, once a day.
                  </p>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => tapeFileRef.current?.click()}
                  >
                    Open a run file
                  </Button>
                  {tapeProblem !== null && (
                    <p className="text-xs text-danger mt-2 leading-relaxed">{tapeProblem}</p>
                  )}
                </>
              )}
              <FileInput
                ref={tapeFileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void pickTape(e.target.files)}
              />
            </Card>

            <Card title={`Today's payout`}>
              <TodayPayout
                daily={today}
                rested={derived.restedToday}
                units={units}
              />
            </Card>

            {resting && (
              <Card title="What you're working">
                <Link href={`/projects/${resting.id}`} className="block">
                  <p className="text-sm leading-relaxed">
                    {derived.restedToday ? "Today's rest is for " : "You're on "}
                    <span className="font-semibold">{resting.name}</span> — {describeClimb(resting)}.
                  </p>
                  {describeBurns(resting) !== null && (
                    <p className="text-xs text-ink-soft mt-1.5">{describeBurns(resting)}</p>
                  )}
                </Link>
                <p className="text-xs text-ink-soft mt-3">Nothing on this screen moves it.</p>
              </Card>
            )}

            <Card title="Your records">
              <dl className="grid grid-cols-1 gap-1.5 text-sm">
                <Row label="Best climb" value={runHeight(records.best.ascent, units).label} />
                <Row label="Best Free Solo" value={runHeight(records.best.freesolo, units).label} />
                <Row label="Best pure run" value={runHeight(records.pureBest, units).label} />
                <Row label="Runs" value={String(records.runs)} />
                {today && <Row label="Today's wall" value={runHeight(today.metres, units).label} />}
              </dl>
              {bestScale !== null && (
                <p className="text-sm text-ink-soft mt-3 leading-relaxed">{bestScale}</p>
              )}
              <p className="text-xs text-ink-soft mt-3">
                Everyone gets the same wall each day — the pattern comes from the date, so a score is
                comparable without anything leaving your phone. Heights are the game's own — nothing
                here moves the altimeter.
              </p>
            </Card>

            {describeAscent(history, units) !== null && (
              <Card title="The month behind you">
                <DayBars history={history} units={units} />
                <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeAscent(history, units)}</p>
              </Card>
            )}

            {endings && (
              <Card title="How your runs end">
                <p className="text-sm leading-relaxed mb-3">{describeEndings(endings)}</p>
                <dl className="grid grid-cols-1 gap-1.5 text-sm">
                  {endings.kinds.map((kind) => (
                    <Row
                      key={kind.kind}
                      label={kind.label}
                      value={`${kind.deaths} · ${Math.round(kind.share * 100)}%`}
                    />
                  ))}
                </dl>
                <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                  {endings.counted} runs, averaging {runHeight(endings.averageMetres, units).label}.
                  Percentages are of your runs, not of the wall.
                </p>
              </Card>
            )}

            {/* A picker since M227. It was this list, read-only: four walls
                chosen for you off the altimeter, with nothing saying they
                existed and no way to climb the one you wanted. Paint only —
                the wall you are looking at cannot change the wall you are
                climbing (`engine/ascent/walls.ts`). */}
            <Card title="Walls">
              <p className="text-xs text-ink-soft mb-2 leading-relaxed">
                {currency.balance.toLocaleString()} coins. Cosmetic only — the same climb on
                every one of them.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {/* Its swatch is whichever wall it resolves to today, so the
                    row is not a blank square beside eight coloured ones. */}
                <WallRow
                  name="Automatic"
                  blurb="The best wall your altimeter has opened, and recovery skies on a rest day."
                  palette={wallFor(null, access).palette}
                  open
                  selected={chosenWall === null}
                  onPick={() => void chooseWall(null)}
                />
                {WALLS.map((w) => {
                  const open = unlocked(w, access);
                  const buyable =
                    !open && w.price !== undefined && currency.balance >= w.price;
                  return (
                    <WallRow
                      key={w.id}
                      name={w.name}
                      blurb={open ? w.blurb : lockNote(w, units)}
                      palette={w.palette}
                      open={open}
                      buyable={buyable}
                      selected={chosenWall === w.id}
                      onPick={() => {
                        if (open) void chooseWall(w.id);
                        else if (buyable) {
                          void buyWall(w, currency.balance).then((bought) => {
                            if (bought) void chooseWall(w.id);
                          });
                        }
                      }}
                    />
                  );
                })}
              </div>
            </Card>

            {/* Every stat, with its number, whether it is doing anything
                yet or not. A list
                of only the active hooks made the ones you have not earned
                invisible, which is the half that would give you a reason to
                train (PLAN.md M31). */}
            <Card title="What your training does here">
              <ul className="grid grid-cols-1 gap-1.5 text-sm text-ink-soft">
                <Hook
                  on={modifiers.rampReduction > 0}
                  text={`Endurance ${stat.END} slows the speed ramp by ${pct(modifiers.rampReduction)}`}
                  off={`Endurance ${stat.END} — would slow the ramp, up to ${pct(HOOKS.maxRampReduction)}`}
                />
                <Hook
                  on={modifiers.hitboxTrim > 0}
                  text={`Mobility ${stat.AGI} trims your hitbox by ${pct(modifiers.hitboxTrim)}`}
                  off={`Mobility ${stat.AGI} — would trim your hitbox, up to ${pct(HOOKS.maxHitboxTrim)}`}
                />
                <Hook
                  on={modifiers.laneTrim > 0}
                  text={`Technique ${stat.TEC} lands a lane change ${pct(modifiers.laneTrim)} sooner`}
                  off={`Technique ${stat.TEC} — would quicken the lane change, up to ${pct(HOOKS.maxLaneTrim)}`}
                />
                <Hook
                  on={modifiers.coinMultiplier > 1}
                  text={`Strength ${stat.STR} makes a coin worth ${pct(modifiers.coinMultiplier - 1)} more`}
                  off={`Strength ${stat.STR} — would raise coin value, up to ${pct(HOOKS.maxCoinBonus)}`}
                />
                <Hook
                  on={modifiers.chalkSaves > 0}
                  text={`${modifiers.chalkSaves} chalk save${modifiers.chalkSaves === 1 ? '' : 's'} — one free near-miss each`}
                  off={`Mental ${stat.MEN} — a chalk save at ${HOOKS.chalkSaveStat}, one free near-miss`}
                />
              </ul>

              {/* The boons are their own list, under their own heading. They
                  were one hardcoded row until M211, which would have hidden
                  the four added outside Dynamic Power on the very screen that
                  claims to say what training does — and a hand-written line
                  is the drift `boons.ts` exists to stop, so these come from
                  the table. Every one of them, earned or not, for M31's
                  reason. A shared heading rather than a tail on each: seven
                  rows ending "— from a skill node" is a stutter, which only
                  showed up once they were on a screen together. */}
              <p className="text-xs font-bold uppercase tracking-widest text-ink-soft mt-4 mb-2">
                From the skill trees
              </p>
              <ul className="grid grid-cols-1 gap-1.5 text-sm text-ink-soft">
                {BOON_IDS.map((id) => (
                  <Hook
                    key={id}
                    on={held.has(id)}
                    text={sentence(BOONS[id].label)}
                    off={sentence(BOONS[id].label)}
                  />
                ))}
              </ul>
              <p className="text-xs text-ink-soft mt-3">
                Capped on purpose. Training helps a little; it is still a reflex game — and the
                wall itself is the same one everyone gets today, so none of this changes what you
                are climbing.
              </p>
            </Card>
          </>
        )}

        {phase === 'over' && (
          <Card>
            <div className="text-center mb-3">
              <div className="text-4xl font-black tabular-nums leading-none">
                {runHeight(hud.metres, units).value}
                <span className="text-lg text-ink-soft ml-1.5">{runHeight(hud.metres, units).unit}</span>
              </div>
              <p className="text-sm text-ink-soft mt-1.5">
                {/* A race is measured against the run it is racing, and the
                    line below says so. Printing "Best is 0 ft" beside it
                    compares a race to a lifetime record it never touched
                    — which is what the browser showed on the first pass. */}
                {raced !== null
                  ? null
                  : newBest
                    ? 'A new best.'
                    : `Best is ${runHeight(best, units).label}.`}
                {hud.pure && ' No power-ups touched.'}
              </p>
              {runScale !== null && <p className="text-sm text-ink-soft mt-1">{runScale}</p>}
            </div>
            {run?.mode === 'ascent' && !freeSoloUnlocked && hud.metres >= FREE_SOLO_UNLOCK && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent mb-3">
                <Sparkles size={15} /> Free Solo unlocked
              </p>
            )}
            {payout && payout.units > 0 && (
              <div className="border-t border-line pt-3 mb-3">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-semibold">Today's payout</span>
                  <span className="font-bold tabular-nums">+{payout.xp} XP</span>
                </div>
                <ul className="grid grid-cols-1 gap-1 text-xs text-ink-soft">
                  {payout.lines.map((line) => (
                    <li key={line.label} className="flex items-baseline justify-between gap-3">
                      <span>{line.label}</span>
                      <span className="tabular-nums">+{unitsToXp(line.units)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                  {payout.capped
                    ? 'Capped — a day of play can never approach a session.'
                    : payout.restBoost
                      ? 'Rest day, so it pays half again as much.'
                      : 'Paid on your best run of the day. A rest day pays ×1.5.'}
                </p>
              </div>
            )}

            {runAchievement && (
              <div className="border-t border-line pt-3 mb-3">
                <div className="text-2xs font-bold uppercase tracking-widest text-accent">
                  Achievement
                </div>
                <p className="text-lg font-black tracking-tight leading-tight mt-1">
                  {runAchievement.name}
                </p>
                <p className="text-sm text-ink-soft mt-1 leading-relaxed">{runAchievement.detail}</p>
              </div>
            )}

            {raced !== null && (
              <div className="border-t border-line pt-3 mb-3">
                <p className="text-sm text-ink-soft leading-relaxed">
                  {hud.metres > raced.metres
                    ? `You beat it by ${runHeight(hud.metres - raced.metres, units).label}.`
                    : `${runHeight(raced.metres - hud.metres, units).label} short.`}{' '}
                  A race sets no record and pays nothing.
                </p>
              </div>
            )}

            <div className="flex gap-2 mb-3">
              <Button className="flex-1" onClick={() => start(mode, raced)}>
                <Play size={16} /> Again
              </Button>
              <Button variant="outline" onClick={() => setPhase('menu')}>
                Done
              </Button>
            </div>

            {finished !== null && (
              <div className="flex justify-center mb-2">
                <Button variant="outline" size="sm" onClick={saveRun}>
                  Save this run to a file
                </Button>
              </div>
            )}

            {/* Not on a race: that card is titled with today's daily wall,
                and a race can be on any wall the sender's file carries. The
                file is the share that fits a race. */}
            {raced === null && (
            <div className="flex justify-center">
              <ShareButton
                label={`Share Daily Wall #${wallNumber(todayKey())}`}
                filename={`ascent-wall-${wallNumber(todayKey())}.png`}
                content={dailyWallCard({
                  wall: wallNumber(todayKey()),
                  metres: hud.metres,
                  mode,
                  pure: hud.pure,
                  coins: hud.coins,
                  avatar,
                  units,
                })}
              />
            </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** A boon label, which is written as a fragment, as the start of a line. */
function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Hook({ on, text, off }: { on: boolean; text: string; off: string }) {
  return (
    <li className={on ? 'text-ink' : 'opacity-50'}>
      {on ? '✓ ' : '· '}
      {on ? text : off}
    </li>
  );
}

/** What today has banked so far, and what it would take to beat it. */
function TodayPayout({
  daily,
  rested,
  units,
}: {
  daily: { metres: number; coins: number; mode: Mode } | null;
  rested: boolean;
  units: UnitSystem;
}) {
  if (!daily) {
    return (
      <p className="text-sm text-ink-soft leading-relaxed">
        Play as much as you like — the payout comes from your best run of the day, once.
        {rested ? ' Today is a rest day, so it pays half again as much.' : ' A logged rest day pays ×1.5.'}
      </p>
    );
  }
  const payout = payoutFor({ date: '', ...daily }, rested, units);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">
          Best today · <span className="font-semibold">{runHeight(daily.metres, units).label}</span>
        </span>
        <span className="font-bold tabular-nums">+{payout.xp} XP</span>
      </div>
      <p className="text-xs text-ink-soft mt-2 leading-relaxed">
        {rested
          ? 'Recovery skies — today pays half again as much.'
          : 'Beat it and the payout is re-priced. A logged rest day pays ×1.5.'}
      </p>
    </>
  );
}

/**
 * A bar per day of the last month, and a gap for a wall you did not climb
 * (PLAN.md M96).
 *
 * A gap rather than a zero-height bar: not climbing a wall and climbing
 * nought metres of it are different days, and drawing them the same is the
 * mistake the consistency grid records for its own rest days.
 */
function DayBars({ history, units }: { history: AscentHistory; units: UnitSystem }) {
  const peak = Math.max(1, ...history.days.map((d) => d.metres));
  const span = daysBetween(history.from, history.to) + 1;
  const byDate = new Map(history.days.map((d) => [d.date, d]));

  return (
    <div
      className="flex items-end gap-0.5 h-20"
      role="img"
      aria-label={`${history.played} of the last ${span} daily walls climbed, best ${runHeight(history.best?.metres ?? 0, units).label}`}
    >
      {Array.from({ length: span }, (_, i) => {
        const date = addDays(history.from, i);
        const day = byDate.get(date);
        return (
          <div key={date} className="flex-1 flex items-end h-full">
            {day ? (
              <div
                className="w-full rounded-sm bg-accent"
                style={{ height: `${Math.max(6, (day.metres / peak) * 100)}%` }}
              />
            ) : (
              <div className="w-full rounded-sm bg-sunken" style={{ height: '6%' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
