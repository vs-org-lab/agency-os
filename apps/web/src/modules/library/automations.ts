import 'server-only';
import { failureHandler, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { sweepStaleUploads } from './files';
import { createSupabaseLibraryStorage } from './supabase-storage';

/** Hourly: uploads never confirmed after their link expired give their storage back. */
const staleUploads = inngest.createFunction(
  {
    id: 'library-stale-uploads',
    triggers: [{ cron: 'TZ=Europe/Lisbon 15 * * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('library-stale-uploads'),
  },
  async ({ step }) =>
    step.run('sweep-stale-uploads', () =>
      sweepStaleUploads({
        contexts: { withUserContext, withSystemContext },
        storage: createSupabaseLibraryStorage(),
      }),
    ),
);

export const LIBRARY_FUNCTIONS = [staleUploads];
