import { BILLING_FUNCTIONS } from '@/modules/billing/server';
import { COMMERCIAL_FUNCTIONS } from '@/modules/commercial/server';
import { CONTRACT_FUNCTIONS } from '@/modules/contracts/server';
import { outboxDispatch } from '@/modules/events';
import { LIBRARY_FUNCTIONS } from '@/modules/library/server';
import { BRAND_HUB_FUNCTIONS } from '@/modules/brand-hub/server';
import { DOCUMENT_FUNCTIONS } from '@/modules/project-documents/server';
import { PROOFING_FUNCTIONS } from '@/modules/proofing/server';
import { ROOM_FUNCTIONS } from '@/modules/rooms/server';
import { TASK_FUNCTIONS } from '@/modules/tasks/server';
import { TESTIMONIAL_FUNCTIONS } from '@/modules/testimonials/server';

export const INNGEST_FUNCTIONS = [
  outboxDispatch,
  ...COMMERCIAL_FUNCTIONS,
  ...CONTRACT_FUNCTIONS,
  ...BILLING_FUNCTIONS,
  ...ROOM_FUNCTIONS,
  ...TASK_FUNCTIONS,
  ...PROOFING_FUNCTIONS,
  ...TESTIMONIAL_FUNCTIONS,
  ...LIBRARY_FUNCTIONS,
  ...DOCUMENT_FUNCTIONS,
  ...BRAND_HUB_FUNCTIONS,
];
