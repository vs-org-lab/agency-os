import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import type { EvidenceStorage } from './port';

export const EVIDENCE_BUCKET = 'core-evidence';

export function createSupabaseEvidenceStorage(): EvidenceStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(EVIDENCE_BUCKET);
  return {
    async upload(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Evidence upload failed: ${error.message}`);
    },
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) throw new Error(`Evidence link failed: ${error?.message ?? 'no data'}`);
      return data.signedUrl;
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw new Error(`Evidence removal failed: ${error.message}`);
    },
  };
}
