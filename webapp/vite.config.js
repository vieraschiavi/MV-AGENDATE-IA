import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La SPA se sirve desde el mismo Express del producto, montada en /app/
// (el build cae en public/app/, que express.static ya sirve solo).
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/logo-mv.svg': 'http://localhost:3000',
      '/logo-mv.png': 'http://localhost:3000',
    },
  },
});
