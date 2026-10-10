import { BILLING_FUNCTIONS } from '@/modules/billing/server';
import { COMMERCIAL_FUNCTIONS } from '@/modules/commercial/server';
import { CONTRACT_FUNCTIONS } from '@/modules/contracts/server';
import { outboxDispatch } from '@/modules/events';
import { ROOM_FUNCTIONS } from '@/modules/rooms/server';
import { TASK_FUNCTIONS } from '@/modules/tasks/server';

export const INNGEST_FUNCTIONS = [
  outboxDispatch,
  ...COMMERCIAL_FUNCTIONS,
  ...CONTRACT_FUNCTIONS,
  ...BILLING_FUNCTIONS,
  ...ROOM_FUNCTIONS,
  ...TASK_FUNCTIONS,
];
