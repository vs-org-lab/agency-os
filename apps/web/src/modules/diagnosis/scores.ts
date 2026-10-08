import { z } from 'zod';
import { schema } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { scopedEngagement } from './authorization';
import { getTemplateById } from './templates/service';

const { coreScores } = schema;

const scoresSchema = z.object({
  engagementId: z.uuid(),
  scores: z
    .array(
      z.object({
        front: z.enum(['core', 'orbit', 'gravity', 'constellation']),
        criterionId: z.string().min(1).max(40),
        points: z.number().int().min(0),
        justification: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(100),
});

export type ScoreInput = z.input<typeof scoresSchema>;

export function saveScores(
  claims: VerifiedClaims,
  input: ScoreInput,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = scoresSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, rule: 'invalid_input' });
  const { engagementId, scores } = parsed.data;

  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, engagementId, 'write');
      if (!scope) return { ok: false as const, rule: 'not_found' as const };
      const grid = await getTemplateById(tx, scope.gridTemplateId, 'orbit_grid');
      const valid = scores.every((score) => {
        const criterion = grid.fronts
          .find((front) => front.front === score.front)
          ?.criteria.find((entry) => entry.id === score.criterionId);
        return criterion !== undefined && score.points <= criterion.maxPoints;
      });
      if (!valid) return { ok: false as const, rule: 'invalid_input' as const };

      for (const score of scores) {
        await tx
          .insert(coreScores)
          .values({
            organizationId: scope.organizationId,
            clientId: scope.clientId,
            engagementId,
            front: score.front,
            criterionId: score.criterionId,
            points: score.points,
            justification: score.justification,
            updatedBy: actor.userId,
          })
          .onConflictDoUpdate({
            target: [coreScores.engagementId, coreScores.front, coreScores.criterionId],
            set: {
              points: score.points,
              justification: score.justification,
              updatedBy: actor.userId,
              updatedAt: new Date(),
            },
          });
      }
      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'core.scores.saved',
        resourceType: 'core_engagement',
        resourceId: engagementId,
        clientId: scope.clientId,
        metadata: { criteria: scores.length },
      });
      return { ok: true as const };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}
