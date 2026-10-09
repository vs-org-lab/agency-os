import { serve } from 'inngest/next';
import { COMMERCIAL_FUNCTIONS } from '@/modules/commercial/server';
import { CONTRACT_FUNCTIONS } from '@/modules/contracts/server';
import { inngest, outboxDispatch } from '@/modules/events';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [outboxDispatch, ...COMMERCIAL_FUNCTIONS, ...CONTRACT_FUNCTIONS],
});
