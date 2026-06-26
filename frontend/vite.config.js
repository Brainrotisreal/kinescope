import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative assets are loaded correctly in local desktop build
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173
  }
});
