export type RecordingStorage = {
  createUploadUrl(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  download(path: string): Promise<Uint8Array>;
  remove(paths: string[]): Promise<void>;
};

export const RECORDINGS_BUCKET = 'core-recordings';

/** Supabase signed upload URLs are valid for two hours. */
export const RECORDING_UPLOAD_TTL_SECONDS = 7200;

export const MAX_RECORDING_BYTES = 26_214_400;

export const RECORDING_EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
} as const;

export type RecordingContentType = keyof typeof RECORDING_EXTENSIONS;

export function isRecordingContentType(value: string): value is RecordingContentType {
  return Object.hasOwn(RECORDING_EXTENSIONS, value);
}

export function contentTypeForPath(path: string): RecordingContentType {
  const extension = path.slice(path.lastIndexOf('.') + 1);
  const match = Object.entries(RECORDING_EXTENSIONS).find(([, value]) => value === extension);
  return (match?.[0] as RecordingContentType | undefined) ?? 'audio/webm';
}
