import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      exclude: ['src/fixtures/**', 'src/test-helper.ts', 'dist/**'],
    },
  },
});
