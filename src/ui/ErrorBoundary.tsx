import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';
import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';

/**
 * The thing the app did not have (PLAN.md M20).
 *
 * Until this existed, one bad stored record took the whole page with it and
 * left a white screen — no nav, no way back, no clue. It was found by writing
 * a `baseline` of the wrong shape, which crashed `/find` inside
 * `finderInputFrom`; a backup restored from an older schema does the same
 * thing, and that is a climber's own data doing it to them.
 *
 * A class component because there is still no hook for this. Two sizes:
 * `RouteBoundary` keeps the shell alive when a page throws, and
 * `CardBoundary` keeps the page alive when one card throws. The second is
 * the one M20's "done when" is about — a bad record should cost one card.
 */

interface Props {
  children: ReactNode;
  /** Change this and the boundary forgets the error. Usually the location. */
  resetKey?: string;
  /** Rendered instead of the default, given the error. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** Named in the message, so a climber can say which part broke. */
  label?: string;
}

interface State {
  error: Error | null;
  resetKey: string | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  /**
   * Navigating away has to clear the error, or a page that threw once stays
   * broken for the rest of the run even after the climber fixes the record.
   * Derived rather than done in an effect: a class boundary re-renders with
   * the new key before any effect would run.
   */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Swallowing it silently is how a bug like this survives to a store
    // listing. There is nowhere to report to — the app has no network — so
    // the console is the record.
    console.error('[Project Ascent] caught by a boundary:', error, info.componentStack);
  }

  retry = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.retry);
    return <ErrorCard error={error} onRetry={this.retry} label={this.props.label} />;
  }
}

/**
 * What a climber sees instead of a white screen.
 *
 * It says what to do, and the first thing to do is get the data out: if a
 * record really is corrupt, the export is the only copy that survives a
 * reinstall. The error text is shown rather than hidden — it is the only
 * diagnostic anyone will ever have from a device I cannot see.
 */
export function ErrorCard({
  error,
  onRetry,
  label,
}: {
  error: Error;
  onRetry: () => void;
  label?: string;
}) {
  return (
    <div role="alert" className="bg-surface border border-critical rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert size={18} className="text-critical shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            {label ? `${label} could not be shown` : 'This part could not be shown'}
          </p>
          <p className="text-sm text-ink-soft mt-1 leading-relaxed">
            Something in your data is not the shape the app expected — often a backup restored
            from an older version. Your logs are still on the device and the rest of the app
            works.
          </p>
          <p className="text-xs text-ink-soft mt-2 font-mono break-words">{error.message}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
            <Link
              href="/settings"
              className="focus-ring inline-flex items-center justify-center min-h-9 px-3 rounded-xl border border-line text-sm font-semibold"
            >
              Export a backup
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A whole page failed. The shell — and so the way out — survives. */
export function RouteBoundary({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  return (
    <ErrorBoundary resetKey={resetKey} label="This page">
      {children}
    </ErrorBoundary>
  );
}

/**
 * One card failed. The rest of the page survives, which is M20's "done when".
 *
 * `resetKey` is deliberately not taken: a card boundary sits inside a route
 * boundary that already resets on navigation, and giving each card its own
 * key invites resetting on every render, which turns a crash into an
 * infinite loop of crashes.
 */
export function CardBoundary({ children, label }: { children: ReactNode; label: string }) {
  return <ErrorBoundary label={label}>{children}</ErrorBoundary>;
}
