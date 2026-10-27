'use client';

import { cn } from '@agency-os/ui/lib/utils';
import { AnimatedNumber } from '@agency-os/ui/components/animated-number';

type AllowanceRingProps = {
  used: number;
  limit: number;
  locale: string;
  label: string;
  remainingLabel: (remaining: string) => string;
  usedLabel: (used: string, limit: string) => string;
  size?: 40 | 56;
  /** Neutral rings show progress that is not a consumption limit, so they never warn. */
  neutral?: boolean;
  className?: string;
};

type Tone = 'accent' | 'warning' | 'danger' | 'neutral';

function toneFor(used: number, limit: number): Tone {
  if (used > limit) return 'danger';
  if (limit > 0 && used / limit >= 0.8) return 'warning';
  return 'accent';
}

const STROKE: Record<Tone, string> = {
  accent: 'stroke-brand',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
  neutral: 'stroke-neutral',
};

/** Circular consumption indicator: remaining is never negative and an over-limit ring is full. */
function AllowanceRing({
  used,
  limit,
  locale,
  label,
  remainingLabel,
  usedLabel,
  size = 56,
  neutral = false,
  className,
}: AllowanceRingProps) {
  const format = new Intl.NumberFormat(locale);
  const remaining = Math.max(limit - used, 0);
  const tone = neutral ? 'neutral' : toneFor(used, limit);
  const fraction = limit > 0 ? Math.min(used / limit, 1) : used > 0 ? 1 : 0;
  const strokeWidth = size === 56 ? 5 : 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      data-slot="allowance-ring"
      data-tone={tone}
      role="group"
      aria-label={label}
      className={cn('flex items-center gap-3', className)}
    >
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          className="absolute inset-0"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={cn('transition-[stroke-dashoffset] duration-300', STROKE[tone])}
          />
        </svg>
        <AnimatedNumber
          value={remaining}
          locale={locale}
          className={cn('relative font-medium text-text', size === 56 ? 'text-sm' : 'text-xs')}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="text-sm text-text">{remainingLabel(format.format(remaining))}</span>
        <span className="text-xs text-text-secondary">
          {usedLabel(format.format(used), format.format(limit))}
        </span>
      </div>
    </div>
  );
}

export { AllowanceRing };
