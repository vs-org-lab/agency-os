import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const localEnv = path.join(repositoryRoot, '.env.local');

if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv, quiet: true });
}
