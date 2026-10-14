import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import { LIBRARY_BUCKET, type LibraryStorage } from './storage';

/** Supabase Storage removes at most this many objects per request. */
const REMOVE_BATCH = 1000;

export function createSupabaseLibraryStorage(): LibraryStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(LIBRARY_BUCKET);
  const signed = async (path: string, ttlSeconds: number, download?: string) => {
    const { data, error } = await bucket().createSignedUrl(
      path,
      ttlSeconds,
      download ? { download } : undefined,
    );
    if (error || !data) throw new Error(`Library link failed: ${error?.message ?? 'no data'}`);
    return data.signedUrl;
  };
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
      if (error || !data) {
        throw new Error(`Library upload link failed: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    signedDownloadUrl: (path, ttlSeconds, fileName) => signed(path, ttlSeconds, fileName),
    signedUrl: (path, ttlSeconds) => signed(path, ttlSeconds),
    async upload(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Library upload failed: ${error.message}`);
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw new Error(`Library removal failed: ${error.message}`);
    },
    async removeMany(paths) {
      for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
        const { error } = await bucket().remove(paths.slice(start, start + REMOVE_BATCH));
        if (error) throw new Error(`Library removal failed: ${error.message}`);
      }
    },
  };
}
