import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
      '@obsidian-workspace/shared-types': path.resolve(
        __dirname,
        'packages/shared-types/src/index.ts'
      ),
      '@obsidian-workspace/test-utils': path.resolve(
        __dirname,
        'packages/test-utils/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 10000,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        'esbuild.config.mjs',
        'version-bump.mjs',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
