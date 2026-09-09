import type { ReactNode } from 'react';
import { Card } from './Card';

/**
 * The "nothing here yet" card.
 *
 * Every page had written its own, which is why they varied from one line of
 * grey text to three paragraphs. The shape is fixed here; the words are
 * still the page's own, because what to say when a climber has no projects
 * is not the same as when they have no objectives.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card {...(title === undefined ? {} : { title })}>
      <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
      {action !== undefined && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
    </Card>
  );
}
