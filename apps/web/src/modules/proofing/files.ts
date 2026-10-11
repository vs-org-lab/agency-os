import { and, eq, max, sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { schema, type ProofKind } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { fitsStorage } from '@/modules/library/server';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { withdrawOlderRequests } from './approvals';
import { detectProofType } from './domain/file-type';
import { MAX_PROOF_BYTES, PROOF_LINK_TTL_SECONDS, proofPath, type ProofStorage } from './storage';

const { proofFiles, proofVersions, projects } = schema;

export type ProofingDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: ProofStorage;
  now?: () => Date;
};

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
const uuid = z.uuid();
const titleSchema = z.string().trim().min(1).max(200);

type ProjectScope = { organizationId: string; clientId: string; projectId: string };

/** The project when the caller may write in its room (founder or the client's manager). */
async function writableProject(
  claims: VerifiedClaims,
  projectId: string,
  deps: ProofingDeps,
): Promise<(ProjectScope & { actorId: string }) | null> {
  if (!uuid.safeParse(projectId).success) return null;
  const [project] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ organizationId: projects.organizationId, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId)),
  );
  if (!project) return null;
  const actor = await roomActor(deps.contexts, claims, project.clientId, 'write');
  if (!actor || actor.organizationId !== project.organizationId) return null;
  return { ...project, projectId, actorId: actor.userId };
}

async function newVersion(
  deps: ProofingDeps,
  scope: ProjectScope & { actorId: string },
  fileId: string,
): Promise<{ versionId: string; uploadUrl: string }> {
  const versionId = await deps.contexts.withSystemContext(async (tx) => {
    const [latest] = await tx
      .select({ number: max(proofVersions.number) })
      .from(proofVersions)
      .where(eq(proofVersions.fileId, fileId));
    const number = (latest?.number ?? 0) + 1;
    const [version] = await tx
      .insert(proofVersions)
      .values({
        organizationId: scope.organizationId,
        clientId: scope.clientId,
        projectId: scope.projectId,
        fileId,
        number,
        storagePath: 'pending',
        uploadedBy: scope.actorId,
      })
      .returning({ id: proofVersions.id });
    if (!version) throw new Error('Proof version was not created');
    await tx
      .update(proofVersions)
      .set({ storagePath: proofPath({ ...scope, fileId, versionId: version.id }) })
      .where(eq(proofVersions.id, version.id));
    return version.id;
  });
  return {
    versionId,
    uploadUrl: await deps.storage.createUploadUrl(proofPath({ ...scope, fileId, versionId })),
  };
}

/** A new deliverable in the project with its first version awaiting upload. */
export async function createProofFile(
  claims: VerifiedClaims,
  input: { projectId: string; phaseId?: string | null; title: string },
  deps: ProofingDeps,
): Promise<
  | { ok: true; fileId: string; versionId: string; uploadUrl: string }
  | NotFound
  | { ok: false; rule: 'invalid_input' }
> {
  const scope = await writableProject(claims, input.projectId, deps);
  if (!scope) return NOT_FOUND;
  const title = titleSchema.safeParse(input.title);
  if (!title.success) return { ok: false, rule: 'invalid_input' };
  if (input.phaseId && !uuid.safeParse(input.phaseId).success) {
    return { ok: false, rule: 'invalid_input' };
  }
  const fileId = await deps.contexts.withSystemContext(async (tx) => {
    const [file] = await tx
      .insert(proofFiles)
      .values({
        organizationId: scope.organizationId,
        clientId: scope.clientId,
        projectId: scope.projectId,
        phaseId: input.phaseId ?? null,
        title: title.data,
        createdBy: scope.actorId,
      })
      .returning({ id: proofFiles.id });
    if (!file) throw new Error('Proof file was not created');
    await recordAudit(tx, {
      organizationId: scope.organizationId,
      action: 'proof.created',
      resourceType: 'proof_file',
      resourceId: file.id,
      clientId: scope.clientId,
    });
    return file.id;
  });
  const version = await newVersion(deps, scope, fileId);
  return { ok: true, fileId, ...version };
}

export async function addProofVersion(
  claims: VerifiedClaims,
  input: { fileId: string },
  deps: ProofingDeps,
): Promise<{ ok: true; versionId: string; uploadUrl: string } | NotFound> {
  if (!uuid.safeParse(input.fileId).success) return NOT_FOUND;
  const [file] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ projectId: proofFiles.projectId, archivedAt: proofFiles.archivedAt })
      .from(proofFiles)
      .where(eq(proofFiles.id, input.fileId)),
  );
  if (!file || file.archivedAt) return NOT_FOUND;
  const scope = await writableProject(claims, file.projectId, deps);
  if (!scope) return NOT_FOUND;
  return { ok: true, ...(await newVersion(deps, scope, input.fileId)) };
}

async function pdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    return null;
  }
}

/**
 * Checks the uploaded bytes (SEC-30): the real type from the first bytes, the size and, for a
 * PDF, that it opens. A file that fails is removed and its version rejected.
 */
export async function confirmProofVersion(
  claims: VerifiedClaims,
  input: { versionId: string },
  deps: ProofingDeps,
): Promise<
  { ok: true; kind: ProofKind } | NotFound | { ok: false; rule: 'invalid_file' | 'storage_full' }
> {
  if (!uuid.safeParse(input.versionId).success) return NOT_FOUND;
  const [version] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        projectId: proofVersions.projectId,
        storagePath: proofVersions.storagePath,
        status: proofVersions.status,
        fileId: proofVersions.fileId,
      })
      .from(proofVersions)
      .where(eq(proofVersions.id, input.versionId)),
  );
  if (!version || version.status !== 'uploading') return NOT_FOUND;
  const scope = await writableProject(claims, version.projectId, deps);
  if (!scope) return NOT_FOUND;

  const bytes = await deps.storage.download(version.storagePath);
  const detected = bytes && bytes.length <= MAX_PROOF_BYTES ? detectProofType(bytes) : null;
  const pages = detected?.kind === 'pdf' && bytes ? await pdfPages(bytes) : null;
  if (!bytes || !detected || (detected.kind === 'pdf' && pages === null)) {
    if (bytes) await deps.storage.remove(version.storagePath);
    await deps.contexts.withSystemContext(async (tx) => {
      await tx
        .update(proofVersions)
        .set({ status: 'rejected' })
        .where(eq(proofVersions.id, input.versionId));
      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'proof.version_rejected',
        resourceType: 'proof_version',
        resourceId: input.versionId,
        clientId: scope.clientId,
      });
    });
    return { ok: false, rule: 'invalid_file' };
  }
  const stored = await deps.contexts.withSystemContext(async (tx) => {
    if (!(await fitsStorage(tx, scope.organizationId, bytes.length))) {
      await tx
        .update(proofVersions)
        .set({ status: 'rejected' })
        .where(eq(proofVersions.id, input.versionId));
      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'proof.version_rejected',
        resourceType: 'proof_version',
        resourceId: input.versionId,
        clientId: scope.clientId,
        metadata: { reason: 'storage_full' },
      });
      return false;
    }
    await tx
      .update(proofVersions)
      .set({
        status: 'ready',
        kind: detected.kind,
        mimeType: detected.mimeType,
        sizeBytes: bytes.length,
        pages,
      })
      .where(and(eq(proofVersions.id, input.versionId), eq(proofVersions.status, 'uploading')));
    await withdrawOlderRequests(tx, version.fileId, input.versionId);
    return true;
  });
  if (!stored) {
    await deps.storage.remove(version.storagePath);
    return { ok: false, rule: 'storage_full' };
  }
  return { ok: true, kind: detected.kind };
}

/**
 * A 15-minute link to a version for whoever may read it: the room team under row level security,
 * or the client through the portal view (only versions sent for approval).
 */
export async function proofFileUrl(
  claims: VerifiedClaims,
  versionId: string,
  deps: ProofingDeps,
): Promise<string | null> {
  if (!uuid.safeParse(versionId).success) return null;
  const readable = await deps.contexts.withUserContext(claims, async (tx) => {
    const [staff] = await tx
      .select({ id: proofVersions.id })
      .from(proofVersions)
      .where(and(eq(proofVersions.id, versionId), eq(proofVersions.status, 'ready')));
    if (staff) return true;
    const rows = await tx.execute<{ id: string }>(
      sql`select id from public.portal_proof_versions where id = ${versionId}::uuid`,
    );
    return rows.length > 0;
  });
  if (!readable) return null;
  const [version] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ storagePath: proofVersions.storagePath })
      .from(proofVersions)
      .where(eq(proofVersions.id, versionId)),
  );
  return version ? deps.storage.signedUrl(version.storagePath, PROOF_LINK_TTL_SECONDS) : null;
}
