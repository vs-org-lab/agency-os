import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const webSource = path.resolve(import.meta.dirname, 'apps/web/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': webSource,
      'server-only': path.resolve(import.meta.dirname, 'apps/web/test/server-only.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/db/**', '**/node_modules/**', '**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['packages/db/test/**/*.test.ts', 'apps/*/src/**/*.db.test.ts'],
          fileParallelism: false,
          setupFiles: ['packages/db/src/testing/load-env.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
