import { z } from 'zod';

export const MEETING_KINDS = ['kickoff', 'meeting', 'review', 'internal'] as const;

const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

/** A meeting as the team schedules it (spec 2G, decisions 2 and 3). */
export const meetingSchema = z
  .object({
    kind: z.enum(MEETING_KINDS),
    clientId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    title: z.string().trim().min(1).max(120),
    notes: z.string().max(2000),
    location: z.string().trim().max(500),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    inviteClient: z.boolean(),
  })
  .refine((meeting) => (meeting.kind === 'internal') === (meeting.clientId === null), {
    path: ['clientId'],
  })
  .refine((meeting) => meeting.clientId !== null || meeting.projectId === null, {
    path: ['projectId'],
  })
  .refine((meeting) => meeting.kind !== 'kickoff' || meeting.projectId !== null, {
    path: ['projectId'],
  })
  .refine((meeting) => meeting.kind !== 'internal' || !meeting.inviteClient, {
    path: ['inviteClient'],
  })
  .refine(
    (meeting) =>
      meeting.endsAt.getTime() > meeting.startsAt.getTime() &&
      meeting.endsAt.getTime() - meeting.startsAt.getTime() <= MAX_DURATION_MS,
    { path: ['endsAt'] },
  );

export type MeetingInput = z.infer<typeof meetingSchema>;
export type MeetingKind = (typeof MEETING_KINDS)[number];
