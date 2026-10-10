/** Uploads a file to a Supabase signed upload URL the way the storage client does. */
export async function uploadToSignedUrl(url: string, file: File): Promise<boolean> {
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);
  const response = await fetch(url, {
    method: 'PUT',
    body: form,
    headers: { 'x-upsert': 'false' },
  }).catch(() => null);
  return response?.ok ?? false;
}

export const ACCEPTED_PROOF_TYPES =
  'image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/webm';

export const MAX_PROOF_UPLOAD_BYTES = 52_428_800;
