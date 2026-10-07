import type { CalendarPort } from './port';

export function createFakeCalendarPort(): CalendarPort {
  return {
    async freeBusy() {
      return [];
    },
    async createEvent(input) {
      return { eventId: `fake-${input.requestId}`, meetUrl: null };
    },
    async updateEvent() {
      return;
    },
    async deleteEvent() {
      return;
    },
  };
}
