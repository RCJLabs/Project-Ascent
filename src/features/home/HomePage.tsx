import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

export function HomePage() {
  return (
    <>
      <PageHeader title="Project Ascent" subtitle="Train. Understand. Grow." />
      <div className="grid gap-3">
        <Card>
          <p className="text-sm leading-relaxed">
            The foundation build (M0). The shell is installable, works offline, and your data
            lives on this device — nothing leaves it. Programs and logging arrive in the next
            milestones.
          </p>
        </Card>
        <Card title="On the roadmap">
          <ul className="text-sm text-ink-soft space-y-2">
            <li><span className="font-semibold text-ink">M1</span> — the full program catalog and drill library</li>
            <li><span className="font-semibold text-ink">M2</span> — program finder, planning, and session logging</li>
            <li><span className="font-semibold text-ink">M3</span> — progress graphs, load management, projects</li>
            <li><span className="font-semibold text-ink">M4</span> — your climber: stats, avatar, altimeter, skill trees</li>
            <li><span className="font-semibold text-ink">M5</span> — The Ascent rest-day arcade</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
