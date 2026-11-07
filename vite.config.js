import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (GitHub Pages, itch.io, etc.).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 3000 },
});
