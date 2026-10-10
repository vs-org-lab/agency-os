import { serve } from 'inngest/next';
import { BILLING_FUNCTIONS } from '@/modules/billing/server';
import { COMMERCIAL_FUNCTIONS } from '@/modules/commercial/server';
import { ROOM_FUNCTIONS } from '@/modules/rooms/server';
import { TASK_FUNCTIONS } from '@/modules/tasks/server';
import { CONTRACT_FUNCTIONS } from '@/modules/contracts/server';
import { inngest, outboxDispatch } from '@/modules/events';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    outboxDispatch,
    ...COMMERCIAL_FUNCTIONS,
    ...CONTRACT_FUNCTIONS,
    ...BILLING_FUNCTIONS,
    ...ROOM_FUNCTIONS,
  ],
});
