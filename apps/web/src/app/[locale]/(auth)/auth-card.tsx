import type { ReactNode } from 'react';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="w-full rounded-lg border border-border bg-surface p-6 md:p-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-title text-text">{title}</h1>
        {description ? <p className="text-body text-text-secondary">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
