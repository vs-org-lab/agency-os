import { pgSchema } from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('app');

export const localeEnum = appSchema.enum('locale', ['pt-PT', 'en']);

export const currencyEnum = appSchema.enum('currency', ['EUR', 'GBP', 'USD', 'AOA']);

export const profileKindEnum = appSchema.enum('profile_kind', ['internal', 'client']);

export const orgRoleEnum = appSchema.enum('org_role', [
  'founder',
  'project_manager',
  'freelancer',
  'finance',
]);

export const clientRoleEnum = appSchema.enum('client_role', [
  'decision_maker',
  'operational',
  'client_finance',
]);

export const membershipStatusEnum = appSchema.enum('membership_status', [
  'invited',
  'active',
  'revoked',
]);

export const actorKindEnum = appSchema.enum('actor_kind', ['user', 'agent', 'system']);

export const eventStatusEnum = appSchema.enum('event_status', ['pending', 'dispatched', 'failed']);

export const PIPELINE_CODE_VALUES = [
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '1.6',
  '2.1',
  '2.2',
  '2.3',
  '2.4',
  '2.5',
  '2.6',
  '2.7',
  '2.8',
  '2.9',
  '2.10',
  '3.1',
  '3.2',
  '3.3',
  '3.4',
  '3.5',
  '3.6',
  '4.1',
  '4.2',
  '4.3',
  '4.4',
  'X.1',
  'X.2',
  'X.3',
  'X.4',
] as const;

export const pipelineCodeEnum = appSchema.enum('pipeline_code', PIPELINE_CODE_VALUES);

export const clientLifecycleEnum = appSchema.enum('client_lifecycle', [
  'prospect',
  'active',
  'former',
]);

export const applicationPathEnum = appSchema.enum('application_path', ['a', 'b', 'c']);

export const dealSourceEnum = appSchema.enum('deal_source', [
  'application',
  'acquisition',
  'referral',
  'client_request',
]);

export const nextStepOwnerKindEnum = appSchema.enum('next_step_owner_kind', ['staff', 'client']);

export const callStatusEnum = appSchema.enum('call_status', [
  'scheduled',
  'cancelled',
  'completed',
  'no_show',
]);

export const callSyncStatusEnum = appSchema.enum('call_sync_status', [
  'pending',
  'synced',
  'failed',
]);

export const callOutcomeEnum = appSchema.enum('call_outcome', ['advance', 'decline', 'follow_up']);

export const followUpStatusEnum = appSchema.enum('follow_up_status', ['open', 'done', 'dismissed']);

export const messageTemplateKindEnum = appSchema.enum('message_template_kind', [
  'follow_up',
  'acquisition',
  'email',
]);

export const acquisitionStatusEnum = appSchema.enum('acquisition_status', [
  'to_contact',
  'contacted',
  'replied',
  'converted',
  'discarded',
]);

export const calendarConnectionStatusEnum = appSchema.enum('calendar_connection_status', [
  'active',
  'revoked',
  'error',
]);

export const timelineKindEnum = appSchema.enum('timeline_kind', [
  'application_submitted',
  'application_reviewed',
  'stage_changed',
  'call_booked',
  'call_rescheduled',
  'call_cancelled',
  'call_completed',
  'follow_up_created',
  'follow_up_completed',
]);

export const coreTemplateKindEnum = appSchema.enum('core_template_kind', [
  'briefing',
  'orbit_grid',
]);

export const orbitFrontEnum = appSchema.enum('orbit_front', [
  'core',
  'orbit',
  'gravity',
  'constellation',
]);

export const coreLevelEnum = appSchema.enum('core_level', ['low', 'medium', 'high']);

export const roadmapLaneEnum = appSchema.enum('roadmap_lane', ['days_30', 'days_90', 'months_12']);

export const findingOwnerEnum = appSchema.enum('finding_owner', ['internal', 'aurion']);

export const evidenceKindEnum = appSchema.enum('evidence_kind', ['file', 'link', 'number', 'page']);

export const callKindEnum = appSchema.enum('call_kind', ['discovery', 'proposal_session']);

export const documentKindEnum = appSchema.enum('document_kind', ['figma_presentation']);

export const documentStatusEnum = appSchema.enum('document_status', ['draft', 'with_client']);

export const recordingSourceEnum = appSchema.enum('recording_source', ['call', 'upload']);

export const recordingStatusEnum = appSchema.enum('recording_status', [
  'pending_upload',
  'uploaded',
  'transcribing',
  'done',
  'failed',
]);

export const countryCodeEnum = appSchema.enum('country_code', ['PT', 'AO']);

export const proposalStatusEnum = appSchema.enum('proposal_status', [
  'draft',
  'sent',
  'accepted',
  'withdrawn',
]);

export const contractStatusEnum = appSchema.enum('contract_status', [
  'awaiting_signatures',
  'signed',
  'void',
]);

export const signaturePartyEnum = appSchema.enum('signature_party', ['client', 'studio']);

export const billingMilestoneStatusEnum = appSchema.enum('billing_milestone_status', [
  'pending',
  'requested',
  'paid',
]);

export const paymentRequestStatusEnum = appSchema.enum('payment_request_status', [
  'sent',
  'paid',
  'void',
]);

export const paymentMethodEnum = appSchema.enum('payment_method', [
  'stripe',
  'bank_transfer',
  'multicaixa',
  'other',
]);

export const paymentStatusEnum = appSchema.enum('payment_status', ['reconciled', 'review']);

export const invoiceIssuerEnum = appSchema.enum('invoice_issuer', ['at_certified', 'agt_portal']);

export const projectStatusEnum = appSchema.enum('project_status', [
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const phaseStatusEnum = appSchema.enum('phase_status', [
  'pending',
  'in_progress',
  'awaiting_approval',
  'done',
]);

export const stepStatusEnum = appSchema.enum('step_status', ['todo', 'in_progress', 'done']);

export const updateVisibilityEnum = appSchema.enum('update_visibility', ['internal', 'client']);

export const updateKindEnum = appSchema.enum('update_kind', [
  'manual',
  'project_started',
  'step_shared',
  'phase_done',
  'approval_decided',
]);

export const approvalSubjectEnum = appSchema.enum('approval_subject', ['phase', 'file_version']);

export const approvalStatusEnum = appSchema.enum('approval_status', [
  'pending',
  'approved',
  'changes_requested',
  'withdrawn',
]);

export const taskStatusEnum = appSchema.enum('task_status', ['open', 'done']);

export const proofKindEnum = appSchema.enum('proof_kind', ['image', 'pdf', 'video']);

export const proofVersionStatusEnum = appSchema.enum('proof_version_status', [
  'uploading',
  'ready',
  'rejected',
]);

export const taskSourceEnum = appSchema.enum('task_source', ['manual', 'kickoff', 'welcome_kit']);

export const seenAreaEnum = appSchema.enum('seen_area', ['applications']);

export const throttleKindEnum = appSchema.enum('throttle_kind', [
  'application_ip',
  'application_email',
  'booking_ip',
]);

export type OrgRole = (typeof orgRoleEnum.enumValues)[number];
export type ClientRole = (typeof clientRoleEnum.enumValues)[number];
export type PipelineCodeValue = (typeof pipelineCodeEnum.enumValues)[number];
export type ClientLifecycle = (typeof clientLifecycleEnum.enumValues)[number];
export type ApplicationPath = (typeof applicationPathEnum.enumValues)[number];
export type DealSource = (typeof dealSourceEnum.enumValues)[number];
export type NextStepOwnerKind = (typeof nextStepOwnerKindEnum.enumValues)[number];
export type CallStatus = (typeof callStatusEnum.enumValues)[number];
export type CallSyncStatus = (typeof callSyncStatusEnum.enumValues)[number];
export type CallOutcome = (typeof callOutcomeEnum.enumValues)[number];
export type FollowUpStatus = (typeof followUpStatusEnum.enumValues)[number];
export type CoreTemplateKind = (typeof coreTemplateKindEnum.enumValues)[number];
export type OrbitFront = (typeof orbitFrontEnum.enumValues)[number];
export type CoreLevel = (typeof coreLevelEnum.enumValues)[number];
export type RoadmapLane = (typeof roadmapLaneEnum.enumValues)[number];
export type FindingOwner = (typeof findingOwnerEnum.enumValues)[number];
export type EvidenceKind = (typeof evidenceKindEnum.enumValues)[number];
export type CallKind = (typeof callKindEnum.enumValues)[number];
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];
export type RecordingSource = (typeof recordingSourceEnum.enumValues)[number];
export type RecordingStatus = (typeof recordingStatusEnum.enumValues)[number];
export type CountryCode = (typeof countryCodeEnum.enumValues)[number];
export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];
export type SignatureParty = (typeof signaturePartyEnum.enumValues)[number];
export type BillingMilestoneStatus = (typeof billingMilestoneStatusEnum.enumValues)[number];
export type PaymentRequestStatus = (typeof paymentRequestStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type InvoiceIssuer = (typeof invoiceIssuerEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type PhaseStatus = (typeof phaseStatusEnum.enumValues)[number];
export type StepStatus = (typeof stepStatusEnum.enumValues)[number];
export type UpdateVisibility = (typeof updateVisibilityEnum.enumValues)[number];
export type UpdateKind = (typeof updateKindEnum.enumValues)[number];
export type ApprovalSubject = (typeof approvalSubjectEnum.enumValues)[number];
export type ProofKind = (typeof proofKindEnum.enumValues)[number];
export type ProofVersionStatus = (typeof proofVersionStatusEnum.enumValues)[number];
export type ApprovalStatus = (typeof approvalStatusEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskSource = (typeof taskSourceEnum.enumValues)[number];
export type SeenArea = (typeof seenAreaEnum.enumValues)[number];
export type MessageTemplateKind = (typeof messageTemplateKindEnum.enumValues)[number];
export type AcquisitionStatus = (typeof acquisitionStatusEnum.enumValues)[number];
export type CalendarConnectionStatus = (typeof calendarConnectionStatusEnum.enumValues)[number];
export type TimelineKind = (typeof timelineKindEnum.enumValues)[number];
export type ThrottleKind = (typeof throttleKindEnum.enumValues)[number];
