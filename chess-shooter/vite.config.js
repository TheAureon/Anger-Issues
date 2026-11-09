import { defineConfig } from 'vite';

// Gunmate (chess shooter). `npm run build:chess` bundles chess-shooter/dev.html and
// scripts/make-playable.mjs inlines it into the root index.html (one self-contained file).
export default defineConfig({
  root: 'chess-shooter',
  base: './',
  server: { open: '/dev.html' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: 'chess-shooter/dev.html', output: { inlineDynamicImports: true } },
  },
});
