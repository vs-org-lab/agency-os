import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

if (existsSync('../../.env.local')) {
  dotenv.config({ path: '../../.env.local', quiet: true });
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  schemaFilter: ['public', 'app'],
  migrations: {
    prefix: 'supabase',
  },
  entities: {
    roles: {
      provider: 'supabase',
    },
  },
  dbCredentials: {
    url: process.env.DATABASE_DIRECT_URL ?? '',
  },
});
