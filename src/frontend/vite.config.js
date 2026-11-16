import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } } },
  test: {
    // Keep the desktop responsive while running jsdom alongside PostgreSQL and NestJS.
    maxWorkers: 2,
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
  },
});
