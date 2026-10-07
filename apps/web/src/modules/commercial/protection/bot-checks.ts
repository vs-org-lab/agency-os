export type BotVerdict = 'human' | 'honeypot' | 'too_fast';

export const MINIMUM_FILL_MS = 3000;

export function assessSubmission(input: {
  honeypot: string;
  startedAt: number;
  now: Date;
}): BotVerdict {
  if (input.honeypot.trim() !== '') return 'honeypot';
  const elapsed = input.now.getTime() - input.startedAt;
  if (!Number.isFinite(elapsed) || elapsed < MINIMUM_FILL_MS) return 'too_fast';
  return 'human';
}
