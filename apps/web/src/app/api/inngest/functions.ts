import { BILLING_FUNCTIONS } from '@/modules/billing/server';
import { COMMERCIAL_FUNCTIONS } from '@/modules/commercial/server';
import { CONTRACT_FUNCTIONS } from '@/modules/contracts/server';
import { outboxDispatch } from '@/modules/events';
import { LIBRARY_FUNCTIONS } from '@/modules/library/server';
import { AGENDA_FUNCTIONS } from '@/modules/agenda/server';
import { BRAND_HUB_FUNCTIONS } from '@/modules/brand-hub/server';
import { CLIENT_REPORT_FUNCTIONS } from '@/modules/client-reports/server';
import { HEALTH_FUNCTIONS, MILESTONE_FUNCTIONS } from '@/modules/health/server';
import { OUTCOME_FUNCTIONS } from '@/modules/outcomes/server';
import { RETAINER_FUNCTIONS } from '@/modules/retainers/server';
import { DOCUMENT_FUNCTIONS } from '@/modules/project-documents/server';
import { PROOFING_FUNCTIONS } from '@/modules/proofing/server';
import { ROOM_FUNCTIONS } from '@/modules/rooms/server';
import { TASK_FUNCTIONS } from '@/modules/tasks/server';
import { TESTIMONIAL_FUNCTIONS } from '@/modules/testimonials/server';
import { VOICE_NOTE_FUNCTIONS } from '@/modules/voice-notes/server';

export const INNGEST_FUNCTIONS = [
  outboxDispatch,
  ...COMMERCIAL_FUNCTIONS,
  ...CONTRACT_FUNCTIONS,
  ...BILLING_FUNCTIONS,
  ...ROOM_FUNCTIONS,
  ...TASK_FUNCTIONS,
  ...PROOFING_FUNCTIONS,
  ...TESTIMONIAL_FUNCTIONS,
  ...VOICE_NOTE_FUNCTIONS,
  ...LIBRARY_FUNCTIONS,
  ...DOCUMENT_FUNCTIONS,
  ...BRAND_HUB_FUNCTIONS,
  ...RETAINER_FUNCTIONS,
  ...OUTCOME_FUNCTIONS,
  ...MILESTONE_FUNCTIONS,
  ...HEALTH_FUNCTIONS,
  ...AGENDA_FUNCTIONS,
  ...CLIENT_REPORT_FUNCTIONS,
];
