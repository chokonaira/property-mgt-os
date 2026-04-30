import { defineConfig } from 'vitest/config';

// Force TypeScript resolution first so any stray .js artefacts from a
// previous build don't shadow the source-of-truth .ts files when
// vitest resolves relative imports.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
