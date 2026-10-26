import { useId, type ReactNode } from 'react';

type IntegrationGroupProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function IntegrationGroup({ title, description, children }: IntegrationGroupProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-title-sm text-text">
          {title}
        </h2>
        <p className="text-body-sm text-text-secondary">{description}</p>
      </header>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
}
