import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webSource = path.resolve(import.meta.dirname, 'apps/web/src');

export default defineConfig({
  resolve: {
    alias: { '@': webSource },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
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
