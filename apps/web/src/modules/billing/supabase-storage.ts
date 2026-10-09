import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import { BILLING_BUCKET, type BillingStorage } from './storage';

export function createSupabaseBillingStorage(): BillingStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(BILLING_BUCKET);
  return {
    async upload(path, bytes) {
      const { error } = await bucket().upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (error) throw new Error(`Billing upload failed: ${error.message}`);
    },
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) throw new Error(`Billing link failed: ${error?.message ?? 'no data'}`);
      return data.signedUrl;
    },
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
      if (error || !data) {
        throw new Error(`Billing upload link failed: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
