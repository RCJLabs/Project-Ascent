import { Link } from 'wouter';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader } from '@/ui/PageHeader';

/**
 * The one page in the app with no link of any kind (PLAN.md M152).
 *
 * A 404 is reached by a stale bookmark, a shared link into a version that
 * has moved, or a typed URL — all of them cases where the climber has no
 * history to go back through and the tab bar is the only way on. The tab
 * bar is there, but a page whose whole content is *that page does not
 * exist* should say where one does.
 */
export function PlaceholderPage({
  title,
  subtitle,
  body,
}: {
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState
        action={
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-accent rounded-lg"
          >
            Go to today →
          </Link>
        }
      >
        {body}
      </EmptyState>
    </>
  );
}
