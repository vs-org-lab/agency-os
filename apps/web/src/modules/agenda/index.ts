export { CLIENT_COLOR_COUNT, clientColor } from './domain/colors';
export {
  addDays,
  dayBounds,
  lisbonDay,
  lisbonInstant,
  lisbonTime,
  monthGrid,
  weekDays,
} from './domain/grid';
export {
  MEETING_KINDS,
  meetingSchema,
  type MeetingInput,
  type MeetingKind,
} from './domain/meeting';
export type { AgendaItem, AgendaItemKind, AgendaMeeting, AgendaView } from './views';
export { canScheduleInStudio } from './schedulers';
