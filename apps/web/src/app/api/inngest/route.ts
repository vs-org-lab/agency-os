import { serve } from 'inngest/next';
import { inngest } from '@/modules/events';
import { INNGEST_FUNCTIONS } from './functions';

export const { GET, POST, PUT } = serve({ client: inngest, functions: INNGEST_FUNCTIONS });
