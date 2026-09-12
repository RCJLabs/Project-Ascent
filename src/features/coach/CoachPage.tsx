import { Link } from 'wouter';
import { ArrowRight, CircleCheck, Info, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { type Tip, type TipTone } from '@/engine/coach';
import { useTips } from './useTips';
import { useProfile } from '@/store/profile';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';

const TONE: Record<TipTone, { icon: typeof Info; className: string }> = {
  good: { icon: CircleCheck, className: 'text-positive' },
  neutral: { icon: Info, className: 'text-accent' },
  caution: { icon: TriangleAlert, className: 'text-warn' },
};

export function CoachPage() {
  const { visible, hidden } = useTips();
  const dismissTip = useProfile((s) => s.dismissTip);
  const restoreTips = useProfile((s) => s.restoreTips);

  return (
    <>
      <BackLink />

      <PageHeader
        title="Coach's Corner"
        subtitle="Standing observations about your training, from rules over your own numbers."
      />

      <PageGrid>
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
      </PageGrid>
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
        <IconButton onClick={onDismiss} label={`Set aside: ${tip.headline}`}>
          <X size={16} />
        </IconButton>
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
