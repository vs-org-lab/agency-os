import { useTranslations } from 'next-intl';
import { LogoTraceLoader } from '@agency-os/ui/components/logo-trace-loader';
import {
  SkeletonCards,
  SkeletonHeader,
  SkeletonPanel,
  SkeletonRows,
} from '@agency-os/ui/components/states/skeletons';

type RouteLoadingShape = 'list' | 'cards' | 'panel';

/**
 * Skeleton shown by a segment's `loading.tsx` while its server data streams in. `branded` adds the
 * studio monogram being drawn, for the client-facing portal.
 */
export function RouteLoading({
  shape = 'list',
  branded = false,
}: {
  shape?: RouteLoadingShape;
  branded?: boolean;
}) {
  const label = useTranslations('states.loading')('title');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      {branded ? <LogoTraceLoader className="self-center" /> : null}
      <SkeletonHeader label={label} actions />
      {shape === 'list' ? <SkeletonRows /> : null}
      {shape === 'cards' ? <SkeletonCards /> : null}
      {shape === 'panel' ? <SkeletonPanel /> : null}
    </div>
  );
}
