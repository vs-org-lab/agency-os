import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const localEnv = path.resolve(import.meta.dirname, '../../../.env.local');
if (existsSync(localEnv)) dotenv.config({ path: localEnv, quiet: true });
