import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@plan2quote/core': r('./packages/core/src/index.ts'),
      '@plan2quote/geometry': r('./packages/geometry/src/index.ts'),
      '@plan2quote/classify': r('./packages/classify/src/index.ts'),
      '@plan2quote/parsers': r('./packages/parsers/src/index.ts'),
    },
  },
});
