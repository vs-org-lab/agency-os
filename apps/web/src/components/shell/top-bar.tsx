import { ChevronRight } from 'lucide-react';
import { SidebarTrigger } from '@agency-os/ui/components/sidebar';

export function TopBar({
  trail,
  toggleLabel,
  breadcrumbLabel,
}: {
  trail: string[];
  toggleLabel: string;
  breadcrumbLabel: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-border bg-canvas/95 px-4 backdrop-blur-sm md:px-6">
      <SidebarTrigger label={toggleLabel} className="-ml-1 text-text-secondary" />
      <nav aria-label={breadcrumbLabel} className="min-w-0">
        <ol className="flex items-center gap-1.5 text-body-sm text-text-secondary">
          {trail.map((segment, index) => (
            <li key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
              <span
                className={
                  index === trail.length - 1 ? 'truncate font-medium text-text' : 'truncate'
                }
                aria-current={index === trail.length - 1 ? 'page' : undefined}
              >
                {segment}
              </span>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}
