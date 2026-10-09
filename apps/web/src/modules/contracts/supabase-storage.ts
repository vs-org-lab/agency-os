import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import { CONTRACTS_BUCKET, type ContractStorage } from './storage';

export function createSupabaseContractStorage(): ContractStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(CONTRACTS_BUCKET);
  return {
    async upload(path, bytes) {
      const { error } = await bucket().upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (error) throw new Error(`Contract upload failed: ${error.message}`);
    },
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) throw new Error(`Contract link failed: ${error?.message ?? 'no data'}`);
      return data.signedUrl;
    },
  };
}
