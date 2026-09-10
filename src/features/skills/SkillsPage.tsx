import { useState } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { describeEffect, type SkillProgress, type SkillTreeState, type TreeId } from '@/engine/skills';
import { useSkills } from '@/store/skills';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { DisclosureButton } from '@/ui/Disclosure';
import { Meter } from '@/ui/Meter';
import { PageHeader } from '@/ui/PageHeader';

export function SkillsPage() {
  const skills = useSkills();
  const [open, setOpen] = useState<TreeId | null>(skills.trees[0]?.id ?? null);
  const effects = skills.effects;
  const perks = [
    effects.projectSlots > 0 && `+${effects.projectSlots} project slot${effects.projectSlots === 1 ? '' : 's'}`,
    effects.bountySlots > 0 && `+${effects.bountySlots} bounty slot${effects.bountySlots === 1 ? '' : 's'}`,
    effects.warmupVariety > 0 && `+${effects.warmupVariety} warmup variety`,
    effects.restRecovery > 0 && `${Math.round(effects.restRecovery * 100)}% deeper rest recovery`,
    ...effects.cosmetics.map((c) => c.label),
  ].filter(Boolean) as string[];

  return (
    <>
      <BackLink />

      <PageHeader title="Skills" subtitle={`${skills.unlocked} of ${skills.total} unlocked`} />

      <PageGrid>
        <EmptyState>
          There are no points to spend. Every node here unlocks because the log says you did the
          thing — a drill count, a grade, a run of weeks, a number on a benchmark. The tree is a
          map of your training, not a shop.
        </EmptyState>

        {perks.length > 0 && (
          <Card title="Active perks">
            <ul className="grid grid-cols-1 gap-1.5">
              {perks.map((perk) => (
                <li key={perk} className="flex items-baseline gap-2 text-sm">
                  <Sparkles size={13} className="text-accent shrink-0 translate-y-0.5" />
                  {perk}
                </li>
              ))}
            </ul>
            {effects.ascentBoons.length > 0 && (
              <p className="text-xs text-ink-soft mt-3">
                Waiting on The Ascent: {effects.ascentBoons.map((b) => b.label).join('; ')}.
              </p>
            )}
          </Card>
        )}

        {skills.next.length > 0 && (
          <Card title="Closest to unlocking">
            <ul className="grid grid-cols-1 gap-2.5">
              {skills.next.map((entry) => (
                <li key={entry.node.id}>
                  <NodeRow entry={entry} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {skills.trees.map((tree) => (
          <TreeCard
            key={tree.id}
            tree={tree}
            open={open === tree.id}
            onToggle={() => setOpen(open === tree.id ? null : tree.id)}
          />
        ))}
      </PageGrid>
    </>
  );
}

function TreeCard({
  tree,
  open,
  onToggle,
}: {
  tree: SkillTreeState;
  open: boolean;
  onToggle: () => void;
}) {
  const branches = new Map<string, SkillProgress[]>();
  for (const entry of tree.nodes) {
    branches.set(entry.node.branch, [...(branches.get(entry.node.branch) ?? []), entry]);
  }

  return (
    <Card>
      <DisclosureButton open={open} onToggle={onToggle}>
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="font-bold">{tree.name}</h2>
          <span className="text-sm font-semibold tabular-nums ml-auto shrink-0">
            {tree.unlocked}/{tree.total}
          </span>
        </div>
        <p className="text-xs text-ink-soft mb-2 leading-relaxed">{tree.blurb}</p>
        <Meter
          value={tree.unlocked / Math.max(1, tree.total)}
          label={`${tree.name} progress`}
          valueText={`${tree.unlocked} of ${tree.total} unlocked`}
        />
      </DisclosureButton>

      {open && (
        <div className="grid grid-cols-1 gap-4 mt-4">
          {[...branches.entries()].map(([name, entries]) => (
            <div key={name}>
              <h3 className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-2">
                {name}
              </h3>
              <ol className="grid grid-cols-1 gap-2">
                {entries
                  .sort((a, b) => a.node.tier - b.node.tier)
                  .map((entry) => (
                    <li key={entry.node.id}>
                      <NodeRow entry={entry} />
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NodeRow({ entry }: { entry: SkillProgress }) {
  const { node, unlocked, measurement, blocked } = entry;
  const pct = Math.min(100, Math.round((measurement.current / Math.max(1, measurement.target)) * 100));

  return (
    <div className={`bg-sunken rounded-xl px-3 py-2.5 ${unlocked ? '' : 'opacity-95'}`}>
      <div className="flex items-baseline gap-2">
        {unlocked ? (
          <Check size={13} className="text-positive shrink-0 translate-y-0.5" />
        ) : (
          <Lock size={12} className="text-ink-soft shrink-0 translate-y-0.5" />
        )}
        <span className={`text-sm ${unlocked ? 'font-bold' : 'font-semibold text-ink-soft'}`}>
          {node.name}
        </span>
        {!unlocked && (
          <span className="text-xs text-ink-soft ml-auto tabular-nums shrink-0">
            {measurement.current.toLocaleString()} / {measurement.target.toLocaleString()}
          </span>
        )}
      </div>

      <p className="text-xs text-ink-soft mt-1 leading-relaxed">{measurement.detail}</p>

      {!unlocked && (
        <div className="h-1 rounded-full bg-surface overflow-hidden mt-1.5">
          <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      )}

      {blocked && (
        <p className="text-xs text-warn mt-1.5">
          Done — waiting on the rung before it in this branch.
        </p>
      )}

      {node.effect && (
        <p className={`text-xs mt-1.5 ${unlocked ? 'text-accent font-semibold' : 'text-ink-soft'}`}>
          {describeEffect(node.effect)}
        </p>
      )}
    </div>
  );
}
