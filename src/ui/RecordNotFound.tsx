import { Link } from 'wouter';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

/**
 * One shape for a record that is not there (PLAN.md M41).
 *
 * Eleven routes take a parameter and five different things happened when it
 * named nothing. Two rendered a bare `<Card>` with **no `h1` at all**, so a
 * screen reader landing on `/projects/<deleted>` found no heading naming
 * where it was. Three navigated silently to the index — `/objectives/<gone>`
 * to Objectives, `/injury/<gone>` to *Settings* — which destroys the only
 * evidence of what went wrong: a stale bookmark or a shared link becomes an
 * ordinary index page, and the reader concludes they mis-tapped.
 *
 * So: never redirect, always a heading, and the heading is the same words as
 * the app's global 404 so there is exactly one "Not found" in the app. What
 * the record was goes in the sentence underneath, along with the way back.
 */
export function RecordNotFound({
  /** The record, as the sentence's subject: 'That project', 'That guide'. */
  what,
  backTo,
  backLabel,
  /** Anything worth adding — why it might be gone, what to do instead. */
  children,
}: {
  what: string;
  backTo: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Not found" />
      <EmptyState
        action={
          <Link href={backTo} className="text-sm font-semibold text-accent">
            {backLabel}
          </Link>
        }
      >
        {what} is not here. {children}
      </EmptyState>
    </>
  );
}
