import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

/* 🚨 CAÇADOR DE TELA BRANCA (01/09: "o CRM está com problema... aparece tela
   branca").

   Este pedaço roda FORA do React de propósito. Quando o React morre inteiro,
   nada que estiver dentro dele consegue avisar — a tela simplesmente apaga e
   ninguém descobre o motivo. Aqui é JavaScript puro escrevendo direto no
   documento: mesmo com o app derrubado, a barra aparece com o erro, o arquivo
   e a linha, e um botão de copiar pra mandar pra mim.

   Não some sozinho e não atrapalha: fica no rodapé, e tem o X pra fechar. */
function mostrarErroNaTela(titulo, detalhe) {
  try {
    if (document.getElementById('vh-erro-global')) return;   // um aviso por vez
    const cx = document.createElement('div');
    cx.id = 'vh-erro-global';
    cx.setAttribute('style', [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:99999',
      'background:#fef2f2', 'border:1.5px solid #fecaca', 'border-radius:12px',
      'padding:12px 14px', 'box-shadow:0 6px 24px rgba(0,0,0,.18)',
      'font:500 12.5px/1.5 system-ui,-apple-system,Segoe UI,sans-serif', 'color:#7f1d1d',
      'max-height:44vh', 'overflow:auto',
    ].join(';'));
    const texto = `${titulo}\n${detalhe}`;
    cx.innerHTML =
      '<div style="display:flex;gap:8px;align-items:flex-start">'
      + '<div style="flex:1;min-width:0">'
      + '<b style="display:block;font-size:13px;margin-bottom:3px">⚠️ O sistema tropeçou aqui</b>'
      + '<div style="font-size:11.5px;color:#991b1b;white-space:pre-wrap;word-break:break-word"></div>'
      + '</div>'
      + '<button id="vh-erro-copiar" style="border:1.5px solid #fecaca;background:#fff;color:#b91c1c;'
      + 'border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap">📋 Copiar</button>'
      + '<button id="vh-erro-fechar" style="border:none;background:transparent;color:#b91c1c;'
      + 'font-size:16px;font-weight:800;cursor:pointer;line-height:1">×</button>'
      + '</div>';
    cx.querySelector('div > div > div').textContent = texto;
    document.body.appendChild(cx);
    cx.querySelector('#vh-erro-fechar').onclick = () => cx.remove();
    cx.querySelector('#vh-erro-copiar').onclick = () => {
      try { navigator.clipboard.writeText(texto); cx.querySelector('#vh-erro-copiar').textContent = '✅ Copiado'; } catch { /* ok */ }
    };
  } catch { /* se nem isso der, paciência: o console ainda tem o erro */ }
}

window.addEventListener('error', (e) => {
  const err = e.error || {};
  mostrarErroNaTela('Erro de tela',
    `${e.message || err.message || 'erro desconhecido'}\n${e.filename || ''}:${e.lineno || '?'}\n${(err.stack || '').split('\n').slice(0, 4).join('\n')}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason || {};
  mostrarErroNaTela('Falha em segundo plano',
    `${r.message || String(r)}\n${(r.stack || '').split('\n').slice(0, 4).join('\n')}`);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
