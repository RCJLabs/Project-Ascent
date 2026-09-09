import { Link, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { parentOf } from './routes';

/**
 * The way back, derived rather than written out.
 *
 * Twenty-one pages each carried their own
 * `<Link href="/train"><ArrowLeft /> Train</Link>` with the same class
 * string copied alongside it. That is twenty-one chances for a page to
 * point somewhere it should not — and it did happen: the guides pointed at
 * Settings, which is one of three ways in and not the one most people take.
 *
 * The hierarchy lives in `routes.ts` now, so a page's parent is a fact
 * about the app rather than a string in a component.
 */
export function BackLink({ href, title }: { href?: string; title?: string }) {
  const [location] = useLocation();
  const derived = parentOf(location);
  const target = href ?? derived?.href;
  const label = title ?? derived?.title;
  if (target === undefined || label === undefined) return null;

  return (
    <Link
      href={target}
      className="focus-ring inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5 rounded-lg"
    >
      <ArrowLeft size={15} aria-hidden /> {label}
    </Link>
  );
}
