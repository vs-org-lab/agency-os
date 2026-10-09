export type BillingStorage = {
  upload(path: string, bytes: Uint8Array): Promise<void>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  createUploadUrl(path: string): Promise<string>;
  download(path: string): Promise<Uint8Array | null>;
};

export const BILLING_BUCKET = 'billing';

export const BILLING_URL_TTL_SECONDS = 300;

export const MAX_BILLING_PDF_BYTES = 10_485_760;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** True when the bytes start with the PDF header ("%PDF-") and fit the bucket limit. */
export function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length <= MAX_BILLING_PDF_BYTES &&
    PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

export function requestPdfPath(
  organizationId: string,
  clientId: string,
  requestId: string,
): string {
  return `${organizationId}/${clientId}/requests/${requestId}.pdf`;
}

/** Folder of a request's legal invoice uploads; each upload link adds a file of its own. */
export function legalInvoiceFolder(
  organizationId: string,
  clientId: string,
  requestId: string,
): string {
  return `${organizationId}/${clientId}/invoices/${requestId}/`;
}

export type MemoryBillingStorage = BillingStorage & { files: Map<string, Uint8Array> };

export function createMemoryBillingStorage(): MemoryBillingStorage {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async upload(path, bytes) {
      files.set(path, bytes);
    },
    async signedUrl(path, ttlSeconds) {
      if (!files.has(path)) throw new Error(`Billing file ${path} was not found`);
      return `memory://${path}?ttl=${ttlSeconds}`;
    },
    async createUploadUrl(path) {
      return `memory://upload/${path}`;
    },
    async download(path) {
      return files.get(path) ?? null;
    },
  };
}
