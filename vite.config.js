import { defineConfig } from 'vite';

// Source entry is dev.html. `npm run build` bundles it and scripts/make-playable.mjs
// inlines everything into the root anger-issues.html, a single file that plays anywhere
// (double-click, GitHub Pages, any static host) with no server or build step.
export default defineConfig({
  base: './',
  server: { open: '/dev.html' },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: 'dev.html', output: { inlineDynamicImports: true } },
  },
});
