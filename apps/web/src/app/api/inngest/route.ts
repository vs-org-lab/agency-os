import { serve } from 'inngest/next';
import { inngest, outboxDispatch } from '@/modules/events';

export const { GET, POST, PUT } = serve({ client: inngest, functions: [outboxDispatch] });
