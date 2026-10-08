'use server';

import { revalidatePath } from 'next/cache';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { isPipelineCode } from '@/modules/commercial';
import { commercialSession, moveDeal } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import type { MoveResult } from './board';

const inputSchema = z.object({
  dealId: z.uuid(),
  to: z.string().refine(isPipelineCode),
  reason: z.string().trim().max(500).nullable(),
});

export async function moveDealAction(input: {
  dealId: string;
  to: string;
  reason: string | null;
}): Promise<MoveResult> {
  const t = await getTranslations('commercial.pipeline');
  const parsed = inputSchema.safeParse(input);
  const session = await commercialSession(await getVerifiedClaims());
  if (!parsed.success || !session || !isPipelineCode(parsed.data.to)) {
    return { ok: false, message: t('rules.not_found') };
  }

  const result = await moveDeal(session, {
    dealId: parsed.data.dealId,
    to: parsed.data.to,
    reason: parsed.data.reason,
  });
  if (result.ok) {
    revalidatePath('/pipeline');
    return { ok: true };
  }
  if (result.rule === 'module_pending' && 'module' in result && result.module) {
    return {
      ok: false,
      message: t('rules.module_pending', { module: t(`modules.${result.module}`) }),
    };
  }
  if (result.rule === 'core_criteria' && 'gaps' in result && result.gaps) {
    const format = await getFormatter();
    return {
      ok: false,
      message: t('rules.core_criteria', {
        gaps: format.list(result.gaps.map((gap) => t(`gaps.${gap}`))),
      }),
    };
  }
  return { ok: false, message: t(`rules.${result.rule}`) };
}
