import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type DbExecutor = Database | DbTransaction;

export type {
  AcquisitionStatus,
  ApplicationPath,
  CalendarConnectionStatus,
  CallOutcome,
  CallStatus,
  CallSyncStatus,
  ClientLifecycle,
  ClientRole,
  DealSource,
  FollowUpStatus,
  MessageTemplateKind,
  NextStepOwnerKind,
  OrgRole,
  PipelineCodeValue,
  CallKind,
  CoreLevel,
  CoreTemplateKind,
  DocumentKind,
  DocumentStatus,
  EvidenceKind,
  FindingOwner,
  OrbitFront,
  RecordingSource,
  RecordingStatus,
  RoadmapLane,
  SeenArea,
  ThrottleKind,
  TimelineKind,
} from './schema/enums';
export type { WeeklyHours } from './schema/commercial';
