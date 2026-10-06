import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { importX } from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const moduleBoundary = {
  patterns: [
    {
      regex: '^@/modules/[^/]+/.+',
      message: 'Import modules through their public entry point (@/modules/<name>).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '.superpowers/**',
      'supabase/migrations/**',
      'References/**',
      'Software/**',
      'Documents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': ['error', moduleBoundary],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { react },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19.0' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react/prop-types': 'off',
    },
  },
  {
    files: ['apps/*/src/**/*.tsx', 'packages/ui/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
  prettier,
);
