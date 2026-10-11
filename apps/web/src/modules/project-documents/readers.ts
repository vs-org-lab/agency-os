import { sql } from 'drizzle-orm';
import type {
  ContractStatus,
  DbTransaction,
  DocumentStatus,
  ProjectDocumentKind,
  ProjectDocumentStatus,
  ProjectStatus,
  ProposalStatus,
} from '@agency-os/db';
import { LIBRARY_LINK_TTL_SECONDS } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import { documentEditor, uuid, type DocumentsDeps } from './access';
import { documentActions } from './domain/lifecycle';
import type {
  CommercialCardsView,
  DocumentCommentView,
  DocumentVersionView,
  PortalDocumentCardView,
  PortalDocumentView,
  RoomDocumentsView,
  StaffDocumentView,
} from './views';

type Timestamp = string | Date;

const iso = (value: Timestamp) => new Date(value).toISOString();

type VersionRow = {
  id: string;
  number: number;
  kind: ProjectDocumentKind;
  url: string | null;
  file_name: string | null;
  size_bytes: string | null;
  pages: number | null;
  upload_status?: 'uploading' | 'ready' | 'rejected';
  shared_at: Timestamp | null;
  created_at: Timestamp;
};

function toVersion(row: VersionRow): DocumentVersionView {
  return {
    id: row.id,
    number: Number(row.number),
    kind: row.kind,
    url: row.url,
    fileName: row.file_name,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    pages: row.pages === null ? null : Number(row.pages),
    uploadStatus: row.upload_status ?? 'ready',
    shared: row.shared_at !== null,
    createdAt: iso(row.created_at),
  };
}

type CommentRow = {
  id: string;
  body: string;
  internal: boolean;
  author_name: string | null;
  by_client: boolean | null;
  version_number: number;
  created_at: Timestamp;
};

function toComment(row: CommentRow): DocumentCommentView {
  return {
    id: row.id,
    body: row.body,
    internal: row.internal,
    authorName: row.author_name,
    byClient: row.by_client === true,
    versionNumber: Number(row.version_number),
    createdAt: iso(row.created_at),
  };
}

async function commercialCards(tx: DbTransaction, clientId: string): Promise<CommercialCardsView> {
  const [row] = await tx.execute<{
    proposal: ProposalStatus | null;
    contract: ContractStatus | null;
    open_requests: number;
    paid_requests: number;
  }>(sql`
    select
      (select status::text from public.proposals where client_id = ${clientId}::uuid
       order by created_at desc limit 1) as proposal,
      (select status::text from public.contracts where client_id = ${clientId}::uuid
       order by created_at desc limit 1) as contract,
      (select count(*)::int from public.payment_requests
       where client_id = ${clientId}::uuid and status = 'sent') as open_requests,
      (select count(*)::int from public.payment_requests
       where client_id = ${clientId}::uuid and status = 'paid') as paid_requests
  `);
  return {
    proposal: row?.proposal ?? null,
    contract: row?.contract ?? null,
    invoices:
      (row?.open_requests ?? 0) > 0 ? 'open' : (row?.paid_requests ?? 0) > 0 ? 'paid' : 'none',
  };
}

/**
 * C-04: the documents of a client's project for the team, with the Core presentations and, for
 * pipeline readers, the proposal, contract and invoice states. Null when the caller reads no
 * project of the client.
 */
export async function loadRoomDocuments(
  claims: VerifiedClaims,
  input: { clientId: string; projectId?: string },
  deps: DocumentsDeps,
): Promise<RoomDocumentsView | null> {
  if (!uuid.safeParse(input.clientId).success || claims.user_kind === 'client') return null;
  const read = await deps.contexts.withUserContext(claims, async (tx) => {
    const projects = await tx.execute<{ id: string; name: string; status: ProjectStatus }>(sql`
      select id, name, status::text as status from public.projects
      where client_id = ${input.clientId}::uuid
      order by created_at desc, id
    `);
    const project = projects.find((candidate) => candidate.id === input.projectId) ?? projects[0];
    if (!project) return null;
    const documents = await tx.execute<{
      id: string;
      title: string;
      kind: ProjectDocumentKind;
      status: ProjectDocumentStatus;
      version: number | null;
      updated_at: Timestamp;
    }>(sql`
      select d.id, d.title, d.kind::text as kind, d.status::text as status, v.number as version,
             d.updated_at
      from public.project_documents d
      left join public.project_document_versions v on v.id = d.current_version_id
      where d.project_id = ${project.id}::uuid
      order by lower(d.title), d.id
    `);
    const presentations = await tx.execute<{
      id: string;
      title: string;
      status: DocumentStatus;
      deal_id: string | null;
    }>(sql`
      select id, title, status::text as status, deal_id from public.documents
      where client_id = ${input.clientId}::uuid
      order by created_at desc, id
    `);
    const [pipeline] = await tx.execute<{ allowed: boolean }>(sql`
      select app.can_read_pipeline(c.organization_id, c.id) as allowed
      from public.clients c where c.id = ${input.clientId}::uuid
    `);
    return {
      projects: projects.map(({ id, name, status }) => ({ id, name, status })),
      projectId: project.id,
      documents: documents.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        version: row.version === null ? null : Number(row.version),
        updatedAt: iso(row.updated_at),
      })),
      presentations: presentations.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        dealId: row.deal_id,
      })),
      commercial: pipeline?.allowed === true ? await commercialCards(tx, input.clientId) : null,
    };
  });
  if (!read?.projectId) return null;
  const editor = await documentEditor(claims, read.projectId, deps);
  return { ...read, canWrite: editor !== null };
}

/** C-05: a document for the team, with every version, internal comments and the allowed actions. */
export async function loadStaffDocument(
  claims: VerifiedClaims,
  documentId: string,
  deps: DocumentsDeps,
): Promise<StaffDocumentView | null> {
  if (!uuid.safeParse(documentId).success || claims.user_kind === 'client') return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [document] = await tx.execute<{
      id: string;
      client_id: string;
      project_id: string;
      title: string;
      kind: ProjectDocumentKind;
      status: ProjectDocumentStatus;
      current_version_id: string | null;
      approved_at: Timestamp | null;
    }>(sql`
      select id, client_id, project_id, title, kind::text as kind, status::text as status,
             current_version_id, approved_at
      from public.project_documents where id = ${documentId}::uuid
    `);
    if (!document) return null;
    const versions = (
      await tx.execute<VersionRow>(sql`
        select id, number, kind::text as kind, url, file_name, size_bytes::text as size_bytes,
               pages, upload_status::text as upload_status, shared_at, created_at
        from public.project_document_versions
        where document_id = ${documentId}::uuid and upload_status <> 'rejected'
        order by number desc
      `)
    ).map(toVersion);
    const comments = (
      await tx.execute<CommentRow>(sql`
        select c.id, c.body, c.internal, p.full_name as author_name, p.kind = 'client' as by_client,
               v.number as version_number, c.created_at
        from public.project_document_comments c
        join public.project_document_versions v on v.id = c.version_id
        left join public.profiles p on p.id = c.author_id
        where c.document_id = ${documentId}::uuid
        order by c.created_at, c.id
      `)
    ).map(toComment);
    const approvals = await tx.execute<{
      id: string;
      status: 'pending' | 'approved' | 'changes_requested';
      comment: string | null;
    }>(sql`
      select a.id, a.status::text as status, a.comment
      from public.approvals a
      join public.project_document_versions v on v.id = a.subject_id
      where a.subject_type = 'document_version' and v.document_id = ${documentId}::uuid
        and a.status <> 'withdrawn'
      order by a.requested_at desc, a.id
    `);
    const pending = approvals.find((approval) => approval.status === 'pending');
    const decided = approvals.find((approval) => approval.status !== 'pending');
    const editor = await documentEditor(claims, document.project_id, deps);
    return {
      id: document.id,
      clientId: document.client_id,
      projectId: document.project_id,
      title: document.title,
      kind: document.kind,
      status: document.status,
      current: versions.find((version) => version.id === document.current_version_id) ?? null,
      versions,
      comments,
      pendingApprovalId: pending?.id ?? null,
      lastDecision:
        decided && decided.status !== 'pending'
          ? { status: decided.status, comment: decided.comment }
          : null,
      actions: documentActions({
        status: document.status,
        everApproved: document.approved_at !== null,
        pendingApproval: pending !== undefined,
      }),
      canWrite: editor !== null,
    };
  });
}

/** P-03 list: the documents shared with the client, across the client's projects. */
export async function loadPortalDocuments(
  claims: VerifiedClaims,
  clientId: string,
  deps: DocumentsDeps,
): Promise<PortalDocumentCardView[]> {
  if (!uuid.safeParse(clientId).success) return [];
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{
      id: string;
      title: string;
      kind: ProjectDocumentKind;
      status: ProjectDocumentStatus;
      project_name: string;
      updated_at: Timestamp;
    }>(sql`
      select d.id, d.title, d.kind::text as kind, d.status::text as status,
             p.name as project_name, d.updated_at
      from public.portal_project_documents d
      join public.portal_projects p on p.id = d.project_id
      where d.client_id = ${clientId}::uuid
      order by lower(d.title), d.id
    `),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    projectName: row.project_name,
    updatedAt: iso(row.updated_at),
  }));
}

/** P-03: a shared document as the client sees it: the versions shown, public comments, the decision. */
export async function loadPortalDocument(
  claims: VerifiedClaims,
  documentId: string,
  deps: DocumentsDeps,
): Promise<PortalDocumentView | null> {
  if (!uuid.safeParse(documentId).success || claims.user_kind !== 'client') return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [document] = await tx.execute<{
      id: string;
      client_id: string;
      title: string;
      kind: ProjectDocumentKind;
      status: ProjectDocumentStatus;
      current_version_id: string | null;
    }>(sql`
      select id, client_id, title, kind::text as kind, status::text as status, current_version_id
      from public.portal_project_documents where id = ${documentId}::uuid
    `);
    if (!document) return null;
    const versions = (
      await tx.execute<VersionRow>(sql`
        select id, number, kind::text as kind, url, file_name, size_bytes::text as size_bytes,
               pages, shared_at, created_at
        from public.portal_project_document_versions
        where document_id = ${documentId}::uuid
        order by number desc
      `)
    ).map(toVersion);
    const comments = (
      await tx.execute<CommentRow>(sql`
        select c.id, c.body, false as internal, c.author_name, c.by_client,
               v.number as version_number, c.created_at
        from public.portal_project_document_comments c
        join public.portal_project_document_versions v on v.id = c.version_id
        where c.document_id = ${documentId}::uuid
        order by c.created_at, c.id
      `)
    ).map(toComment);
    const [pending] = await tx.execute<{ id: string; decides: boolean }>(sql`
      select a.id,
             app.is_client_member(a.client_id, array['decision_maker']::app.client_role[]) as decides
      from public.portal_approvals a
      join public.portal_project_document_versions v on v.id = a.subject_id
      where a.subject_type = 'document_version' and a.status = 'pending'
        and v.document_id = ${documentId}::uuid
      limit 1
    `);
    return {
      id: document.id,
      title: document.title,
      kind: document.kind,
      status: document.status,
      version:
        versions.find((version) => version.id === document.current_version_id) ??
        versions[0] ??
        null,
      versions,
      comments,
      pendingApprovalId: pending?.id ?? null,
      canDecide: pending?.decides === true,
    };
  });
}

/**
 * A 15-minute link to a PDF or file version for whoever may read it: the team under row level
 * security, or the client through the portal view (versions shown to them only), downloading
 * under the file's name (SEC-31).
 */
export async function documentVersionUrl(
  claims: VerifiedClaims,
  versionId: string,
  deps: DocumentsDeps,
): Promise<string | null> {
  if (!uuid.safeParse(versionId).success) return null;
  const readable = await deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select id from public.project_document_versions
      where id = ${versionId}::uuid and upload_status = 'ready'
      union
      select id from public.portal_project_document_versions where id = ${versionId}::uuid
    `);
    return rows.length > 0;
  });
  if (!readable) return null;
  const [version] = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ storage_path: string | null; file_name: string | null }>(sql`
      select storage_path, file_name from public.project_document_versions
      where id = ${versionId}::uuid
    `),
  );
  if (!version?.storage_path) return null;
  return deps.storage.signedDownloadUrl(
    version.storage_path,
    LIBRARY_LINK_TTL_SECONDS,
    version.file_name ?? 'documento',
  );
}
