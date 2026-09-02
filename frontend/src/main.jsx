import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

/* 🚨 CAÇADOR DE ERRO — AGORA SEM BARRA NA TELA

   Ele nasceu no dia da tela branca, quando o CRM apagava sem dizer o motivo.
   Mostrava uma barra vermelha no rodapé com o erro, e foi útil: era ali que o
   nome do arquivo e a linha apareciam.

   01/09, ordem do master: "tem uma barra vermelha e vinho e quero que você
   tire". Então a barra saiu — mas a captura FICA. O erro continua indo pro
   console do navegador e guardado em `window.__vhUltimoErro`, que é onde eu
   procuro quando algo quebra. Some da vista de quem está atendendo; continua
   à mão de quem precisa consertar. */
function guardarErro(titulo, detalhe) {
  try {
    const registro = { titulo, detalhe, quando: new Date().toISOString() };
    window.__vhUltimoErro = registro;
    window.__vhErros = [...(window.__vhErros || []).slice(-19), registro];
    console.error(`[VittaHub] ${titulo}`, detalhe);
  } catch { /* se nem isso der, o console do navegador ainda tem o erro */ }
}

window.addEventListener('error', (e) => {
  const err = e.error || {};
  guardarErro('Erro de tela',
    `${e.message || err.message || 'erro desconhecido'}\n${e.filename || ''}:${e.lineno || '?'}\n${(err.stack || '').split('\n').slice(0, 4).join('\n')}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason || {};
  guardarErro('Falha em segundo plano',
    `${r.message || String(r)}\n${(r.stack || '').split('\n').slice(0, 4).join('\n')}`);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
