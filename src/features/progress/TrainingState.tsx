import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Info,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import { shortLabel, today as todayKey } from '@/engine/dates';
import type { ClimberState } from '@/engine/derive';
import type { GradeScale } from '@/engine/grades';
import { diagnose, resetDates, type Verdict } from '@/engine/plateau';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { Card } from '@/ui/Card';
import { DisclosureButton } from '@/ui/Disclosure';

/** Every verdict ships with an icon and a sentence, so the colour is never
 *  the only thing carrying the meaning. Status colours are fixed and never
 *  themed — they must not be mistaken for a chart series. */
const LOOK: Record<Verdict, { color: string; Icon: typeof Info }> = {
  'insufficient-data': { color: 'var(--c-ink-soft)', Icon: Info },
  'recovery-compromised': { color: 'var(--viz-critical)', Icon: ShieldAlert },
  breakthrough: { color: 'var(--viz-good)', Icon: TrendingUp },
  plateau: { color: 'var(--viz-warning)', Icon: Activity },
  optimal: { color: 'var(--viz-good)', Icon: CheckCircle2 },
};

export function TrainingState({
  state,
  sessions,
  program,
  scale,
}: {
  state: ClimberState;
  sessions: Session[];
  program: Program | undefined;
  scale: GradeScale;
}) {
  const injuries = useProfile((s) => s.injuries);
  const equipment = useProfile((s) => s.equipment);
  const metrics = useMetrics((s) => s.entries);
  const display = useSettings((s) => s.display);
  const [showReset, setShowReset] = useState(false);

  const diagnosis = useMemo(
    () =>
      diagnose({
        display,
        state,
        sessions,
        injuries: injuries.map((i) => i.part),
        equipment,
        metrics,
        program,
        scale,
      }),
    [state, sessions, injuries, equipment, metrics, program, scale],
  );

  const { color, Icon } = LOOK[diagnosis.verdict];
  const dates = resetDates(todayKey());

  return (
    <Card title="Training state">
      <div className="flex items-start gap-2.5">
        <Icon size={18} style={{ color }} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="font-bold">{diagnosis.headline}</h3>
          <p className="text-sm text-ink-soft mt-1 leading-relaxed">{diagnosis.explanation}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-1.5 mt-3 pt-3 border-t border-line">
        {diagnosis.evidence.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ink-soft">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-right">{item.value}</dd>
          </div>
        ))}
      </dl>

      {diagnosis.reset && (
        <>
          <DisclosureButton
            open={showReset}
            onToggle={() => setShowReset(!showReset)}
            className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line text-sm font-semibold text-accent"
          >
            The seven-day reset
            <ChevronDown size={16} className={showReset ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </DisclosureButton>

          {showReset && (
            <div className="mt-3">
              <p className="text-sm text-ink-soft leading-relaxed mb-3">{diagnosis.reset.rationale}</p>
              <ol className="grid grid-cols-1 gap-2">
                {diagnosis.reset.steps.map((step, i) => (
                  <li key={step.days} className="bg-sunken rounded-xl px-3 py-2.5">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
                        {step.days}
                      </span>
                      <span className="text-[11px] text-ink-soft ml-auto">
                        from {shortLabel(dates[i] ?? dates[0]!)}
                      </span>
                    </div>
                    <div className="font-semibold text-sm">{step.title}</div>
                    <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{step.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
