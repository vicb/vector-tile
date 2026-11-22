import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: ['@protobuf-ts/runtime', '@types/geojson'],
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      include: ['src'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/test-helper.ts', 'src/fixtures/**'],
    }),
  ],
});
