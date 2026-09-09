import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Dumbbell, Mountain, Settings, TrendingUp } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Mountain },
  { href: '/train', label: 'Train', icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto">
      <main className="flex-1 px-4 pt-6 pb-24">{children}</main>
      <nav
        className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  active ? 'text-accent' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
