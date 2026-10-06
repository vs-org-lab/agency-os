import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/db/**', '**/node_modules/**', '**/*.db.test.ts'],
        },
      },
      {
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
