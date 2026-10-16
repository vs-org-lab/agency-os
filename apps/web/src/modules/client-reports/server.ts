import 'server-only';
import { roomDocumentsDeps } from '@/modules/project-documents/server';
import type { VerifiedClaims } from '@/platform/db';
import { loadClientReport, loadClientReports } from './readers';
import {
  createClientReport,
  previewClientReport,
  saveClientReport,
  shareClientReport,
} from './service';

export const loadRoomClientReports = (claims: VerifiedClaims, clientId: string) =>
  loadClientReports(claims, clientId, roomDocumentsDeps());
export const loadRoomClientReport = (claims: VerifiedClaims, reportId: string) =>
  loadClientReport(claims, reportId, roomDocumentsDeps());
export const startClientReport = (
  claims: VerifiedClaims,
  input: { clientId: string; kind: string; periodStart: string },
) => createClientReport(claims, input, roomDocumentsDeps());
export const storeClientReport = (
  claims: VerifiedClaims,
  input: { reportId: string; texts: unknown },
) => saveClientReport(claims, input, roomDocumentsDeps());
export const clientReportPreview = (claims: VerifiedClaims, reportId: string) =>
  previewClientReport(claims, reportId, roomDocumentsDeps());
export const publishClientReport = (claims: VerifiedClaims, reportId: string) =>
  shareClientReport(claims, reportId, roomDocumentsDeps());
