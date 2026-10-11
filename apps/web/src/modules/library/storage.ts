export type LibraryStorage = {
  createUploadUrl(path: string): Promise<string>;
  download(path: string): Promise<Uint8Array | null>;
  /** A link that downloads the object under its original name. */
  signedDownloadUrl(path: string, ttlSeconds: number, fileName: string): Promise<string>;
  /** A link that opens the object in the browser, for previews. */
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
  removeMany(paths: string[]): Promise<void>;
};

export const LIBRARY_BUCKET = 'library';

export function libraryPath(input: {
  organizationId: string;
  clientId: string;
  projectId: string;
  fileId: string;
}): string {
  return [input.organizationId, input.clientId, input.projectId, input.fileId].join('/');
}
