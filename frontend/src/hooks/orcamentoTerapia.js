// Gerador de ORÇAMENTO DE TERAPIAS — documento branded (logo Vittalis) com
// opção de TEMA INFANTIL, listando as sessões de cada terapia. Renderiza em um
// modal com iframe (nunca sai da página) e permite Imprimir / salvar em PDF.
// 100% client-side — não depende de Puppeteer nem de outro serviço.

const C = { teal: '#0E8C96', ciano: '#00B8C0', deep: '#06424A', gold: '#C4973B', cinza: '#64748b', borda: '#e2e8f0', claro: '#f1f5f9' };

// Temas infantis (emoji, sem depender de imagens externas) — cada um com 2 cores.
export const TEMAS_TERAPIA = {
  none: { nome: 'Sem tema', emojis: '', cor1: C.teal, cor2: C.ciano },
  foguete: { nome: 'Espaço', emojis: '🚀 ⭐ 🪐 🌙 ✨ 🛸 ⭐ 🚀', cor1: '#6366f1', cor2: '#0ea5e9' },
  oceano: { nome: 'Oceano', emojis: '🐠 🐳 🌊 🐙 🐚 🐢 🌊 🐠', cor1: '#0ea5e9', cor2: '#06b6d4' },
  safari: { nome: 'Safari', emojis: '🦁 🐘 🦒 🦓 🐅 🐵 🌿 🦁', cor1: '#f59e0b', cor2: '#84cc16' },
  dino: { nome: 'Dinossauros', emojis: '🦕 🦖 🌋 🌴 🥚 🦴 🌿 🦕', cor1: '#16a34a', cor2: '#f59e0b' },
  princesa: { nome: 'Castelo', emojis: '👑 🏰 ✨ 🦄 🌟 💎 🎀 👑', cor1: '#ec4899', cor2: '#a855f7' },
  circo: { nome: 'Circo', emojis: '🎪 🎈 🤹 🎠 🍿 🎉 🎈 🎪', cor1: '#ef4444', cor2: '#f59e0b' },
  jardim: { nome: 'Jardim', emojis: '🌸 🦋 🌈 🐝 🌻 🐞 🌼 🌸', cor1: '#ec4899', cor2: '#22c55e' },
};

const moedaBR = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function faixaEmoji(t) {
  if (!t || !t.emojis) return '';
  return `<div style="background:linear-gradient(90deg,${t.cor1},${t.cor2});border-radius:14px;padding:8px 0;text-align:center;font-size:20px;letter-spacing:6px;margin:12px 0;box-shadow:0 4px 12px rgba(0,0,0,0.08)">${t.emojis}</div>`;
}

// dados: { paciente, responsavel, tema, itens:[{terapia, sessoes, valorSessao}], descontoRaw, parcelas, observacoes, atendente }
export function montarHtml(dados) {
  const t = TEMAS_TERAPIA[dados.tema] || TEMAS_TERAPIA.none;
  const itens = (dados.itens || []).filter(i => i.terapia && (Number(i.sessoes) > 0));
  const bruto = itens.reduce((s, i) => s + (Number(i.sessoes) || 0) * (Number(i.valorSessao) || 0), 0);
  const desconto = Math.min(Number(dados.descontoRaw) || 0, bruto);
  const totalAvista = Math.max(0, bruto - desconto);
  const parcelas = Math.max(1, Number(dados.parcelas) || 1);
  const valorParcela = totalAvista / parcelas;
  const totalSessoes = itens.reduce((s, i) => s + (Number(i.sessoes) || 0), 0);
  const hoje = new Date().toLocaleDateString('pt-BR');
  const temTema = dados.tema && dados.tema !== 'none';
  const bordaTema = temTema ? `border:3px solid ${t.cor1};border-radius:18px;padding:16px;` : '';

  const linhas = itens.map(i => {
    const sub = (Number(i.sessoes) || 0) * (Number(i.valorSessao) || 0);
    return `<tr>
      <td><b>${esc(i.terapia)}</b></td>
      <td style="text-align:center">${Number(i.sessoes) || 0}</td>
      <td style="text-align:right">${moedaBR(i.valorSessao)}</td>
      <td style="text-align:right;font-weight:700;color:${C.teal}">${moedaBR(sub)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Orçamento de Terapias</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;background:#fff;padding:30px 40px 70px}
    @media print{@page{margin:1.1cm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding-top:12px}}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid ${C.ciano}}
    .header img{height:52px}
    .header .info{text-align:right;font-size:11px;color:${C.cinza};line-height:1.6}
    .header .info .clinica{font-size:15px;font-weight:800;color:${C.deep}}
    .doc-tipo{background:linear-gradient(135deg,${C.ciano},${C.deep});color:#fff;padding:11px 20px;border-radius:10px;font-size:15px;font-weight:800;text-align:center;letter-spacing:1px;text-transform:uppercase;margin:16px 0}
    .pbox{background:${C.claro};border:1px solid ${C.borda};border-radius:12px;padding:13px 16px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px}
    .pbox .campo{display:flex;gap:6px}.pbox .label{color:${C.cinza};font-weight:700;min-width:92px}
    table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:13px;border-radius:10px;overflow:hidden}
    thead th{background:${C.deep};color:#fff;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase}
    thead th:nth-child(2){text-align:center}thead th:nth-child(3),thead th:nth-child(4){text-align:right}
    tbody td{padding:10px 12px;border-bottom:1px solid ${C.borda}}
    tbody tr:nth-child(even){background:#f8fafc}
    .totais{margin-top:6px;display:flex;justify-content:flex-end}
    .totais .box{min-width:300px;background:${C.claro};border-radius:12px;padding:14px 18px}
    .totais .lin{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:${C.cinza}}
    .totais .lin b{color:#1e293b}
    .totais .grande{background:linear-gradient(135deg,${C.ciano}1a,${C.deep}14);border-radius:10px;margin-top:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:16px}
    .totais .grande span:first-child{white-space:nowrap}
    .totais .grande .v{font-size:24px;font-weight:800;color:${C.deep};font-family:monospace}
    .cartao{margin-top:8px;text-align:center;font-size:13px;color:${C.cinza}}
    .cartao b{color:${C.teal};font-size:15px}
    .obs{margin-top:16px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px}
    .footer{position:fixed;bottom:16px;left:40px;right:40px;text-align:center;font-size:10.5px;color:#94a3b8;border-top:1px solid ${C.borda};padding-top:8px}
    .footer b{color:${C.ciano};font-style:italic}
  </style></head><body>
  <div style="${bordaTema}">
    ${faixaEmoji(t)}
    <div class="header">
      <img src="/logos/logo-h-color.png" alt="Vittalis Saúde"/>
      <div class="info"><div class="clinica">Vittalis Saúde</div><div>Clínica Multidisciplinar Infantil</div><div>São Luís — MA · (98) 98422-1002</div></div>
    </div>
    <div class="doc-tipo">Orçamento de Terapias</div>
    <div class="pbox">
      <div class="campo"><span class="label">Paciente:</span><span>${esc(dados.paciente) || '—'}</span></div>
      <div class="campo"><span class="label">Responsável:</span><span>${esc(dados.responsavel) || '—'}</span></div>
      <div class="campo"><span class="label">Data:</span><span>${hoje}</span></div>
      <div class="campo"><span class="label">Atendente:</span><span>${esc(dados.atendente) || '—'}</span></div>
    </div>
    <table>
      <thead><tr><th>Terapia</th><th>Sessões</th><th>Valor / sessão</th><th>Subtotal</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">Nenhuma sessão adicionada</td></tr>`}</tbody>
    </table>
    <div class="totais"><div class="box">
      <div class="lin"><span>Total de sessões</span><b>${totalSessoes}</b></div>
      <div class="lin"><span>Valor bruto</span><b>${moedaBR(bruto)}</b></div>
      ${desconto > 0 ? `<div class="lin"><span>Desconto</span><b style="color:#16a34a">− ${moedaBR(desconto)}</b></div>` : ''}
      <div class="grande"><span style="font-weight:800;color:${C.deep}">TOTAL À VISTA</span><span class="v">${moedaBR(totalAvista)}</span></div>
      ${parcelas > 1 ? `<div class="cartao">ou <b>${parcelas}x de ${moedaBR(valorParcela)}</b> no cartão sem juros</div>` : ''}
    </div></div>
    ${dados.observacoes ? `<div class="obs"><b>Observações:</b><br/>${esc(dados.observacoes)}</div>` : ''}
    ${faixaEmoji(t)}
  </div>
  <div class="footer"><b>Sua vida é preciosa</b> · Vittalis Saúde — São Luís/MA · Orçamento gerado em ${hoje}</div>
  </body></html>`;
}

export function gerarOrcamentoTerapia(dados) {
  const html = montarHtml(dados);
  const old = document.getElementById('orc-terapia-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'orc-terapia-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.68);z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px)';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:18px;width:860px;max-width:96vw;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 70px rgba(0,0,0,0.4)';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0';
  bar.innerHTML = `<span style="font-weight:800;color:#06424A;font-size:14px">📄 Pré-visualização do orçamento</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="orcPrint" style="padding:9px 14px;background:linear-gradient(135deg,#00B8C0,#06424A);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
      <button id="orcClose" style="padding:9px 14px;background:#e2e8f0;color:#475569;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">✕ Fechar</button>
    </div>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'flex:1;border:none;width:100%;background:#fff';
  frame.srcdoc = html;

  box.appendChild(bar); box.appendChild(frame); overlay.appendChild(box); document.body.appendChild(overlay);
  document.getElementById('orcClose').onclick = () => overlay.remove();
  document.getElementById('orcPrint').onclick = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
