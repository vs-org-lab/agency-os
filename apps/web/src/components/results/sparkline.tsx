'use client';

import { m, transitions } from '@agency-os/ui/motion';

const WIDTH = 200;
const HEIGHT = 36;

/** The last months of an indicator as a small line; drawn once when it appears. */
export function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return <span aria-hidden className="block h-9" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * WIDTH;
    const y = HEIGHT - 4 - ((value - min) / span) * (HEIGHT - 8);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${points.join(' L')}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-9 w-full text-text"
    >
      <path d={`${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT}Z`} fill="currentColor" opacity={0.08} />
      <m.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ ...transitions.slow, duration: 0.7 }}
      />
    </svg>
  );
}
