import { z } from 'zod';
import type { RetainerLimitKind } from '@/modules/retainers';
import type { ReportKind } from './periods';

export const TEXT_MAX = 2000;
const UPDATE_TITLE_MAX = 120;

/** What the report shows from the period, frozen when it is shared. */
export type ReportData = {
  steps: { name: string; on: string }[];
  updates: { title: string; on: string }[];
  approvals: { title: string; on: string }[];
  retainer:
    | { month: string; limits: { kind: RetainerLimitKind; used: number; available: number }[] }[]
    | null;
  outcome: {
    metric: string;
    baseline: string;
    target: string;
    deadline: string;
    measurements: { on: string; value: string }[];
  } | null;
};

export type ReportTexts = {
  summary: string;
  highlights: string;
  nextSteps: string;
  priorities: string;
};

const text = z.string().trim().max(TEXT_MAX).default('');
const textsSchema = z.object({
  summary: text,
  highlights: text,
  nextSteps: text,
  priorities: text,
});

/** The team's texts; the priorities belong to the QBR only. */
export function reportTexts(kind: ReportKind, input: unknown): ReportTexts | null {
  const parsed = textsSchema.safeParse(input);
  if (!parsed.success) return null;
  return { ...parsed.data, priorities: kind === 'qbr' ? parsed.data.priorities : '' };
}

/** An update's line in the report: its milestone, or the start of its body cut at a word. */
export function updateTitle(update: { milestone: string | null; body: string }): string {
  const milestone = update.milestone?.trim();
  if (milestone) return milestone;
  const body = update.body.replace(/\s+/g, ' ').trim();
  if (body.length <= UPDATE_TITLE_MAX) return body;
  const cut = body.slice(0, UPDATE_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
