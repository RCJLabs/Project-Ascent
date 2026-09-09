import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Heart, Play, Shield, Sparkles } from 'lucide-react';
import { VIEW } from '@/engine/ascent/config';
import {
  createRun,
  metres,
  modifiersFrom,
  step,
  type Input,
  type Mode,
  type RunState,
} from '@/engine/ascent/game';
import { payoutFor, wallNumber, type AscentPayout } from '@/engine/ascent/rewards';
import { dailySeed } from '@/engine/ascent/rng';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveAvatar } from '@/engine/avatar';
import { today as todayKey } from '@/engine/dates';
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
import { useGame, useXp } from '@/store/game';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSkills } from '@/store/skills';
import { unitsToXp } from '@/engine/economy';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { ShareButton } from '@/features/share/ShareSheet';
import { dailyWallCard } from '@/ui/shareCard';
import { THEME_UNLOCKS, buildWall, render, themeForHeight } from './render';

/** Free Solo is the hard mode, and it has to be earned. */
export const FREE_SOLO_UNLOCK = 2000;

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
}

export function AscentPage() {
  const byDate = useSessions((s) => s.byDate);
  const metricEntries = useMetrics((s) => s.entries);
  const projects = useProjects((s) => s.projects);
  const injuries = useProfile((s) => s.injuries);
  const palette = useProfile((s) => s.avatarPalette);
  const xp = useXp();
  const skills = useSkills();
  const records = useGame((s) => s.ascent);
  const recordRun = useGame((s) => s.recordRun);
  const hydrated = useGame((s) => s.hydrated);
  const loadGame = useGame((s) => s.load);

  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<Mode>('ascent');
  const [hud, setHud] = useState<Hud>({ metres: 0, coins: 0, lives: 1, saves: 0, slowmo: false, pure: true });
  const [payout, setPayout] = useState<AscentPayout | null>(null);
  const [newBest, setNewBest] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The record to beat, read before the run so recordRun cannot move it. */
  const beatRef = useRef(0);
  const runRef = useRef<RunState | null>(null);
  const frameRef = useRef<number>(0);
  const inputRef = useRef<Input>(0);

  useEffect(() => {
    if (!hydrated) void loadGame();
  }, [hydrated, loadGame]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
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
      }),
    [xp.progress.level, derived.vitality.state, derived.feet, palette],
  );

  const modifiers = useMemo(
    () =>
      modifiersFrom({
        end: derived.stats.END.value,
        agi: derived.stats.AGI.value,
        men: derived.stats.MEN.value,
        boons: skills.effects.ascentBoons.map((b) => b.id),
      }),
    [derived.stats, skills.effects.ascentBoons],
  );

  // Rest days get their own sky. Otherwise the wall follows the altimeter.
  const theme = themeForHeight(derived.feet, derived.restedToday);

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
      void recordRun({
        mode: run.mode,
        metres: climbed,
        coins: run.coins,
        pure: run.pure,
        date: todayKey(),
        rested: derived.restedToday,
      }).then(setPayout);
    },
    [recordRun, derived.restedToday],
  );

  const start = useCallback(
    (chosen: Mode) => {
      // Browsers refuse to start audio outside a gesture, and this is one.
      unlock();
      setMode(chosen);
      beatRef.current = records.best[chosen];
      runRef.current = createRun({ mode: chosen, seed, modifiers });
      inputRef.current = 0;
      setPayout(null);
      setNewBest(false);
      setPhase('playing');
    },
    [seed, modifiers, records.best],
  );

  // The loop. React never re-renders per frame — the HUD is refreshed on a
  // timer instead, so sixty frames a second cost one canvas draw each.
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(width * (VIEW.height / VIEW.width) * dpr);
    const scale = (width * dpr) / VIEW.width;

    let last = performance.now();
    let hudAt = 0;

    const frame = (now: number) => {
      const run = runRef.current;
      if (!run) return;
      const dt = now - last;
      last = now;

      step(run, dt, inputRef.current);
      inputRef.current = 0;
      render(ctx, run, { palette: theme, wall, avatar, scale });

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
        }
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
        });
      }

      if (run.over) {
        setHud({
          metres: metres(run), coins: Math.round(run.coins), lives: 0,
          saves: run.saves, slowmo: false, pure: run.pure,
        });
        finish(run);
        return;
      }
      frameRef.current = requestAnimationFrame(frame);
    };

    frameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameRef.current);
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

  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Home
      </Link>

      <PageHeader
        title="The Ascent"
        subtitle={`Daily Wall #${wallNumber(todayKey())}${derived.restedToday ? ' · recovery skies' : ''}`}
      />

      <div className="grid grid-cols-1 gap-3">
        {phase !== 'menu' && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-black text-xl tabular-nums">{hud.metres.toLocaleString()} m</span>
            <span className="text-ink-soft tabular-nums">◎ {hud.coins}</span>
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

        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="w-full rounded-2xl border border-line touch-none select-none bg-sunken"
          style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}`, display: phase === 'playing' ? 'block' : 'none' }}
          aria-label="The Ascent"
        />

        {phase === 'menu' && (
          <>
            <Card>
              <p className="text-sm leading-relaxed mb-3">
                Climb an endless wall. Tap either side of the screen — or use the arrow keys — to
                switch lanes. Rocks end the run; the small fast ones are the ones that get you.
              </p>
              <Button size="lg" className="w-full" onClick={() => start('ascent')}>
                <Play size={18} /> Climb
              </Button>
            </Card>

            <Card title="Free Solo">
              <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                One life, thirty per cent faster, no hearts.{' '}
                {freeSoloUnlocked
                  ? 'Unlocked.'
                  : `Reach ${FREE_SOLO_UNLOCK.toLocaleString()} m on the normal wall to unlock it.`}
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

            <Card title={`Today's payout`}>
              <TodayPayout
                daily={records.daily?.date === todayKey() ? records.daily : null}
                rested={derived.restedToday}
              />
            </Card>

            <Card title="Your records">
              <dl className="grid grid-cols-1 gap-1.5 text-sm">
                <Row label="Best climb" value={`${records.best.ascent.toLocaleString()} m`} />
                <Row label="Best Free Solo" value={`${records.best.freesolo.toLocaleString()} m`} />
                <Row label="Best pure run" value={`${records.pureBest.toLocaleString()} m`} />
                <Row label="Runs" value={String(records.runs)} />
                {records.daily?.date === todayKey() && (
                  <Row label="Today's wall" value={`${records.daily.metres.toLocaleString()} m`} />
                )}
              </dl>
              <p className="text-xs text-ink-soft mt-3">
                Everyone gets the same wall each day — the pattern comes from the date, so a score is
                comparable without anything leaving your phone.
              </p>
            </Card>

            <Card title="Walls">
              <ul className="grid grid-cols-1 gap-1.5 text-sm">
                {THEME_UNLOCKS.map((wall) => {
                  const on = derived.feet >= wall.feet;
                  return (
                    <li key={wall.id} className={on ? '' : 'opacity-50'}>
                      {on ? '✓ ' : '· '}
                      {wall.name}
                      {wall.feet > 0 && (
                        <span className="text-ink-soft">
                          {' '}· {wall.feet.toLocaleString()} ft on the altimeter
                        </span>
                      )}
                    </li>
                  );
                })}
                <li className={derived.restedToday ? '' : 'opacity-50'}>
                  {derived.restedToday ? '✓ ' : '· '}Recovery skies
                  <span className="text-ink-soft"> · on a logged rest day</span>
                </li>
              </ul>
            </Card>

            <Card title="What your training does here">
              <ul className="grid grid-cols-1 gap-1.5 text-sm text-ink-soft">
                <Hook on={modifiers.rampReduction > 0} text={`Endurance slows the speed ramp by ${Math.round(modifiers.rampReduction * 100)}%`} />
                <Hook on={modifiers.hitboxTrim > 0} text={`Mobility trims your hitbox by ${Math.round(modifiers.hitboxTrim * 100)}%`} />
                <Hook on={modifiers.chalkSaves > 0} text={`${modifiers.chalkSaves} chalk save${modifiers.chalkSaves === 1 ? '' : 's'} — one free near-miss each`} />
                <Hook on={modifiers.startWithSlowmo} text="You start every run with a slow-mo charge" />
                <Hook on={modifiers.coinMultiplier > 1} text="Coins are worth half again as much" />
              </ul>
              <p className="text-xs text-ink-soft mt-3">
                Capped on purpose. Training helps a little; it is still a reflex game.
              </p>
            </Card>
          </>
        )}

        {phase === 'over' && (
          <Card>
            <div className="text-center mb-3">
              <div className="text-4xl font-black tabular-nums leading-none">
                {hud.metres.toLocaleString()}
                <span className="text-lg text-ink-soft ml-1.5">m</span>
              </div>
              <p className="text-sm text-ink-soft mt-1.5">
                {newBest ? 'A new best.' : `Best is ${best.toLocaleString()} m.`}
                {hud.pure && ' No power-ups touched.'}
              </p>
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

            <div className="flex gap-2 mb-3">
              <Button className="flex-1" onClick={() => start(mode)}>
                <Play size={16} /> Again
              </Button>
              <Button variant="outline" onClick={() => setPhase('menu')}>
                Done
              </Button>
            </div>

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
                })}
              />
            </div>
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

function Hook({ on, text }: { on: boolean; text: string }) {
  return (
    <li className={on ? 'text-ink' : 'opacity-50'}>
      {on ? '✓ ' : '· '}
      {text}
    </li>
  );
}

/** What today has banked so far, and what it would take to beat it. */
function TodayPayout({
  daily,
  rested,
}: {
  daily: { metres: number; coins: number; mode: Mode } | null;
  rested: boolean;
}) {
  if (!daily) {
    return (
      <p className="text-sm text-ink-soft leading-relaxed">
        Play as much as you like — the payout comes from your best run of the day, once.
        {rested ? ' Today is a rest day, so it pays half again as much.' : ' A logged rest day pays ×1.5.'}
      </p>
    );
  }
  const payout = payoutFor({ date: '', ...daily }, rested);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">
          Best today · <span className="font-semibold">{daily.metres.toLocaleString()} m</span>
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
