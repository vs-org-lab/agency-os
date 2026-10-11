import type {
  ApprovalStatus,
  LibraryFileKind,
  PhaseStatus,
  ProjectStatus,
  StepStatus,
  UpdateKind,
  UpdateVisibility,
} from '@agency-os/db';

/** How many feed entries a room shows. */
export const FEED_LIMIT = 100;

export type ProjectSummary = { id: string; name: string; status: ProjectStatus };

export type ClientStepView = {
  id: string;
  position: number;
  name: string;
  status: StepStatus;
  dueOn: string | null;
  reopened: boolean;
};

export type ClientPhaseView = {
  id: string;
  position: number;
  name: string;
  status: PhaseStatus;
  requiresApproval: boolean;
  dueOn: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: ClientStepView[];
};

/** A library file attached to an update (RF-055). */
export type UpdateFileView = { id: string; name: string; kind: LibraryFileKind; sizeBytes: number };

export type ClientUpdateView = {
  id: string;
  kind: UpdateKind;
  body: string;
  milestone: string | null;
  authorName: string | null;
  createdAt: string;
  files: UpdateFileView[];
};

export type ClientApprovalView = {
  id: string;
  phaseId: string;
  phaseName: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  comment: string | null;
};

export type ClientProjectView = {
  id: string;
  name: string;
  status: ProjectStatus;
  startsOn: string;
  endsOn: string | null;
  phases: ClientPhaseView[];
  updates: ClientUpdateView[];
  approvals: ClientApprovalView[];
};

/** The room as the client's decision maker and operational users see it. */
export type ClientRoomView = { projects: ProjectSummary[]; project: ClientProjectView | null };

export type StepView = ClientStepView & {
  visibleToClient: boolean;
  chained: boolean;
  shared: boolean;
  assigneeId: string | null;
};

export type PhaseView = Omit<ClientPhaseView, 'steps'> & {
  codeOnStart: string | null;
  codeOnDone: string | null;
  steps: StepView[];
};

export type UpdateView = ClientUpdateView & { visibility: UpdateVisibility };

export type FinalApprovalView = { id: string; status: ApprovalStatus; comment: string | null };

export type ProjectView = Omit<ClientProjectView, 'phases' | 'updates'> & {
  dealId: string | null;
  phases: PhaseView[];
  updates: UpdateView[];
  /** The latest final approval request (spec 2D.2, decision 5), when one was made. */
  finalApproval: FinalApprovalView | null;
  deliveredAt: string | null;
};

export type Person = { id: string; name: string };

/** The room as the team sees it, with internal items. */
export type RoomView = {
  clientId: string;
  clientName: string;
  projects: ProjectSummary[];
  project: ProjectView | null;
  /** Founders and the staff assigned to the client: who can take a step. */
  people: Person[];
  /** The staff assigned to the client, shown on the project card. */
  team: Person[];
};

export function isoOrNull(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function pickProject<T extends { id: string; status: ProjectStatus }>(
  projects: readonly T[],
  projectId?: string,
): T | null {
  return (
    projects.find((project) => project.id === projectId) ??
    projects.find((project) => project.status === 'active') ??
    projects[0] ??
    null
  );
}
