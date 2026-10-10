import { uploadToSignedUrl } from '@/components/proofing/upload';
import { MAX_LIBRARY_BYTES, MAX_UPLOAD_BATCH } from '@/modules/library';

export type ActionResult = { ok: true } | { ok: false; code: string };

export type StartUploads = (
  folderId: string,
  files: { path: string; sizeBytes: number }[],
) => Promise<
  | { ok: true; uploads: { fileId: string; path: string; uploadUrl: string }[] }
  | { ok: false; code: string }
>;

export type UploadOutcome = { uploaded: number; rejected: number; error: string | null };

/** The path a file is uploaded under: its place inside a chosen folder, or its name. */
function uploadPath(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * Uploads files into a folder in batches: the server hands out signed links (creating the
 * subfolders of a folder upload), the bytes go straight to storage and each file is confirmed.
 * A failed transfer is still confirmed, so the server closes the file instead of leaving it
 * uploading. Files over the size limit are counted as refused and never sent.
 */
export async function uploadFiles(
  folderId: string,
  files: File[],
  actions: { startUploads: StartUploads; finishUpload: (fileId: string) => Promise<ActionResult> },
  onProgress: (done: number, total: number) => void,
): Promise<UploadOutcome> {
  const accepted = files.filter((file) => file.size > 0 && file.size <= MAX_LIBRARY_BYTES);
  const outcome: UploadOutcome = {
    uploaded: 0,
    rejected: files.length - accepted.length,
    error: null,
  };
  let done = 0;
  onProgress(done, accepted.length);
  for (let start = 0; start < accepted.length; start += MAX_UPLOAD_BATCH) {
    const batch = accepted.slice(start, start + MAX_UPLOAD_BATCH);
    const started = await actions
      .startUploads(
        folderId,
        batch.map((file) => ({ path: uploadPath(file), sizeBytes: file.size })),
      )
      .catch(() => ({ ok: false as const, code: 'upload_failed' }));
    if (!started.ok) return { ...outcome, error: started.code };
    for (const [index, upload] of started.uploads.entries()) {
      const file = batch[index];
      const sent = file ? await uploadToSignedUrl(upload.uploadUrl, file) : false;
      const finished = await actions
        .finishUpload(upload.fileId)
        .catch(() => ({ ok: false as const, code: 'upload_failed' }));
      if (!sent) outcome.error = 'upload_failed';
      else if (finished.ok) outcome.uploaded += 1;
      else outcome.rejected += 1;
      done += 1;
      onProgress(done, accepted.length);
    }
  }
  return outcome;
}
