import type {
  ContractStatus,
  DocumentStatus,
  ProjectDocumentKind,
  ProjectDocumentStatus,
  ProjectStatus,
  ProposalStatus,
} from '@agency-os/db';
import type { DocumentActions } from './domain/lifecycle';

export type DocumentCardView = {
  id: string;
  title: string;
  kind: ProjectDocumentKind;
  status: ProjectDocumentStatus;
  /** The number of the current version; null while the first upload is pending. */
  version: number | null;
  updatedAt: string;
};

/** A Core presentation (spec 1B) shown read-only in the room's documents tab. */
export type PresentationCardView = {
  id: string;
  title: string;
  status: DocumentStatus;
  dealId: string | null;
};

export type CommercialCardsView = {
  proposal: ProposalStatus | null;
  contract: ContractStatus | null;
  invoices: 'none' | 'open' | 'paid';
};

export type RoomDocumentsView = {
  projects: { id: string; name: string; status: ProjectStatus }[];
  projectId: string | null;
  documents: DocumentCardView[];
  presentations: PresentationCardView[];
  /** Proposal, contract and invoice states, for pipeline readers only. */
  commercial: CommercialCardsView | null;
  canWrite: boolean;
};

export type DocumentVersionView = {
  id: string;
  number: number;
  kind: ProjectDocumentKind;
  url: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  pages: number | null;
  uploadStatus: 'uploading' | 'ready' | 'rejected';
  shared: boolean;
  createdAt: string;
};

export type DocumentCommentView = {
  id: string;
  body: string;
  internal: boolean;
  authorName: string | null;
  byClient: boolean;
  versionNumber: number;
  createdAt: string;
};

export type StaffDocumentView = {
  id: string;
  clientId: string;
  projectId: string;
  title: string;
  kind: ProjectDocumentKind;
  status: ProjectDocumentStatus;
  current: DocumentVersionView | null;
  /** Newest first. */
  versions: DocumentVersionView[];
  comments: DocumentCommentView[];
  pendingApprovalId: string | null;
  lastDecision: { status: 'approved' | 'changes_requested'; comment: string | null } | null;
  actions: DocumentActions;
  canWrite: boolean;
};

export type PortalDocumentCardView = {
  id: string;
  title: string;
  kind: ProjectDocumentKind;
  status: ProjectDocumentStatus;
  projectName: string;
  updatedAt: string;
};

export type PortalDocumentView = {
  id: string;
  title: string;
  kind: ProjectDocumentKind;
  status: ProjectDocumentStatus;
  /** The latest version shown to the client. */
  version: DocumentVersionView | null;
  versions: DocumentVersionView[];
  comments: DocumentCommentView[];
  pendingApprovalId: string | null;
  canDecide: boolean;
};
