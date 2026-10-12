import type { MeetingKind } from './domain/meeting';

export type AgendaItemKind =
  'meeting' | 'call' | 'phase_due' | 'step_due' | 'task_due' | 'delivery';

export type AgendaMeeting = {
  kind: MeetingKind;
  notes: string;
  location: string;
  meetUrl: string | null;
  inviteClient: boolean;
  syncStatus: 'pending' | 'synced' | 'failed';
  /** Whether the reader may still change or cancel it. */
  editable: boolean;
};

export type AgendaItem = {
  kind: AgendaItemKind;
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  allDay: boolean;
  /** The Lisbon day the item falls on, `YYYY-MM-DD`. */
  day: string;
  startsAt: string | null;
  endsAt: string | null;
  /** Where a read-only item opens; null for meetings, which open their dialog. */
  href: string | null;
  meeting?: AgendaMeeting;
};

export type AgendaView = {
  items: AgendaItem[];
  /** Whether the reader may schedule here: internal meetings in the studio, the client's in a room. */
  canSchedule: boolean;
  /** Clients the reader may schedule meetings with, by name. */
  clients: { id: string; name: string }[];
};
