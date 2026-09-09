import { useEffect, useMemo } from 'react';
import { Check, ClipboardCheck, Plus, Sparkles, Target, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import {
  deriveBoard,
  daysLeft,
  type BountySpec,
  type Challenge,
} from '@/engine/challenges';
import { today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { unitsToXp } from '@/engine/economy';
import { BOUNTY_CAP, useGame } from '@/store/game';
import { injuryPolicy } from '@/engine/injury';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { useSessions } from '@/store/sessions';
import { useSkillEffects } from '@/store/skills';
import { Button } from '@/ui/Button';
import { announce } from '@/ui/Announce';
import { Card } from '@/ui/Card';
import { Meter } from '@/ui/Meter';
import { PageHeader } from '@/ui/PageHeader';

/** Everything the board shows comes from the log, so this hook is the board. */
export function useBoard() {
  const byDate = useSessions((s) => s.byDate);
  const bounties = useGame((s) => s.bounties);
  const ledger = useGame((s) => s.ledger);
  const activeProgramId = useProfile((s) => s.activeProgramId);

  const display = useSettings((s) => s.display);
  const injuries = useProfile((s) => s.injuries);
  const claimed = useMemo(
    () => ledger.filter((e) => e.id.startsWith('claim:')).map((e) => e.id.slice(6)),
    [ledger],
  );

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    const rule = program?.constraints.find((c) => c.kind === 'sessions-per-week');
    const weeklyTarget = rule && rule.kind === 'sessions-per-week' ? rule.min : 3;
    return {
      board: deriveBoard({
        sessions, state, accepted: bounties, weeklyTarget, claimed, display,
        injured: injuryPolicy(injuries).excluded,
      }),
      claimed: new Set(claimed),
    };
  }, [byDate, bounties, activeProgramId, claimed, display, injuries]);
}

export function BoardPage() {
  const hydrated = useGame((s) => s.hydrated);
  const load = useGame((s) => s.load);
  const { board, claimed } = useBoard();

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const open = [board.daily, ...board.weekly, ...board.bounties].filter(
    (c) => c.done && !claimed.has(c.id),
  ).length;

  return (
    <>
      <PageHeader
        title="Board"
        subtitle={open > 0 ? `${open} ready to claim` : 'Everything here resolves from your log'}
      />

      <div className="grid grid-cols-1 gap-3">
        <Card title="Today">
          <ChallengeRow challenge={board.daily} claimed={claimed.has(board.daily.id)} />
        </Card>

        <Card title="This week">
          <ul className="grid grid-cols-1 gap-3">
            {board.weekly.map((c) => (
              <li key={c.id}>
                <ChallengeRow challenge={c} claimed={claimed.has(c.id)} />
              </li>
            ))}
          </ul>
        </Card>

        <BountiesCard board={board} claimed={claimed} />

        <Card>
          <p className="text-xs text-ink-soft leading-relaxed">
            Nothing on this board has a "mark done" button. A challenge completes because your
            sessions say it did — which is also why a bounty only counts sessions logged after you
            accepted it. A perfect week here is worth under three sessions of real training.
          </p>
        </Card>
      </div>
    </>
  );
}

function BountiesCard({
  board,
  claimed,
}: {
  board: ReturnType<typeof deriveBoard>;
  claimed: Set<string>;
}) {
  const accept = useGame((s) => s.acceptBounty);
  const abandon = useGame((s) => s.abandonBounty);
  const cap = BOUNTY_CAP + useSkillEffects().bountySlots;
  const full = board.bounties.length >= cap;

  return (
    <Card title={`Bounties · ${board.bounties.length} of ${cap}`}>
      {board.bounties.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 mb-3">
          {board.bounties.map((c) => (
            <li key={c.id}>
              <ChallengeRow
                challenge={c}
                claimed={claimed.has(c.id)}
                onAbandon={() => void abandon(c.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {board.bounties.length === 0 && (
        <p className="text-sm text-ink-soft mb-3">
          Bounties are built from your own send distribution — a grade one notch above where most of
          your sends sit, and the drill category your logs show least.
        </p>
      )}

      {!full && board.offers.length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {board.offers.map((spec) => (
            <OfferRow key={spec.key} spec={spec} onAccept={() => void accept(spec, cap)} />
          ))}
        </ul>
      )}

      {full && (
        <p className="text-xs text-ink-soft">
          {cap} at a time. Finish one or drop it before taking another.
        </p>
      )}
    </Card>
  );
}

function OfferRow({ spec, onAccept }: { spec: BountySpec; onAccept: () => void }) {
  return (
    <li className="bg-sunken rounded-xl px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Target size={15} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{spec.title}</div>
          <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{spec.detail}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onAccept} className="shrink-0">
          <Plus size={14} /> Take
        </Button>
      </div>
    </li>
  );
}

function ChallengeRow({
  challenge,
  claimed,
  onAbandon,
}: {
  challenge: Challenge;
  claimed: boolean;
  onAbandon?: () => void;
}) {
  const claim = useGame((s) => s.claim);
  const pct = Math.round((challenge.progress / challenge.target) * 100);
  const left = daysLeft(challenge, today());

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`font-semibold text-sm ${claimed ? 'text-ink-soft' : ''}`}>
          {challenge.title}
        </span>
        <span className="text-xs text-ink-soft ml-auto tabular-nums shrink-0">
          {challenge.progress} / {challenge.target} {challenge.unit}
        </span>
      </div>

      <Meter
        value={pct / 100}
        tone={challenge.done ? 'positive' : 'accent'}
        label={challenge.title}
        valueText={`${challenge.progress} of ${challenge.target} ${challenge.unit}`}
        className="mb-1.5"
      />

      <p className="text-xs text-ink-soft leading-relaxed">{challenge.detail}</p>

      <div className="flex items-center gap-2 mt-2">
        {claimed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-positive">
            <Check size={13} /> Claimed
          </span>
        ) : challenge.done ? (
          <Button
            size="sm"
            onClick={() => {
              void claim(challenge);
              announce(`${challenge.title} claimed. ${unitsToXp(challenge.reward)} XP.`);
            }}
          >
            <Sparkles size={14} /> Claim {unitsToXp(challenge.reward)} XP
          </Button>
        ) : (
          <span className="text-xs text-ink-soft">
            +{unitsToXp(challenge.reward)} XP
            {challenge.kind !== 'bounty' && ` · ${left === 0 ? 'today' : `${left} days left`}`}
          </span>
        )}
        {onAbandon && !challenge.done && (
          <Button variant="ghost" size="sm" onClick={onAbandon} className="ml-auto text-xs">
            <X size={12} /> Drop
          </Button>
        )}
      </div>
    </div>
  );
}

/** Compact Home entry: what is ready, or what is left. */
export function BoardCard() {
  const { board, claimed } = useBoard();
  const all = [board.daily, ...board.weekly, ...board.bounties];
  const ready = all.filter((c) => c.done && !claimed.has(c.id)).length;
  const done = all.filter((c) => c.done).length;

  return (
    <div className="flex items-center gap-3">
      <ClipboardCheck size={18} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {ready > 0 ? `${ready} ready to claim` : `${done} of ${all.length} done`}
        </p>
        <p className="text-xs text-ink-soft mt-0.5 truncate">
          {board.daily.done ? board.weekly.find((c) => !c.done)?.title ?? 'Board clear' : board.daily.title}
        </p>
      </div>
    </div>
  );
}
