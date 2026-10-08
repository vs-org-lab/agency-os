import { randomUUID } from 'node:crypto';
import { and, count, eq, max, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type CoreLevel,
  type DbTransaction,
  type FindingOwner,
  type OrbitFront,
  type RoadmapLane,
} from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { scopedEngagement } from './authorization';
import { proposeLane } from './domain/lanes';
import { EVIDENCE_URL_TTL_SECONDS, type EvidenceStorage } from './evidence/port';
import { detectEvidenceType, EVIDENCE_EXTENSIONS, MAX_EVIDENCE_BYTES } from './evidence/validate';

const { coreFindings } = schema;

export const MAX_FINDINGS_FOR_CALL = 3;

export type FindingEvidenceInput =
  | { kind: 'link' | 'number' | 'page'; value: string; note?: string }
  | { kind: 'file'; bytes: Uint8Array; note?: string };

export type FindingInput = {
  engagementId: string;
  findingId?: string;
  front: OrbitFront;
  title: string;
  description: string;
  evidence: FindingEvidenceInput | null;
  impact: CoreLevel;
  effort: CoreLevel;
  lane?: RoadmapLane;
  owner: FindingOwner;
  bringToCall: boolean;
};

export type FindingDeps = {
  contexts: Pick<DbContexts, 'withUserContext'>;
  storage: EvidenceStorage;
};

export type SaveFindingResult =
  | { ok: true; findingId: string }
  | {
      ok: false;
      rule: 'not_found' | 'invalid_input' | 'file_type' | 'file_too_large' | 'call_limit';
    };

const level = z.enum(['low', 'medium', 'high']);

const baseSchema = z.object({
  engagementId: z.uuid(),
  findingId: z.uuid().optional(),
  front: z.enum(['core', 'orbit', 'gravity', 'constellation']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  impact: level,
  effort: level,
  lane: z.enum(['days_30', 'days_90', 'months_12']).optional(),
  owner: z.enum(['internal', 'aurion']),
  bringToCall: z.boolean(),
});

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  });

type PreparedEvidence =
  | { kind: null }
  | { kind: 'link' | 'number' | 'page'; value: string; note: string | null }
  | {
      kind: 'file';
      bytes: Uint8Array;
      contentType: string;
      extension: string;
      note: string | null;
    };

function prepareEvidence(
  evidence: FindingEvidenceInput | null,
): PreparedEvidence | 'invalid_input' | 'file_type' | 'file_too_large' {
  if (!evidence) return { kind: null };
  const note = evidence.note?.trim() ? evidence.note.trim().slice(0, 500) : null;
  if (evidence.kind === 'file') {
    if (evidence.bytes.byteLength > MAX_EVIDENCE_BYTES) return 'file_too_large';
    const contentType = detectEvidenceType(evidence.bytes);
    if (!contentType) return 'file_type';
    return {
      kind: 'file',
      bytes: evidence.bytes,
      contentType,
      extension: EVIDENCE_EXTENSIONS[contentType],
      note,
    };
  }
  if (evidence.kind === 'link') {
    const parsed = httpsUrl.safeParse(evidence.value);
    return parsed.success ? { kind: 'link', value: parsed.data, note } : 'invalid_input';
  }
  const value = evidence.value.trim();
  if (value === '' || value.length > 500) return 'invalid_input';
  return { kind: evidence.kind, value, note };
}

export async function saveFinding(
  claims: VerifiedClaims,
  input: FindingInput,
  deps: FindingDeps,
): Promise<SaveFindingResult> {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const evidence = prepareEvidence(input.evidence);
  if (typeof evidence === 'string') return { ok: false, rule: evidence };
  const data = parsed.data;
  let uploadedPath: string | null = null;

  try {
    const result = await withActor<SaveFindingResult & { replacedPath?: string | null }>(
      deps.contexts,
      claims,
      async (tx, actor) => {
        const scope = await scopedEngagement(tx, actor, data.engagementId, 'write');
        if (!scope) return { ok: false, rule: 'not_found' };

        let previous: { evidencePath: string | null } | undefined;
        if (data.findingId) {
          [previous] = await tx
            .select({ evidencePath: coreFindings.evidencePath })
            .from(coreFindings)
            .where(
              and(
                eq(coreFindings.id, data.findingId),
                eq(coreFindings.engagementId, data.engagementId),
              ),
            );
          if (!previous) return { ok: false, rule: 'not_found' };
        }

        if (data.bringToCall) {
          const [selected] = await tx
            .select({ total: count() })
            .from(coreFindings)
            .where(
              and(
                eq(coreFindings.engagementId, data.engagementId),
                eq(coreFindings.bringToCall, true),
                data.findingId ? ne(coreFindings.id, data.findingId) : undefined,
              ),
            );
          if ((selected?.total ?? 0) >= MAX_FINDINGS_FOR_CALL) {
            return { ok: false, rule: 'call_limit' };
          }
        }

        let evidenceColumns: {
          evidenceKind: 'file' | 'link' | 'number' | 'page' | null;
          evidencePath: string | null;
          evidenceValue: string | null;
          evidenceNote: string | null;
        };
        if (evidence.kind === 'file') {
          uploadedPath = `${scope.organizationId}/${scope.clientId}/${scope.engagementId}/${randomUUID()}.${evidence.extension}`;
          await deps.storage.upload(uploadedPath, evidence.bytes, evidence.contentType);
          evidenceColumns = {
            evidenceKind: 'file',
            evidencePath: uploadedPath,
            evidenceValue: null,
            evidenceNote: evidence.note,
          };
        } else if (evidence.kind === null) {
          evidenceColumns = {
            evidenceKind: null,
            evidencePath: null,
            evidenceValue: null,
            evidenceNote: null,
          };
        } else {
          evidenceColumns = {
            evidenceKind: evidence.kind,
            evidencePath: null,
            evidenceValue: evidence.value,
            evidenceNote: evidence.note,
          };
        }

        const values = {
          front: data.front,
          title: data.title,
          description: data.description,
          impact: data.impact,
          effort: data.effort,
          lane: data.lane ?? proposeLane(data.impact, data.effort),
          owner: data.owner,
          bringToCall: data.bringToCall,
          ...evidenceColumns,
        };

        let findingId = data.findingId;
        if (findingId) {
          await tx.update(coreFindings).set(values).where(eq(coreFindings.id, findingId));
        } else {
          const [last] = await tx
            .select({ position: max(coreFindings.position) })
            .from(coreFindings)
            .where(eq(coreFindings.engagementId, data.engagementId));
          const [created] = await tx
            .insert(coreFindings)
            .values({
              organizationId: scope.organizationId,
              clientId: scope.clientId,
              engagementId: data.engagementId,
              position: (last?.position ?? -1) + 1,
              authorId: actor.userId,
              ...values,
            })
            .returning({ id: coreFindings.id });
          if (!created) throw new Error('Finding was not recorded');
          findingId = created.id;
        }

        await recordAudit(tx, {
          organizationId: scope.organizationId,
          action: 'core.finding.saved',
          resourceType: 'core_finding',
          resourceId: findingId,
          clientId: scope.clientId,
          metadata: { front: data.front, evidence: evidenceColumns.evidenceKind },
        });
        const replacedPath =
          previous?.evidencePath && previous.evidencePath !== evidenceColumns.evidencePath
            ? previous.evidencePath
            : null;
        return { ok: true, findingId, replacedPath };
      },
      { ok: false, rule: 'not_found' },
    );

    if (!result.ok) {
      if (uploadedPath) await deps.storage.remove(uploadedPath).catch(() => undefined);
      return { ok: false, rule: result.rule };
    }
    if (result.replacedPath) await deps.storage.remove(result.replacedPath).catch(() => undefined);
    return { ok: true, findingId: result.findingId };
  } catch (error) {
    if (uploadedPath) await deps.storage.remove(uploadedPath).catch(() => undefined);
    throw error;
  }
}

async function findingScope(
  claims: VerifiedClaims,
  findingId: string,
  action: 'read' | 'write',
  deps: Pick<FindingDeps, 'contexts'>,
  then: (
    tx: DbTransaction,
    finding: { id: string; evidencePath: string | null; organizationId: string; clientId: string },
  ) => Promise<void>,
): Promise<{ id: string; evidencePath: string | null } | null> {
  if (!z.uuid().safeParse(findingId).success) return null;
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [finding] = await tx
        .select({
          id: coreFindings.id,
          engagementId: coreFindings.engagementId,
          evidencePath: coreFindings.evidencePath,
        })
        .from(coreFindings)
        .where(eq(coreFindings.id, findingId));
      if (!finding) return null;
      const scope = await scopedEngagement(tx, actor, finding.engagementId, action);
      if (!scope) return null;
      await then(tx, {
        id: finding.id,
        evidencePath: finding.evidencePath,
        organizationId: scope.organizationId,
        clientId: scope.clientId,
      });
      return { id: finding.id, evidencePath: finding.evidencePath };
    },
    null,
  );
}

export async function removeFinding(
  claims: VerifiedClaims,
  input: { findingId: string },
  deps: FindingDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' }> {
  const removed = await findingScope(
    claims,
    input.findingId,
    'write',
    deps,
    async (tx, finding) => {
      await tx.delete(coreFindings).where(eq(coreFindings.id, finding.id));
      await recordAudit(tx, {
        organizationId: finding.organizationId,
        action: 'core.finding.removed',
        resourceType: 'core_finding',
        resourceId: finding.id,
        clientId: finding.clientId,
        metadata: {},
      });
    },
  );
  if (!removed) return { ok: false, rule: 'not_found' };
  if (removed.evidencePath) await deps.storage.remove(removed.evidencePath).catch(() => undefined);
  return { ok: true };
}

export async function evidenceUrl(
  claims: VerifiedClaims,
  input: { findingId: string },
  deps: FindingDeps,
): Promise<string | null> {
  const finding = await findingScope(claims, input.findingId, 'read', deps, async () => undefined);
  if (!finding?.evidencePath) return null;
  return deps.storage.signedUrl(finding.evidencePath, EVIDENCE_URL_TTL_SECONDS);
}
