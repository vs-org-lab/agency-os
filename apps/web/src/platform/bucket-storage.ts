/** A private storage bucket reached only through signed links issued by the server. */
export type BucketStorage = {
  createUploadUrl(path: string): Promise<string>;
  /** The stored object's size in bytes, or null when nothing was uploaded to the path. */
  objectSize(path: string): Promise<number | null>;
  download(path: string): Promise<Uint8Array>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(paths: string[]): Promise<void>;
};

/** SEC-31: files are served by links that expire in 15 minutes. */
export const MEDIA_LINK_TTL_SECONDS = 900;
