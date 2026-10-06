import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { hubContent } from '../content';

export default function BrandHubPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <EmptyState
        className="w-full max-w-[480px]"
        title={hubContent.emptyTitle}
        description={hubContent.emptyDescription}
      />
    </main>
  );
}
