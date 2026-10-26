import { cn } from '@agency-os/ui/lib/utils';

const TONES = [
  'bg-neutral-bg text-neutral',
  'bg-info-bg text-info',
  'bg-success-bg text-success',
  'bg-warning-bg text-warning',
  'bg-danger-bg text-danger',
  'bg-surface-muted text-text-secondary',
] as const;

const SIZES = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const;

function toneIndex(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % TONES.length;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return picked
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

type ClientAvatarProps = {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  /** Neutral colouring for people, so a person never reads as a client status. */
  tone?: 'hash' | 'neutral';
  className?: string;
};

/** Initials on a status-background tone picked from a stable hash of the id; never uses the gold token. */
function ClientAvatar({
  id,
  name,
  size = 'md',
  tone: mode = 'hash',
  className,
}: ClientAvatarProps) {
  const tone = mode === 'neutral' ? 5 : toneIndex(id);

  return (
    <span
      data-slot="client-avatar"
      data-tone={tone}
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none',
        SIZES[size],
        TONES[tone],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export { ClientAvatar };
