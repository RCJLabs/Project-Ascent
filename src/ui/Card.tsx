import type { ReactNode } from 'react';

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-surface border border-line rounded-2xl p-4 ${className}`}>
      {title && (
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-3">{title}</h2>
      )}
      {children}
    </section>
  );
}
