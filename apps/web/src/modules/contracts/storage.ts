export type ContractStorage = {
  upload(path: string, bytes: Uint8Array): Promise<void>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
};

export const CONTRACTS_BUCKET = 'contracts';

export const CONTRACT_URL_TTL_SECONDS = 300;

export type MemoryContractStorage = ContractStorage & { files: Map<string, Uint8Array> };

export function createMemoryContractStorage(): MemoryContractStorage {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async upload(path, bytes) {
      files.set(path, bytes);
    },
    async signedUrl(path, ttlSeconds) {
      if (!files.has(path)) throw new Error(`Contract ${path} was not found`);
      return `memory://${path}?ttl=${ttlSeconds}`;
    },
  };
}
