import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // React 19 automatic JSX runtime — esbuild emits the
  // jsx-runtime imports so test files don't need to import React.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': resolve(here, '.'),
      '@buena/shared': resolve(here, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    // Per-file environment via the `// @vitest-environment jsdom`
    // directive at the top of component tests. Pure-logic tests
    // run in node by default so they stay fast.
    environment: 'node',
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./__tests__/setup.ts'],
  },
});
