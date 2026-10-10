import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ApprovalStatus, type DbTransaction, type ProofKind } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import type { ProofAnchor } from './domain/anchors';
import { roundsStatus, type RoundsStatus } from './domain/rounds';
import type { ProofingDeps } from './files';

const { approvals, profiles, projects, proofComments, proofFiles, proofVersions } = schema;
const uuid = z.uuid();

export type ProofApprovalView = {
  id: string;
  status: ApprovalStatus;
  comment: string | null;
  decidedAt: string | null;
  extraRound: boolean;
};

export type ProofVersionSummary = {
  id: string;
  number: number;
  kind: ProofKind | null;
  status: 'uploading' | 'ready' | 'rejected';
  createdAt: string;
  approval: ProofApprovalView | null;
  openComments: number;
};

export type ProofFileView = {
  id: string;
  title: string;
  phaseId: string | null;
  versions: ProofVersionSummary[];
};

export type ProofCommentView = {
  id: string;
  number: number | null;
  body: string;
  anchor: ProofAnchor | null;
  internal: boolean;
  resolved: boolean;
  byClient: boolean;
  authorName: string;
  createdAt: string;
  replies: ProofCommentView[];
};

export type ProofVersionView = {
  id: string;
  fileId: string;
  title: string;
  projectId: string;
  clientId: string;
  number: number;
  kind: ProofKind;
  mimeType: string;
  pages: number | null;
  isLatest: boolean;
  approval: ProofApprovalView | null;
  comments: ProofCommentView[];
  rounds: RoundsStatus;
};

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Top-level comments in order, each with its replies. */
export function threadComments(
  rows: Array<Omit<ProofCommentView, 'replies'> & { parentId: string | null }>,
): ProofCommentView[] {
  const top = rows.filter((row) => row.parentId === null);
  return top.map(({ parentId: _parentId, ...comment }) => ({
    ...comment,
    replies: rows
      .filter((row) => row.parentId === comment.id)
      .map(({ parentId: _reply, ...reply }) => ({ ...reply, replies: [] })),
  }));
}

async function latestApprovals(
  tx: DbTransaction,
  versionIds: string[],
): Promise<Map<string, ProofApprovalView>> {
  if (versionIds.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.subjectType, 'file_version'), inArray(approvals.subjectId, versionIds)))
    .orderBy(desc(approvals.requestedAt), desc(approvals.id));
  const latest = new Map<string, ProofApprovalView>();
  for (const row of rows) {
    if (latest.has(row.subjectId)) continue;
    latest.set(row.subjectId, {
      id: row.id,
      status: row.status,
      comment: row.comment,
      decidedAt: iso(row.decidedAt),
      extraRound: row.extraRound,
    });
  }
  return latest;
}

export async function projectRounds(tx: DbTransaction, projectId: string): Promise<RoundsStatus> {
  const [project] = await tx
    .select({ limit: projects.revisionLimit })
    .from(projects)
    .where(eq(projects.id, projectId));
  const [used] = await tx
    .select({ total: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.projectId, projectId),
        eq(approvals.subjectType, 'file_version'),
        eq(approvals.status, 'changes_requested'),
      ),
    );
  return roundsStatus(Number(used?.total ?? 0), project?.limit ?? 3);
}

/** The room's "Para aprovação": files of the project under the caller's row level security. */
export async function loadProofs(
  claims: VerifiedClaims,
  input: { clientId: string; projectId: string },
  deps: Pick<ProofingDeps, 'contexts'>,
): Promise<ProofFileView[] | null> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.clientId).success) {
    return null;
  }
  return deps.contexts.withUserContext(claims, async (tx) => {
    const files = await tx
      .select({ id: proofFiles.id, title: proofFiles.title, phaseId: proofFiles.phaseId })
      .from(proofFiles)
      .where(
        and(
          eq(proofFiles.projectId, input.projectId),
          eq(proofFiles.clientId, input.clientId),
          isNull(proofFiles.archivedAt),
        ),
      )
      .orderBy(desc(proofFiles.createdAt));
    if (files.length === 0) return [];
    const versions = await tx
      .select()
      .from(proofVersions)
      .where(
        inArray(
          proofVersions.fileId,
          files.map((file) => file.id),
        ),
      )
      .orderBy(desc(proofVersions.number));
    const approvalByVersion = await latestApprovals(
      tx,
      versions.map((version) => version.id),
    );
    const openRows =
      versions.length === 0
        ? []
        : await tx
            .select({ versionId: proofComments.versionId, total: count() })
            .from(proofComments)
            .where(
              and(
                inArray(
                  proofComments.versionId,
                  versions.map((version) => version.id),
                ),
                isNull(proofComments.parentId),
                isNull(proofComments.resolvedAt),
              ),
            )
            .groupBy(proofComments.versionId);
    return files.map((file) => ({
      ...file,
      versions: versions
        .filter((version) => version.fileId === file.id)
        .map((version) => ({
          id: version.id,
          number: version.number,
          kind: version.kind,
          status: version.status,
          createdAt: new Date(version.createdAt).toISOString(),
          approval: approvalByVersion.get(version.id) ?? null,
          openComments: Number(openRows.find((row) => row.versionId === version.id)?.total ?? 0),
        })),
    }));
  });
}

/** A version with every comment, for the room team. */
export async function loadProofVersion(
  claims: VerifiedClaims,
  versionId: string,
  deps: Pick<ProofingDeps, 'contexts'>,
): Promise<ProofVersionView | null> {
  if (!uuid.safeParse(versionId).success) return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [version] = await tx
      .select({ version: proofVersions, title: proofFiles.title })
      .from(proofVersions)
      .innerJoin(proofFiles, eq(proofFiles.id, proofVersions.fileId))
      .where(and(eq(proofVersions.id, versionId), eq(proofVersions.status, 'ready')));
    if (!version?.version.kind || !version.version.mimeType) return null;
    const [latest] = await tx
      .select({ id: proofVersions.id })
      .from(proofVersions)
      .where(eq(proofVersions.fileId, version.version.fileId))
      .orderBy(desc(proofVersions.number))
      .limit(1);
    const comments = await tx
      .select({
        id: proofComments.id,
        parentId: proofComments.parentId,
        number: proofComments.number,
        body: proofComments.body,
        anchor: proofComments.anchor,
        internal: proofComments.internal,
        resolvedAt: proofComments.resolvedAt,
        createdAt: proofComments.createdAt,
        authorName: profiles.fullName,
        authorKind: profiles.kind,
      })
      .from(proofComments)
      .leftJoin(profiles, eq(profiles.id, proofComments.authorId))
      .where(eq(proofComments.versionId, versionId))
      .orderBy(asc(proofComments.number), asc(proofComments.createdAt), asc(proofComments.id));
    const approval = (await latestApprovals(tx, [versionId])).get(versionId) ?? null;
    return {
      id: version.version.id,
      fileId: version.version.fileId,
      title: version.title,
      projectId: version.version.projectId,
      clientId: version.version.clientId,
      number: version.version.number,
      kind: version.version.kind,
      mimeType: version.version.mimeType,
      pages: version.version.pages,
      isLatest: latest?.id === version.version.id,
      approval,
      comments: threadComments(
        comments.map((comment) => ({
          id: comment.id,
          parentId: comment.parentId,
          number: comment.number,
          body: comment.body,
          anchor: comment.anchor as ProofAnchor | null,
          internal: comment.internal,
          resolved: comment.resolvedAt !== null,
          byClient: comment.authorKind === 'client',
          authorName: comment.authorName ?? '',
          createdAt: new Date(comment.createdAt).toISOString(),
        })),
      ),
      rounds: await projectRounds(tx, version.version.projectId),
    };
  });
}

/** The project's revision rounds for the room, under the caller's row level security. */
export async function loadRounds(
  claims: VerifiedClaims,
  projectId: string,
  deps: Pick<ProofingDeps, 'contexts'>,
): Promise<RoundsStatus | null> {
  if (!uuid.safeParse(projectId).success) return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    return project ? projectRounds(tx, projectId) : null;
  });
}
