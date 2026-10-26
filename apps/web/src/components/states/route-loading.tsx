import { useTranslations } from 'next-intl';
import {
  SkeletonCards,
  SkeletonHeader,
  SkeletonPanel,
  SkeletonRows,
} from '@agency-os/ui/components/states/skeletons';

type RouteLoadingShape = 'list' | 'cards' | 'panel';

/** Skeleton shown by a segment's `loading.tsx` while its server data streams in. */
export function RouteLoading({ shape = 'list' }: { shape?: RouteLoadingShape }) {
  const label = useTranslations('states.loading')('title');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <SkeletonHeader label={label} actions />
      {shape === 'list' ? <SkeletonRows /> : null}
      {shape === 'cards' ? <SkeletonCards /> : null}
      {shape === 'panel' ? <SkeletonPanel /> : null}
    </div>
  );
}
