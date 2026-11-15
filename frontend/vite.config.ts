import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // In der Entwicklung läuft die API getrennt (backend: npm run dev, Port 3001).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
