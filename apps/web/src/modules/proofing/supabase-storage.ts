import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import { PROOFS_BUCKET, type ProofStorage } from './storage';

export function createSupabaseProofStorage(): ProofStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(PROOFS_BUCKET);
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
      if (error || !data) {
        throw new Error(`Proof upload link failed: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) throw new Error(`Proof link failed: ${error?.message ?? 'no data'}`);
      return data.signedUrl;
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw new Error(`Proof removal failed: ${error.message}`);
    },
  };
}
