import 'server-only';
import type { BucketStorage } from './bucket-storage';
import { createSupabaseAdminClient } from './supabase-server';

export function createSupabaseBucketStorage(bucketId: string): BucketStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(bucketId);
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(`Upload link failed for ${bucketId}: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async objectSize(path) {
      const { data } = await bucket().info(path);
      return data ? (data.size ?? 0) : null;
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) {
        throw new Error(`Download failed for ${bucketId}: ${error?.message ?? 'no data'}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) {
        throw new Error(`Signed link failed for ${bucketId}: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`Removal failed for ${bucketId}: ${error.message}`);
    },
  };
}
