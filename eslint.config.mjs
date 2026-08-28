import eslint from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  {
    files: ['*.config.{js,mjs,ts}', 'eslint.config.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
  globalIgnores([
    '.next/**',
    'coverage/**',
    'next-env.d.ts',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
