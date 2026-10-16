import type { PipelineStage } from '@/modules/commercial';

export const STAGE_PASSAGES: readonly (readonly [PipelineStage, PipelineStage])[] = [
  ['pre_sale', 'core'],
  ['core', 'orbit'],
  ['orbit', 'gravity'],
  ['gravity', 'constellation'],
];

export type ConversionRow = {
  from: PipelineStage;
  to: PipelineStage;
  entered: number;
  passed: number;
  percent: number | null;
};

/**
 * RF-131: of the deals that first entered a stage during the year, those that later entered the
 * next one. Without entries the percentage is null, never a division by zero.
 */
export function conversion(
  entries: readonly { dealId: string; stage: PipelineStage; at: string }[],
  year: number,
): ConversionRow[] {
  const first = new Map<string, string>();
  for (const entry of entries) {
    const key = `${entry.dealId}:${entry.stage}`;
    const known = first.get(key);
    if (!known || entry.at < known) first.set(key, entry.at);
  }
  return STAGE_PASSAGES.map(([from, to]) => {
    let entered = 0;
    let passed = 0;
    for (const [key, at] of first) {
      const [dealId, stage] = key.split(':');
      if (stage !== from || Number(at.slice(0, 4)) !== year) continue;
      entered += 1;
      const reached = entries.some(
        (entry) => entry.dealId === dealId && entry.stage === to && entry.at >= at,
      );
      if (reached) passed += 1;
    }
    return {
      from,
      to,
      entered,
      passed,
      percent: entered === 0 ? null : Math.round((passed / entered) * 100),
    };
  });
}
