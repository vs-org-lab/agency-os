import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { createProjectAsStaff } from './projects';
import { roomsDeps } from './runtime';
import {
  ensureProcessTemplates,
  listProcessTemplates,
  publishProcessTemplate,
  type ProcessTemplate,
} from './templates/service';

export type RoomSession = { claims: VerifiedClaims };

export async function loadProcessTemplates(
  session: RoomSession & { organizationId: string },
): Promise<ProcessTemplate[]> {
  await withSystemContext((tx) => ensureProcessTemplates(tx, session.organizationId));
  return withUserContext(session.claims, (tx) => listProcessTemplates(tx, session.organizationId));
}

export function publishProcess(
  session: RoomSession,
  input: { key?: string; name: string; definition: unknown; makeDefault: boolean },
) {
  return publishProcessTemplate(session.claims, input, roomsDeps());
}

export function createRoomProject(
  session: RoomSession,
  input: { clientId: string; dealId?: string; name: string; templateKey?: string },
) {
  return createProjectAsStaff(session.claims, input, roomsDeps());
}

export type { ProcessTemplate } from './templates/service';
