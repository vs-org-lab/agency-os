import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { OnboardingRequest } from '@/modules/diagnosis';
import { latestOnboardingSource, type OnboardingSource } from '@/modules/diagnosis/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { applicableRequests } from './domain/requests';

const { clientOnboardingResponses, libraryFolders, profiles, projects } = schema;

export const MAX_RESPONSE_LENGTH = 4000;

/** The library root that receives the client's onboarding files (ADR 0007). */
export const CLIENT_UPLOADS_FOLDER = 'Enviado pelo cliente';

export type OnboardingDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export type OnboardingItemView = {
  request: OnboardingRequest;
  done: boolean;
  response: string;
  completedAt: string | null;
  respondedByName: string | null;
};

export type ClientOnboardingView = {
  engagementId: string;
  /** Files can be sent only once the client has a project with a library. */
  canUpload: boolean;
  items: OnboardingItemView[];
};

type Reader = 'client' | 'team';

const uuid = z.uuid();
const ROOM_ROLES = sql`array['decision_maker', 'operational']::app.client_role[]`;

/** Whether the caller reads the client's onboarding, as a room member or as the room's team. */
async function readerOf(
  claims: VerifiedClaims,
  clientId: string,
  deps: OnboardingDeps,
): Promise<Reader | null> {
  if (!uuid.safeParse(clientId).success) return null;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ member: boolean; team: boolean }>(sql`
      select app.is_client_member(${clientId}::uuid, ${ROOM_ROLES}) as member,
             coalesce((select app.can_read_rooms(c.organization_id, c.id)
                       from public.clients c where c.id = ${clientId}::uuid), false) as team
    `),
  );
  if (claims.user_kind === 'client') return row?.member ? 'client' : null;
  return row?.team ? 'team' : null;
}

async function currentProjectId(tx: DbTransaction, clientId: string): Promise<string | null> {
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.clientId, clientId), ne(projects.status, 'cancelled')))
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(1);
  return project?.id ?? null;
}

async function buildView(
  tx: DbTransaction,
  source: OnboardingSource,
): Promise<ClientOnboardingView | null> {
  const requests = applicableRequests(source.guide.onboarding, source);
  if (requests.length === 0) return null;
  const responses = await tx
    .select({
      requestId: clientOnboardingResponses.requestId,
      response: clientOnboardingResponses.response,
      completedAt: clientOnboardingResponses.completedAt,
      name: profiles.fullName,
    })
    .from(clientOnboardingResponses)
    .leftJoin(profiles, eq(profiles.id, clientOnboardingResponses.respondedBy))
    .where(
      and(
        eq(clientOnboardingResponses.engagementId, source.engagementId),
        inArray(
          clientOnboardingResponses.requestId,
          requests.map((request) => request.id),
        ),
      ),
    );
  const byRequest = new Map(responses.map((row) => [row.requestId, row]));
  return {
    engagementId: source.engagementId,
    canUpload: (await currentProjectId(tx, source.clientId)) !== null,
    items: requests.map((request) => {
      const response = byRequest.get(request.id);
      return {
        request,
        done: response !== undefined,
        response: response?.response ?? '',
        completedAt: response ? response.completedAt.toISOString() : null,
        respondedByName: response?.name ?? null,
      };
    }),
  };
}

/**
 * The onboarding requests that apply to the client, with what was already answered. The client's
 * room members and the room's team read it; anyone else gets null, as when there is nothing to ask.
 */
export async function loadClientOnboarding(
  claims: VerifiedClaims,
  clientId: string,
  deps: OnboardingDeps,
): Promise<ClientOnboardingView | null> {
  if (!(await readerOf(claims, clientId, deps))) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const source = await latestOnboardingSource(tx, clientId);
    return source ? buildView(tx, source) : null;
  });
}

export type RespondResult =
  { ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' | 'response_required' };

const respondSchema = z.object({
  clientId: z.uuid(),
  requestId: z.string().min(1).max(40),
  response: z.string().max(MAX_RESPONSE_LENGTH),
});

/** The request, when it applies to the client's current engagement. */
async function applicableRequest(
  tx: DbTransaction,
  clientId: string,
  requestId: string,
): Promise<{ source: OnboardingSource; request: OnboardingRequest } | null> {
  const source = await latestOnboardingSource(tx, clientId);
  if (!source) return null;
  const request = applicableRequests(source.guide.onboarding, source).find(
    (entry) => entry.id === requestId,
  );
  return request ? { source, request } : null;
}

/**
 * The client marks a request as done, with a written answer where the request asks for one. A
 * request already answered is answered again. Only the client's room members respond.
 */
export async function respondToOnboarding(
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string; response: string },
  deps: OnboardingDeps,
): Promise<RespondResult> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const { clientId, requestId } = parsed.data;
  const response = parsed.data.response.trim();
  if (claims.preview_client || (await readerOf(claims, clientId, deps)) !== 'client') {
    return { ok: false, rule: 'not_found' };
  }

  return deps.contexts.withSystemContext(async (tx) => {
    const found = await applicableRequest(tx, clientId, requestId);
    if (!found) return { ok: false as const, rule: 'not_found' as const };
    if (found.request.kind === 'text' && response === '') {
      return { ok: false as const, rule: 'response_required' as const };
    }
    const now = (deps.now ?? (() => new Date()))();
    const [row] = await tx
      .insert(clientOnboardingResponses)
      .values({
        organizationId: found.source.organizationId,
        clientId,
        engagementId: found.source.engagementId,
        requestId,
        response,
        respondedBy: claims.sub,
        completedAt: now,
      })
      .onConflictDoUpdate({
        target: [clientOnboardingResponses.engagementId, clientOnboardingResponses.requestId],
        set: { response, respondedBy: claims.sub, completedAt: now, updatedAt: now },
      })
      .returning({ id: clientOnboardingResponses.id });
    await recordAudit(tx, {
      organizationId: found.source.organizationId,
      action: 'onboarding.responded',
      resourceType: 'client_onboarding_response',
      resourceId: row?.id ?? null,
      clientId,
      metadata: { requestId },
    });
    return { ok: true as const };
  });
}

/** The room's writers ask the client again: the answer is removed and the request reopens. */
export async function reopenOnboarding(
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string },
  deps: OnboardingDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' }> {
  if (!uuid.safeParse(input.clientId).success) return { ok: false, rule: 'not_found' };
  const [writer] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ allowed: boolean }>(sql`
      select app.can_write_rooms(c.organization_id, c.id) as allowed
      from public.clients c where c.id = ${input.clientId}::uuid
    `),
  );
  if (claims.user_kind === 'client' || !writer?.allowed) return { ok: false, rule: 'not_found' };

  return deps.contexts.withSystemContext(async (tx) => {
    const source = await latestOnboardingSource(tx, input.clientId);
    if (!source) return { ok: false as const, rule: 'not_found' as const };
    const [removed] = await tx
      .delete(clientOnboardingResponses)
      .where(
        and(
          eq(clientOnboardingResponses.engagementId, source.engagementId),
          eq(clientOnboardingResponses.requestId, input.requestId),
        ),
      )
      .returning({ id: clientOnboardingResponses.id });
    if (!removed) return { ok: false as const, rule: 'not_found' as const };
    await recordAudit(tx, {
      organizationId: source.organizationId,
      action: 'onboarding.reopened',
      resourceType: 'client_onboarding_response',
      resourceId: removed.id,
      clientId: input.clientId,
      metadata: { requestId: input.requestId },
    });
    return { ok: true as const };
  });
}

/**
 * The library root of the client's current project that receives onboarding files, created the
 * first time and visible to the client. Null when the request is not an upload that applies, or
 * when the client has no project yet.
 */
export async function onboardingUploadFolder(
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string },
  deps: OnboardingDeps,
): Promise<string | null> {
  if (claims.preview_client || (await readerOf(claims, input.clientId, deps)) !== 'client') {
    return null;
  }
  return deps.contexts.withSystemContext(async (tx) => {
    const found = await applicableRequest(tx, input.clientId, input.requestId);
    if (!found || found.request.kind !== 'upload') return null;
    const projectId = await currentProjectId(tx, input.clientId);
    if (!projectId) return null;

    const [existing] = await tx
      .select({ id: libraryFolders.id })
      .from(libraryFolders)
      .where(
        and(
          eq(libraryFolders.projectId, projectId),
          isNull(libraryFolders.parentId),
          eq(libraryFolders.clientUploads, true),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    const taken = new Set(
      (
        await tx
          .select({ name: libraryFolders.name })
          .from(libraryFolders)
          .where(and(eq(libraryFolders.projectId, projectId), isNull(libraryFolders.parentId)))
      ).map((row) => row.name.toLocaleLowerCase()),
    );
    let name = CLIENT_UPLOADS_FOLDER;
    for (let suffix = 2; taken.has(name.toLocaleLowerCase()); suffix += 1) {
      name = `${CLIENT_UPLOADS_FOLDER} (${suffix})`;
    }
    const id = crypto.randomUUID();
    await tx.insert(libraryFolders).values({
      id,
      organizationId: found.source.organizationId,
      clientId: input.clientId,
      projectId,
      parentId: null,
      rootId: id,
      depth: 0,
      name,
      visibility: 'client',
      clientUploads: true,
      createdBy: claims.sub,
    });
    await recordAudit(tx, {
      organizationId: found.source.organizationId,
      action: 'library.folder_created',
      resourceType: 'library_folder',
      resourceId: id,
      clientId: input.clientId,
      metadata: { clientUploads: true },
    });
    return id;
  });
}
