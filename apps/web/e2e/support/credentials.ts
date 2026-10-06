import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type E2ECredentials = {
  organizationId: string;
  clientId: string;
  founder: { email: string; password: string; totpSecret: string };
  client: { email: string };
};

export const CREDENTIALS_PATH = path.resolve(import.meta.dirname, '../.auth/credentials.json');

export function readCredentials(): E2ECredentials {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error('Run `pnpm --filter web e2e:seed` before the end-to-end tests');
  }
  return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as E2ECredentials;
}

export function writeCredentials(credentials: E2ECredentials): void {
  mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
}
