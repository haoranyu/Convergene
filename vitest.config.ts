import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDirectory, 'src'),
      'server-only': path.resolve(rootDirectory, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
