import { z } from 'zod';
import type { AcademyItemKind } from '@agency-os/db';

export const MAX_STEPS = 30;
export const MAX_GUESTS = 10;

export type ItemSource = { libraryFileId: string } | { url: string };

export type ItemInput = {
  kind: AcademyItemKind;
  title: string;
  description: string;
  /** The tutorial's or manual's material; checklists have none. */
  source: ItemSource | null;
  steps: string[];
};

export type SessionInput = {
  heldOn: string;
  title: string;
  durationMinutes: number | null;
  summary: string;
  participantIds: string[];
  guests: string[];
  materialIds: string[];
};

/** Only https links: no other scheme, and a host to go to. */
function isHttpsLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const sourceSchema = z.union([
  z.object({ libraryFileId: z.uuid() }),
  z.object({ url: z.string().trim().max(2000).refine(isHttpsLink) }),
]);

/** Blank entries are dropped before the limits apply. */
const lines = (max: number, length: number) =>
  z
    .array(z.string())
    .default([])
    .transform((values) => values.map((value) => value.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(length)).max(max));

const itemSchema = z.object({
  kind: z.enum(['tutorial', 'manual', 'checklist']),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  source: sourceSchema.nullish(),
  steps: lines(MAX_STEPS, 200),
});

/** RF-140: tutorials and manuals need their material; checklists need at least one step. */
export function itemInput(input: unknown): ItemInput | null {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return null;
  const { kind, title, description, source, steps } = parsed.data;
  if (kind === 'checklist') {
    return steps.length > 0 ? { kind, title, description, source: null, steps } : null;
  }
  return source ? { kind, title, description, source, steps: [] } : null;
}

const sessionSchema = z.object({
  heldOn: z.iso.date(),
  title: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(600).nullish(),
  summary: z.string().trim().max(2000).default(''),
  participantIds: z.array(z.uuid()).max(50).default([]),
  guests: lines(MAX_GUESTS, 80),
  materialIds: z.array(z.uuid()).max(50).default([]),
});

/** RF-141: a training session's date, people and materials. */
export function sessionInput(input: unknown): SessionInput | null {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return null;
  return { ...parsed.data, durationMinutes: parsed.data.durationMinutes ?? null };
}
