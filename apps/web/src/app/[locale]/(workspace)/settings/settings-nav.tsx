'use client';

import { cn } from '@agency-os/ui/lib/utils';
import { Link, usePathname } from '@/i18n/navigation';

export function SettingsNav({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-body-sm',
              active
                ? 'border-primary text-text'
                : 'border-transparent text-text-secondary hover:text-text',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
