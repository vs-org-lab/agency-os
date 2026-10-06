import { Skeleton } from '@agency-os/ui/components/skeleton';
import { cn } from '@agency-os/ui/lib/utils';

export function LoadingState({ title, className }: { title: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col gap-3 py-6', className)}>
      <span className="sr-only">{title}</span>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
