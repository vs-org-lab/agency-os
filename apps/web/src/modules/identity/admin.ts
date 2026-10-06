import { createClient } from '@supabase/supabase-js';
import type { DbContexts } from '@/platform/db';
import { lookupUserIdByEmail, type AdminPort } from './invitations';

export function createSupabaseAdminPort(
  config: { url: string; secretKey: string },
  contexts: Pick<DbContexts, 'withSystemContext'>,
): AdminPort {
  const admin = createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  return {
    async inviteUserByEmail(email, options) {
      const { data, error } = await admin.inviteUserByEmail(email, options);
      if (data.user) return { userId: data.user.id };

      const existing = await lookupUserIdByEmail(contexts, email);
      if (existing) return { userId: existing };
      throw new Error('User invitation failed', { cause: error ?? undefined });
    },
  };
}
