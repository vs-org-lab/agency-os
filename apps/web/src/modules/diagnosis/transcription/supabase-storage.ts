import 'server-only';
import { createSupabaseAdminClient } from '@/platform/supabase-server';
import { RECORDINGS_BUCKET, type RecordingStorage } from './storage';

export function createSupabaseRecordingStorage(): RecordingStorage {
  const bucket = () => createSupabaseAdminClient().storage.from(RECORDINGS_BUCKET);
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(`Recording upload link failed: ${error?.message ?? 'no data'}`);
      }
      return data.signedUrl;
    },
    async exists(path) {
      // A missing object resolves to false; transport failures are thrown by the client.
      const { data } = await bucket().exists(path);
      return data;
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) {
        throw new Error(`Recording download failed: ${error?.message ?? 'no data'}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`Recording removal failed: ${error.message}`);
    },
  };
}
