import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ApprovalStatus, DbTransaction, ProofKind } from '@agency-os/db';
import type { ProofAnchor } from './domain/anchors';
import { roundsStatus, type RoundsStatus } from './domain/rounds';
import { threadComments, type ProofApprovalView, type ProofCommentView } from './views';

type Timestamp = Date | string;

export type ClientProofVersionView = {
  id: string;
  title: string;
  number: number;
  kind: ProofKind;
  mimeType: string;
  pages: number | null;
  approval: ProofApprovalView | null;
  comments: ProofCommentView[];
  rounds: RoundsStatus;
};

/** P-03 for a file: the version through the portal views, without internal comments (RN-23). */
export async function getClientProofVersion(
  tx: DbTransaction,
  versionId: string,
): Promise<ClientProofVersionView | null> {
  if (!z.uuid().safeParse(versionId).success) return null;
  const [version] = await tx.execute<{
    id: string;
    project_id: string;
    title: string;
    number: number;
    kind: ProofKind;
    mime_type: string;
    pages: number | null;
    revision_limit: number;
  }>(sql`
    select v.id, v.project_id, v.title, v.number, v.kind, v.mime_type, v.pages, p.revision_limit
    from public.portal_proof_versions v
    join public.portal_projects p on p.id = v.project_id
    where v.id = ${versionId}::uuid
  `);
  if (!version) return null;
  const comments = await tx.execute<{
    id: string;
    parent_id: string | null;
    number: number | null;
    body: string;
    anchor: ProofAnchor | null;
    resolved_at: Timestamp | null;
    created_at: Timestamp;
    author_name: string | null;
    by_client: boolean | null;
  }>(sql`
    select id, parent_id, number, body, anchor, resolved_at, created_at, author_name, by_client
    from public.portal_proof_comments
    where version_id = ${versionId}::uuid
    order by number nulls last, created_at, id
  `);
  const approvals = await tx.execute<{
    id: string;
    status: ApprovalStatus;
    comment: string | null;
    decided_at: Timestamp | null;
  }>(sql`
    select id, status, comment, decided_at from public.portal_approvals
    where subject_type = 'file_version' and subject_id = ${versionId}::uuid
    order by requested_at desc, id desc
    limit 1
  `);
  const [used] = await tx.execute<{ total: number }>(sql`
    select count(*)::int as total from public.portal_approvals
    where project_id = ${version.project_id}::uuid and subject_type = 'file_version'
      and status = 'changes_requested'
  `);
  const approval = approvals[0];
  return {
    id: version.id,
    title: version.title,
    number: version.number,
    kind: version.kind,
    mimeType: version.mime_type,
    pages: version.pages,
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          comment: approval.comment,
          decidedAt: approval.decided_at ? new Date(approval.decided_at).toISOString() : null,
          extraRound: false,
        }
      : null,
    comments: threadComments(
      comments.map((comment) => ({
        id: comment.id,
        parentId: comment.parent_id,
        number: comment.number,
        body: comment.body,
        anchor: comment.anchor,
        internal: false,
        resolved: comment.resolved_at !== null,
        byClient: comment.by_client === true,
        authorName: comment.author_name ?? '',
        createdAt: new Date(comment.created_at).toISOString(),
      })),
    ),
    rounds: roundsStatus(used?.total ?? 0, version.revision_limit),
  };
}

export type ClientProofSummary = {
  versionId: string;
  title: string;
  number: number;
  status: ApprovalStatus | null;
};

/**
 * The client's proofs: the latest version of each file sent for approval, with the state of its
 * latest request, so decided proofs stay reachable after they leave the approvals list.
 */
export async function getClientProofs(tx: DbTransaction): Promise<ClientProofSummary[]> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    number: number;
    status: ApprovalStatus | null;
  }>(sql`
    select latest.id, latest.title, latest.number, approval.status
    from (
      select distinct on (v.file_id) v.id, v.title, v.number, v.created_at
      from public.portal_proof_versions v
      order by v.file_id, v.number desc
    ) latest
    left join lateral (
      select a.status from public.portal_approvals a
      where a.subject_type = 'file_version' and a.subject_id = latest.id
      order by a.requested_at desc, a.id desc
      limit 1
    ) approval on true
    order by latest.created_at desc, latest.id
  `);
  return rows.map((row) => ({
    versionId: row.id,
    title: row.title,
    number: row.number,
    status: row.status,
  }));
}
