import 'server-only';
import { hostCalendar } from '@/modules/commercial/server';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { agendaWriter, type AgendaDeps } from './access';
import { dayBounds } from './domain/grid';
import { cancelMeeting, scheduleMeeting, updateMeeting } from './meetings';
import { loadAgenda, loadUpcoming } from './readers';
import { hostBusy } from './sync';

const deps = (): AgendaDeps => ({
  contexts: { withUserContext, withSystemContext },
  calendar: hostCalendar,
});

export const loadAgendaRange = (
  claims: VerifiedClaims,
  input: { from: string; to: string; clientId?: string },
) => loadAgenda(claims, input, deps());

export const loadUpcomingEvents = (claims: VerifiedClaims) => loadUpcoming(claims, deps());

/** The host's busy blocks between two Lisbon days, for whoever schedules studio meetings. */
export async function loadHostBusy(claims: VerifiedClaims, from: string, to: string) {
  const writer = await agendaWriter(claims, null, deps());
  if (!writer) return [];
  return hostBusy(
    writer.organizationId,
    { start: dayBounds(from).start, end: dayBounds(to).end },
    deps(),
  );
}

export const scheduleAgendaMeeting = (claims: VerifiedClaims, input: unknown) =>
  scheduleMeeting(claims, input, deps());
export const updateAgendaMeeting = (
  claims: VerifiedClaims,
  input: { eventId: string } & Record<string, unknown>,
) => updateMeeting(claims, input, deps());
export const cancelAgendaMeeting = (claims: VerifiedClaims, eventId: string) =>
  cancelMeeting(claims, { eventId }, deps());

export { AGENDA_FUNCTIONS } from './automations';
