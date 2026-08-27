import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* 🩺 CARIMBO DA VERSÃO (27/08): o master perguntou várias vezes "não está
   subindo?". Agora a hora do build entra dentro do próprio bundle — se a tela
   mostra uma hora antiga, o problema é o deploy, não o código. */
const BUILD_AT = new Date().toISOString();

export default defineConfig({
  define: { __VH_BUILD__: JSON.stringify(BUILD_AT) },
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT || 4173,
    // '.vittalissaude.com.br' libera vittahub.vittalissaude.com.br e  qualquer
    // outro subdomínio futuro (www, app, etc.)
    allowedHosts: ['.up.railway.app', '.vittalissaude.com.br', 'localhost']
  }
});
 