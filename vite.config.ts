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
    rollupOptions: {
      external: ['@protobuf-ts/runtime', '@types/geojson'],
      output: {
        entryFileNames: 'index.js',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      include: ['src'],
    }),
  ],
});
