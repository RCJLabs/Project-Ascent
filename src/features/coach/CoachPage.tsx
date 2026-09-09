import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, CircleCheck, Info, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { buildTips, visibleTips, type Tip, type TipTone } from '@/engine/coach';
import { deriveClimberState } from '@/engine/derive';
import { diagnose } from '@/engine/plateau';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

const TONE: Record<TipTone, { icon: typeof Info; className: string }> = {
  good: { icon: CircleCheck, className: 'text-positive' },
  neutral: { icon: Info, className: 'text-accent' },
  caution: { icon: TriangleAlert, className: 'text-warn' },
};

/** Everything the board needs, derived in one place. */
export function useTips(): { all: Tip[]; visible: Tip[]; hidden: number } {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const metrics = useMetrics((s) => s.entries);
  const injuries = useProfile((s) => s.injuries);
  const equipment = useProfile((s) => s.equipment);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const lastExportAt = useProfile((s) => s.lastExportAt);
  const dismissed = useProfile((s) => s.dismissedTips);

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    const all = buildTips({
      state,
      sessions,
      projects,
      metrics,
      lastExportAt,
      diagnosis: diagnose({
        state,
        sessions,
        injuries: injuries.map((i) => i.part),
        equipment,
        metrics,
        program,
      }),
    });
    const visible = visibleTips(all, dismissed);
    return { all, visible, hidden: all.length - visible.length };
  }, [byDate, projects, metrics, injuries, equipment, activeProgramId, lastExportAt, dismissed]);
}

export function CoachPage() {
  const { visible, hidden } = useTips();
  const dismissTip = useProfile((s) => s.dismissTip);
  const restoreTips = useProfile((s) => s.restoreTips);

  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-soft mb-3">
        <ArrowLeft size={15} /> Home
      </Link>

      <PageHeader
        title="Coach's Corner"
        subtitle="Standing observations about your training, from rules over your own numbers."
      />

      <div className="grid gap-3">
        {visible.length === 0 ? (
          <Card>
            <p className="text-sm leading-relaxed">
              {hidden > 0
                ? 'Nothing left on the board — everything currently true has been read and set aside.'
                : 'Nothing to flag. Every rule here has looked at your log and found nothing worth interrupting you about, which is the good outcome.'}
            </p>
          </Card>
        ) : (
          visible.map((tip) => (
            <TipCard key={tip.id} tip={tip} onDismiss={() => dismissTip(tip.id, tip.signature)} />
          ))
        )}

        <Card title="How this works">
          <p className="text-sm text-ink-soft leading-relaxed">
            Every card here is a rule, not a model. Each one reads numbers the app already derives
            from your log and fires when a threshold is crossed — no guessing, nothing sent
            anywhere, and the same log always produces the same advice.
          </p>
          <p className="text-sm text-ink-soft leading-relaxed mt-2.5">
            Setting a card aside hides that exact fact, not the subject. Ten burns on a project
            waved away comes back at twenty.
          </p>
          {hidden > 0 && (
            <Button size="sm" variant="outline" className="mt-3" onClick={restoreTips}>
              <RotateCcw size={14} /> Bring back {hidden} set aside
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}

function TipCard({ tip, onDismiss }: { tip: Tip; onDismiss: () => void }) {
  const { icon: Icon, className } = TONE[tip.tone];
  return (
    <Card>
      <div className="flex items-start gap-2.5 mb-2">
        <Icon size={17} className={`${className} shrink-0 translate-y-0.5`} />
        <h2 className="font-bold leading-snug flex-1">{tip.headline}</h2>
        <button
          onClick={onDismiss}
          className="text-ink-soft p-1 -m-1 shrink-0"
          aria-label={`Set aside: ${tip.headline}`}
        >
          <X size={16} />
        </button>
      </div>
      <p className="text-sm text-ink-soft leading-relaxed">{tip.body}</p>
      {tip.action && (
        <Link
          href={tip.action.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent mt-3"
        >
          {tip.action.label} <ArrowRight size={14} />
        </Link>
      )}
    </Card>
  );
}
