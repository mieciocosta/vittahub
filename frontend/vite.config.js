import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },

  preview: {
    host: '0.0.0.0',
    port: process.env.PORT || 4173,
    allowedHosts: [
      'vittahub-frontend-production.up.railway.app',
      '.up.railway.app'
    ]
  }
});