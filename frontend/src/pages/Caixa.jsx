import React, { useEffect, useState, useRef } from 'react';
import { Wallet, Paperclip, FileText, X, Check, Download, Eye, Search, Filter, Image as ImageIcon, CheckCircle2, Circle, FileSpreadsheet, Printer, Sparkles, AlertTriangle, Pencil, HandCoins, TrendingDown, TrendingUp, Plus, Trash2, CalendarCheck, Gift } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { Toast } from '../hooks/toast.js';   // avisos do relatório com comprovantes
import { fmt, hojeLocalISO } from '../hooks/utils.js';

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/* CAIXA — livro de todas as vendas registradas. Cada venda pode receber o
   comprovante de pagamento (imagem ou PDF). Gestão vê tudo; atendente vê as suas. */

const STATUS_INFO = {
  pago:        { label: 'Pago',        cor: '#16a34a', bg: '#e7f8ef' },
  cortesia:    { label: 'Cortesia',    cor: '#0891b2', bg: '#e4f6fb' },
  sinal:       { label: 'Sinal',       cor: '#d97706', bg: '#fdf3e5' },
  parcelado:   { label: 'Parcelado',   cor: '#7c3aed', bg: '#f2ecfe' },
  aguardando:  { label: 'Aguardando',  cor: '#e8991a', bg: '#fef8eb' },
  pendente:    { label: 'Pendente',    cor: '#e84040', bg: '#fdecec' },
};
const SETOR_COR = { vacinas: '#7c5cbf', consultas: '#00B8C0', terapias: '#C4973B' };
const DESPESA_CATS = ['Repasse', 'Insumos', 'Salário', 'Aluguel', 'Marketing', 'Imposto', 'Manutenção', 'Outros'];
const FORMAS = ['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado', 'Cortesia'];

function mesAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmtData(s) { if (!s) return '—'; const d = String(s).slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s; }

export default function Caixa() {
  const api = useApi();
  const { user } = useAuth();
  const gestao = user?.role === 'master' || user?.role === 'supervisor';
  // 🔒 Fechamento DIÁRIO (caixa + estoque) — rotina de fim de dia
  const hojeDiaISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [diaSel, setDiaSel] = useState(hojeDiaISO());
  const [fd, setFd] = useState(null);            // dados do fechamento do dia
  const [fdBusy, setFdBusy] = useState(false);
  const [dinContado, setDinContado] = useState('');
  const [fdObs, setFdObs] = useState('');
  const [estContado, setEstContado] = useState({});   // vacina → saldo contado
  const abrirDia = async (d) => {
    const alvo = d || diaSel;
    setDiaSel(alvo); setFd({ carregando: true }); setDinContado(''); setFdObs(''); setEstContado({});
    try {
      const r = await api.get(`/extras/fechamento-diario?data=${alvo}`);
      setFd(r);
      if (r.fechado) {
        setDinContado(r.caixa?.dinheiro_contado ?? '');
        setFdObs(r.observacao || '');
        setEstContado(Object.fromEntries((r.estoque || []).map(e => [e.vacina, e.contado ?? ''])));
      }
    } catch (e) { setFd({ erro: e.message }); }
  };
  const fecharDia = async () => {
    if (!window.confirm(`Fechar o caixa e o estoque de ${diaSel.split('-').reverse().join('/')}?\n\nOs números ficam congelados como a conferência oficial do dia.`)) return;
    setFdBusy(true);
    try {
      const estoque = (fd.estoque || []).map(e => ({ ...e, contado: estContado[e.vacina] === '' || estContado[e.vacina] == null ? null : parseInt(estContado[e.vacina]) }));
      const r = await api.post('/extras/fechamento-diario', { data: diaSel, dados: fd, estoque, dinheiro_contado: dinContado === '' ? null : parseFloat(String(dinContado).replace(',', '.')), observacao: fdObs });
      setFd(r);
    } catch (e) { window.alert('Erro: ' + e.message); }
    setFdBusy(false);
  };
  const imprimirDia = () => {
    if (!fd || fd.carregando || fd.erro) return;
    const w = window.open('', '_blank'); if (!w) return;
    const c = fd.caixa || {};
    const formas = (c.formas || []).map(f2 => `<tr><td>${f2.forma}</td><td class="c">${f2.n}</td>
      <td class="r">${fmt.brl(f2.recebido)}</td><td class="r">${fmt.brl(f2.a_receber)}</td></tr>`).join('');
    const est = (fd.estoque || []).map(e => {
      const cont = estContado[e.vacina] ?? e.contado;
      return `<tr><td>${e.vacina}</td><td class="c">${e.previstas}</td><td class="c"><b>${e.aplicadas}</b></td>
        <td class="c">${cont ?? ''}</td></tr>`;
    }).join('');
    const dif = c.diferenca ?? (dinContado !== '' ? (parseFloat(String(dinContado).replace(',', '.')) - Number(c.dinheiro_esperado || 0)) : null);
    w.document.write(`<html><head><title>Fechamento do dia ${fd.data}</title><meta charset="utf-8">
      <style>@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0}
      h1{color:#0E8C96;margin:0 0 2px;font-size:20px}h2{font-size:13px;margin:16px 0 6px}
      .sub{color:#64748b;font-size:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th{background:#0E8C96;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
      td{border:1px solid #dbe3ea;padding:6px 8px}td.c{text-align:center}td.r{text-align:right}
      .box{display:flex;gap:10px;margin:12px 0;flex-wrap:wrap}
      .box div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;font-size:12px}
      .box b{display:block;font-size:15px;color:#0E8C96}
      .dif{color:${dif ? '#b91c1c' : '#15803d'};font-weight:bold}
      .obs{margin-top:12px;font-size:11.5px;border:1px solid #dbe3ea;border-radius:8px;padding:9px 12px;min-height:38px}
      .ass{margin-top:30px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #94a3b8;padding-top:5px;font-size:10.5px;color:#64748b;text-align:center}
      .rod{margin-top:16px;border-top:1px solid #dbe3ea;padding-top:8px;font-size:9.5px;color:#94a3b8}</style></head><body>
      <h1>Fechamento do Dia — Vittalis Saúde</h1>
      <div class="sub">${fd.data.split('-').reverse().join('/')}${fd.fechado ? ` &middot; fechado por ${fd.fechado_por} em ${new Date(fd.fechado_em).toLocaleString('pt-BR')}` : ' &middot; conferência (ainda não fechado)'}</div>

      <h2>💰 Caixa</h2>
      <table><thead><tr><th>Forma de pagamento</th><th class="c">Qtd</th><th class="r">Recebido</th><th class="r">A receber</th></tr></thead>
      <tbody>${formas || '<tr><td colspan="4">Nenhuma venda no dia.</td></tr>'}</tbody></table>
      <div class="box">
        <div>Vendas<b>${c.vendas || 0}</b></div>
        <div>Recebido<b>${fmt.brl(c.recebido)}</b></div>
        <div>A receber<b>${fmt.brl(c.a_receber)}</b></div>
        <div>Dinheiro esperado<b>${fmt.brl(c.dinheiro_esperado)}</b></div>
        <div>Dinheiro contado<b>${dinContado !== '' ? fmt.brl(parseFloat(String(dinContado).replace(',', '.'))) : '________'}</b></div>
        ${dif != null ? `<div>Diferença<b class="dif">${fmt.brl(dif)}</b></div>` : ''}
      </div>
      ${c.sem_comprovante ? `<div style="font-size:11.5px;color:#92400e">⚠ ${c.sem_comprovante} venda(s) sem comprovante anexado.</div>` : ''}

      <h2>💉 Estoque — doses do dia</h2>
      <table><thead><tr><th>Vacina</th><th class="c">Previstas</th><th class="c">Aplicadas</th><th class="c">Saldo contado</th></tr></thead>
      <tbody>${est || '<tr><td colspan="4">Nenhuma dose registrada no dia.</td></tr>'}</tbody></table>

      <h2>Observações</h2><div class="obs">${(fdObs || fd.observacao || '').replace(/</g, '&lt;')}</div>
      <div class="ass"><div>Responsável pelo fechamento</div><div>Conferido pela gestão</div></div>
      <div class="rod">Emitido em ${new Date().toLocaleString('pt-BR')} &middot; VittaHub CRM</div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  // 🏁 Fechamento do relatório de metas (a equipe fecha o mês)
  const [relMetas, setRelMetas] = useState(null);
  const [relBusy, setRelBusy] = useState(false);
  const mesFechISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const [mesFech, setMesFech] = useState(mesFechISO());
  const abrirFechamento = async (mesAlvo) => {
    const alvo = mesAlvo || mesFech;
    setMesFech(alvo); setRelMetas({ carregando: true });
    try { setRelMetas(await api.get(`/extras/metas/fechamento?mes=${alvo}`)); }
    catch (e) { setRelMetas({ erro: e.message }); }
  };
  const confirmarFechamento = async () => {
    if (!window.confirm(`Fechar o relatório de metas de ${mesFech}?\n\nOs números ficam congelados como a foto oficial do mês.`)) return;
    setRelBusy(true);
    try { const r = await api.post('/extras/metas/fechamento', { mes: mesFech, dados: relMetas }); setRelMetas({ ...r }); }
    catch (e) { window.alert('Erro: ' + e.message); }
    setRelBusy(false);
  };
  const imprimirMetas = () => {
    if (!relMetas || relMetas.carregando || relMetas.erro) return;
    const w = window.open('', '_blank'); if (!w) return;
    const NOMES = { vacinas: '💉 Vacinas', consultas: '🩺 Consultas', terapias: '🧩 Terapias' };
    const linhasSetor = (relMetas.setores || []).map(s2 => `<tr>
      <td><b>${NOMES[s2.setor] || s2.setor}</b></td>
      <td class="c">${s2.vendas}</td>
      <td class="r">${fmt.brl(s2.confirmado)}</td>
      <td class="r">${fmt.brl(s2.meta_minima)}</td>
      <td class="r ${s2.bateu_minima ? 'ok' : 'no'}">${s2.bateu_minima ? '✔ batida' : fmt.brl(s2.falta_minima)}</td>
      <td class="r">${fmt.brl(s2.meta_global)}</td>
      <td class="r ${s2.bateu_global ? 'ok' : 'no'}">${s2.bateu_global ? '✔ batida' : fmt.brl(s2.falta_global)}</td>
      <td class="r"><b>${fmt.brl(s2.premio_conquistado)}</b></td></tr>`).join('');
    const linhasAtend = (relMetas.atendentes || []).map(a => `<tr>
      <td>${a.nome}</td><td class="c">${a.vendas}</td><td class="r">${fmt.brl(a.confirmado)}</td>
      <td class="r">${a.meta ? fmt.brl(a.meta) : '—'}</td>
      <td class="r ${a.bateu ? 'ok' : ''}">${a.meta ? (a.bateu ? '✔ batida' : fmt.brl(a.falta)) : '—'}</td></tr>`).join('');
    w.document.write(`<html><head><title>Relatório de metas ${relMetas.mes}</title><meta charset="utf-8">
      <style>@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0}
      h1{color:#0E8C96;margin:0 0 2px;font-size:20px}h2{font-size:13px;margin:18px 0 7px;color:#0f172a}
      .sub{color:#64748b;font-size:12px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th{background:#0E8C96;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
      td{border:1px solid #dbe3ea;padding:6px 8px}
      td.c{text-align:center}td.r{text-align:right}
      td.ok{color:#15803d;font-weight:bold}td.no{color:#b45309}
      .tot{margin-top:14px;font-size:13px}.tot b{color:#0E8C96}
      .ass{margin-top:34px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #94a3b8;padding-top:5px;font-size:10.5px;color:#64748b;text-align:center}
      .rod{margin-top:18px;border-top:1px solid #dbe3ea;padding-top:8px;font-size:9.5px;color:#94a3b8}</style></head><body>
      <h1>Relatório de Metas — Vittalis Saúde</h1>
      <div class="sub">Mês de referência: <b>${relMetas.mes}</b>${relMetas.fechado ? ` &middot; FECHADO por ${relMetas.fechado_por} em ${new Date(relMetas.fechado_em).toLocaleString('pt-BR')}` : ' &middot; prévia (ainda não fechado)'}</div>
      <h2>Por setor</h2>
      <table><thead><tr><th>Setor</th><th class="c">Vendas</th><th class="r">Confirmado</th><th class="r">Meta mínima</th><th class="r">Falta mínima</th><th class="r">Meta global</th><th class="r">Falta global</th><th class="r">Prêmio</th></tr></thead>
      <tbody>${linhasSetor}</tbody></table>
      <h2>Por atendente</h2>
      <table><thead><tr><th>Atendente</th><th class="c">Vendas</th><th class="r">Confirmado</th><th class="r">Meta individual</th><th class="r">Falta</th></tr></thead>
      <tbody>${linhasAtend || '<tr><td colspan="5">Nenhuma venda no período.</td></tr>'}</tbody></table>
      <div class="tot">Total confirmado no mês: <b>${fmt.brl(relMetas.total?.confirmado)}</b> &middot; A receber: ${fmt.brl(relMetas.total?.pendente)} &middot; Prêmios conquistados: <b>${fmt.brl(relMetas.total?.premios)}</b></div>
      <div class="ass"><div>Responsável pelo fechamento</div><div>Gestão / Diretoria</div></div>
      <div class="rod">Emitido em ${new Date().toLocaleString('pt-BR')} &middot; VittaHub CRM</div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  const veRepasse = gestao || user?.role === 'atendente'; // atendente enxerga o próprio repasse (1%)
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState(mesAtual());
  const [setor, setSetor] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroRapido, setFiltroRapido] = useState(''); // '' | 'areceber' | 'sem_comprovante' | 'nao_conferidas'
  const [preview, setPreview] = useState(null); // { url, nome, tipo }
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);

  const load = () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (mes) qs.set('mes', mes);
    if (setor) qs.set('setor', setor);
    if (status) qs.set('status', status);
    api.get('/extras/meta-setor').then(d => { setMetasSetor(d?.porSetor || []); setMetaEu(d?.individual || null); }).catch(() => {});
    api.get('/extras/comprovantes/divergencias').then(d => setDivergencias(Array.isArray(d?.itens) ? d.itens : [])).catch(() => {});
    api.get('/extras/caixa/fechar-meu/status').then(setFechStatus).catch(() => {});
    api.get('/extras/baixas-pendentes').then(d => setBaixasPend(Array.isArray(d?.itens) ? d.itens : [])).catch(() => {});
    api.get(`/extras/vendas?${qs.toString()}`)
      .then(d => setLista(Array.isArray(d) ? d : []))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { load(); }, [mes, setor, status]); // eslint-disable-line

  // Comprovante chega em tempo real quando outra venda é registrada
  useEffect(() => {
    let sock;
    import('socket.io-client').then(({ io }) => {
      const BASE = import.meta.env.VITE_API_URL || '';
      sock = io(BASE || '/', { auth: { token: localStorage.getItem('vh_token') || '' } });
      sock.on('venda_registrada', () => load());
    }).catch(() => {});
    return () => { try { sock?.disconnect(); } catch {} };
  }, []); // eslint-disable-line

  // ── Comprovantes (múltiplos por venda) via modal ──
  const [compModal, setCompModal] = useState(null); // venda selecionada
  const [comps, setComps] = useState([]);
  const [compLoad, setCompLoad] = useState(false);
  const [anexando, setAnexandoComp] = useState(false);
  const [analisandoComp, setAnalisandoComp] = useState(null);

  const abrirComprovantes = (v) => { setCompModal(v); setErro(''); carregarComps(v.id); };
  const carregarComps = (vid) => {
    setCompLoad(true);
    api.get(`/extras/vendas/${vid}/comprovantes`).then(d => setComps(Array.isArray(d) ? d : [])).catch(() => setComps([])).finally(() => setCompLoad(false));
  };
  const setN = (vid, delta) => setLista(p => p.map(v => v.id === vid ? { ...v, n_comprovantes: Math.max(0, (v.n_comprovantes || 0) + delta) } : v));

  const anexarComp = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !compModal) return;
    const url = await fileToDataUrl(f);
    if (url.length > 52_000_000) { setErro('Comprovante muito grande (máx. ~40MB).'); return; }
    setAnexandoComp(true); setErro('');
    try {
      const c = await api.post(`/extras/vendas/${compModal.id}/comprovantes`, { comprovante: url, filename: f.name, mimetype: f.type });
      setComps(p => [...p, c]); setN(compModal.id, 1);
    } catch (err) { setErro(err.message || 'Falha ao anexar.'); }
    setAnexandoComp(false);
  };

  const verComp = async (c) => {
    try {
      const d = await api.get(`/extras/vendas/${compModal.id}/comprovantes/${c.id}`);
      setPreview({ url: d.comprovante, nome: d.comprovante_nome || 'comprovante', tipo: d.comprovante_tipo || '' });
    } catch (err) { setErro(err.message || 'Não foi possível abrir.'); }
  };
  const removerComp = async (c) => {
    if (!window.confirm('Remover este comprovante?')) return;
    setComps(p => p.filter(x => x.id !== c.id)); setN(compModal.id, -1);
    try { await api.del(`/extras/vendas/${compModal.id}/comprovantes/${c.id}`); } catch { carregarComps(compModal.id); }
  };
  const analisarComp = async (c) => {
    setAnalisandoComp(c.id); setErro('');
    try {
      const a = await api.post(`/extras/vendas/${compModal.id}/comprovantes/${c.id}/analisar`, {});
      setComps(p => p.map(x => x.id === c.id ? { ...x, analise: a } : x));
    } catch (err) { setErro(err.message || 'Falha na análise da IA.'); }
    setAnalisandoComp(null);
  };

  const toggleConferido = async (v) => {
    const novo = !v.conferido;
    setLista(p => p.map(x => x.id === v.id ? { ...x, conferido: novo } : x));
    try { await api.patch(`/extras/vendas/${v.id}/conferido`, { conferido: novo }); }
    catch (err) { setErro(err.message || 'Falha ao conferir.'); setLista(p => p.map(x => x.id === v.id ? { ...x, conferido: !novo } : x)); }
  };

  const [editRepasse, setEditRepasse] = useState(null); // { id, valor }
  // Fechamento de repasses do mês (gestão)
  const [showRep, setShowRep] = useState(false);
  const [repDados, setRepDados] = useState(null);
  const loadRep = () => api.get(`/extras/repasses-mes?mes=${mes}`).then(setRepDados).catch(() => setRepDados({ itens: [], total: 0 }));
  const pagarRep = async (it, desfazer = false) => {
    if (!desfazer && !window.confirm(`Marcar o repasse de ${it.nome} (${fmt.brl(it.repasse)}) como PAGO?`)) return;
    try { await api.post('/extras/repasses-mes/pagar', { mes, atendente_id: it.atendente_id, atendente_nome: it.nome, valor: it.repasse, desfazer }); loadRep(); }
    catch (e) { setErro(e.message || 'Erro ao salvar pagamento.'); }
  };
  const salvarRepasse = async () => {
    if (!editRepasse) return;
    const val = parseFloat(String(editRepasse.valor).replace(',', '.')) || 0;
    setLista(p => p.map(x => x.id === editRepasse.id ? { ...x, repasse: val } : x));
    const id = editRepasse.id; setEditRepasse(null);
    try { await api.patch(`/extras/vendas/${id}/repasse`, { repasse: val }); }
    catch (err) { setErro(err.message || 'Falha ao salvar repasse.'); load(); }
  };

  // Baixa de pendência: marca a venda como recebida (1 clique)
  const [recebendo, setRecebendo] = useState(null);
  const marcarRecebido = async (v) => {
    /* 💸 Baixa supervisionada (ordem do master): a Géssica dá baixa SÓ com
       justificativa + autorização do Dr. Miécio — abre o modal em vez de
       aplicar direto. Gestão continua com baixa em 1 clique. */
    if (user?.baixa_supervisionada && !['master', 'supervisor'].includes(user?.role)) {
      setBaixaJust({ venda: v, texto: '' });
      return;
    }
    setRecebendo(v.id); setErro('');
    setLista(p => p.map(x => x.id === v.id ? { ...x, status_pagamento: 'pago' } : x));
    try { await api.patch(`/extras/vendas/${v.id}/receber`, { status: 'pago' }); }
    catch (err) { setErro(err.message || 'Falha ao dar baixa.'); load(); }
    setRecebendo(null);
  };
  const enviarBaixaJust = async () => {
    const b = baixaJust; if (!b || String(b.texto).trim().length < 10) { window.alert('Escreva a justificativa (mínimo 10 caracteres): como o pagamento foi confirmado?'); return; }
    try {
      const r2 = await api.patch(`/extras/vendas/${b.venda.id}/receber`, { status: 'pago', justificativa: b.texto.trim() });
      window.alert(r2?.mensagem || '✅ Solicitação enviada ao Miécio.');
      setBaixaJust(null);
      api.get('/extras/baixas-pendentes').then(d => setBaixasPend(Array.isArray(d?.itens) ? d.itens : [])).catch(() => {});
    } catch (e) { window.alert('Erro: ' + e.message); }
  };
  const decidirBaixa = async (bp, aprovar) => {
    try {
      await api.post(`/extras/baixas-pendentes/${bp.id}/decidir`, { aprovar });
      setBaixasPend(p => p.filter(x => x.id !== bp.id));
      if (aprovar) load();
    } catch (e) { window.alert('Erro: ' + e.message); }
  };

  // Saídas / despesas (gestão) — pra fechar o saldo real
  const [aba, setAba] = useState('entradas'); // 'entradas' | 'saidas' | 'excluidas'
  const [excluidas, setExcluidas] = useState([]);
  const [excLoad, setExcLoad] = useState(false);
  const loadExcluidas = async () => {
    setExcLoad(true);
    try { const d = await api.get('/extras/vendas/excluidas'); setExcluidas(Array.isArray(d) ? d : []); }
    catch { setExcluidas([]); }
    setExcLoad(false);
  };
  const restaurarVenda = async (arq) => {
    const v = arq.dados || {};
    if (!window.confirm(`Restaurar a venda de ${v.cliente_nome || v.paciente_nome || 'cliente'} (${fmt.brl(v.valor)})?\n\nEla volta pro caixa, faturamento e metas.`)) return;
    setExcluidas(p => p.filter(x => x.id !== arq.id));
    try { await api.post(`/extras/vendas/excluidas/${arq.id}/restaurar`, {}); load(); }
    catch (e) { setErro(e.message || 'Falha ao restaurar.'); loadExcluidas(); }
  };
  const [despesas, setDespesas] = useState([]);
  const [despTotal, setDespTotal] = useState(0);
  const [metasSetor, setMetasSetor] = useState([]); // metas minima/global por setor (gestao)
  const [metaEu, setMetaEu] = useState(null);       // 🎯 o MESMO número do placar de cima (fonte única)
  const [divergencias, setDivergencias] = useState([]); // 🕵️ comprovantes reprovados pela IA
  const [fechStatus, setFechStatus] = useState(null);   // 🏁 fechamento do dia no grupo
  const [fechEnviando, setFechEnviando] = useState(false);
  const [baixasPend, setBaixasPend] = useState([]);     // 💸 baixas aguardando o master
  const [baixaJust, setBaixaJust] = useState(null);     // { venda, texto } — modal de justificativa (Géssica)
  const [modalDesp, setModalDesp] = useState(null);
  const [salvandoDesp, setSalvandoDesp] = useState(false);
  const loadDespesas = () => {
    if (!gestao) return;
    const qs = new URLSearchParams(); if (mes) qs.set('mes', mes); if (setor) qs.set('setor', setor);
    api.get(`/extras/despesas?${qs.toString()}`).then(d => { setDespesas(d.despesas || []); setDespTotal(d.total || 0); }).catch(() => {});
  };
  useEffect(() => { loadDespesas(); }, [mes, setor]); // eslint-disable-line

  const salvarDespesa = async () => {
    if (!modalDesp.descricao?.trim()) { setErro('Descreva a despesa.'); return; }
    setSalvandoDesp(true); setErro('');
    try {
      const d = await api.post('/extras/despesas', { ...modalDesp, valor: parseFloat(String(modalDesp.valor).replace(',', '.')) || 0 });
      setDespesas(p => [d, ...p]); setDespTotal(t => t + (parseFloat(d.valor) || 0)); setModalDesp(null);
    } catch (e) { setErro(e.message); }
    setSalvandoDesp(false);
  };
  // ➕ NOVA VENDA DE BALCÃO: cliente que chega direto na clínica (sem WhatsApp)
  const [novaVenda, setNovaVenda] = useState(null);
  const abrirNovaVenda = () => setNovaVenda({
    cliente_nome: '', paciente_nome: '', categoria: 'Vacinação Geral', setor: 'vacinas', ligou: false,
    servico: '', valor: '', desconto: '', forma_pagamento: 'Pix', status_pagamento: 'pago',
    data_venda: hojeLocalISO(), origem: 'Balcão', observacao: '',
  });
  const [novaVendaSaving, setNovaVendaSaving] = useState(false);
  // 💰 Vindo do botão "Registrar venda" do topo (?nova=1): o formulário já
  // abre — o título do botão agora cumpre o que promete (cobrança do master).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nova') === '1') abrirNovaVenda();
  }, []); // eslint-disable-line
  const salvarNovaVenda = async () => {
    if (!novaVenda) return;
    const numBR = (x) => Math.max(0, parseFloat(String(x).replace(/\./g, '').replace(',', '.')) || 0);
    if (!String(novaVenda.cliente_nome).trim()) return window.alert('Informe o nome do cliente.');
    if (numBR(novaVenda.valor) <= 0) return window.alert('Informe o valor da venda.');
    setNovaVendaSaving(true);
    try {
      const salva = await api.post('/extras/vendas', {
        cliente_nome: novaVenda.cliente_nome, paciente_nome: novaVenda.paciente_nome,
        categoria: novaVenda.categoria, setor: novaVenda.setor, servico: novaVenda.servico,
        valor: numBR(novaVenda.valor), desconto: numBR(novaVenda.desconto),
        forma_pagamento: novaVenda.forma_pagamento, status_pagamento: novaVenda.status_pagamento,
        data_venda: novaVenda.data_venda, origem: novaVenda.origem || 'Balcão', observacao: novaVenda.observacao,
        ligou: !!novaVenda.ligou,
      });
      setNovaVenda(null); load();
      if (salva?.sugestao?.texto) setTimeout(() => window.alert('💡 ' + salva.sugestao.texto), 400);
    } catch (err) { window.alert('Erro ao registrar: ' + (err.message || 'falha')); }
    setNovaVendaSaving(false);
  };

  // ✏️ Edição COMPLETA da venda (gestão): modal com todos os campos salvos
  const [editVenda, setEditVenda] = useState(null);
  const abrirEditVenda = (v) => setEditVenda({
    id: v.id, cliente_nome: v.cliente_nome || '', paciente_nome: v.paciente_nome || '',
    servico: v.servico || '', setor: v.setor || 'vacinas',
    valor: String(parseFloat(v.valor) || 0).replace('.', ','), desconto: String(parseFloat(v.desconto) || 0).replace('.', ','),
    forma_pagamento: v.forma_pagamento || '', status_pagamento: v.status_pagamento || 'pago',
    data_venda: v.data_venda ? String(v.data_venda).slice(0, 10) : '', observacao: v.observacao || '',
  });
  const [editVendaSaving, setEditVendaSaving] = useState(false);
  const salvarEditVenda = async () => {
    if (!editVenda) return;
    setEditVendaSaving(true);
    const numBR = (x) => Math.max(0, parseFloat(String(x).replace(/\./g, '').replace(',', '.')) || 0);
    const body = {
      cliente_nome: editVenda.cliente_nome, paciente_nome: editVenda.paciente_nome,
      servico: editVenda.servico, setor: editVenda.setor,
      valor: numBR(editVenda.valor), desconto: numBR(editVenda.desconto),
      status_pagamento: editVenda.status_pagamento, observacao: editVenda.observacao,
    };
    if (editVenda.forma_pagamento) body.forma_pagamento = editVenda.forma_pagamento;
    if (/^\d{4}-\d{2}-\d{2}$/.test(editVenda.data_venda)) body.data_venda = editVenda.data_venda;
    try { await api.patch(`/extras/vendas/${editVenda.id}`, body); setEditVenda(null); load(); }
    catch (err) { window.alert('Erro ao salvar: ' + (err.message || 'falha')); }
    setEditVendaSaving(false);
  };

  // Edição inline do VALOR da venda (gestão) — clica no valor, edita, Enter salva
  const [editValor, setEditValor] = useState(null); // { id, valor }
  const salvarValor = async () => {
    if (!editValor) return;
    const { id } = editValor;
    const val = Math.max(0, parseFloat(String(editValor.valor).replace(/\./g, '').replace(',', '.')) || 0);
    setEditValor(null);
    setLista(p => p.map(x => x.id === id ? { ...x, valor: val } : x));
    try { await api.patch(`/extras/vendas/${id}`, { valor: val }); load(); }
    catch (err) { setErro(err.message || 'Falha ao salvar o valor.'); load(); }
  };
  const excluirDespesa = async (d) => {
    if (!window.confirm(`Remover "${d.descricao}"?`)) return;
    setDespesas(p => p.filter(x => x.id !== d.id)); setDespTotal(t => t - (parseFloat(d.valor) || 0));
    try { await api.del(`/extras/despesas/${d.id}`); } catch { loadDespesas(); }
  };
  // Excluir uma venda (liberado p/ toda a equipe): remove do caixa, do
  // faturamento e das metas — mas fica arquivada/rastreável (recuperável).
  const excluirVenda = async (v) => {
    const nome = v.cliente_nome || v.paciente_nome || 'esta venda';
    if (!window.confirm(`Excluir a venda de ${nome} (${fmt.brl(v.valor)})?\n\nRemove a venda do caixa, do faturamento e das metas. Não dá pra desfazer.`)) return;
    const antes = lista;
    setLista(p => p.filter(x => x.id !== v.id));
    try { await api.del(`/extras/vendas/${v.id}`); }
    catch (err) { setErro(err.message || 'Falha ao excluir a venda.'); setLista(antes); }
  };

  const filtrada = lista.filter(v => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return [v.cliente_nome, v.paciente_nome, v.servico, v.atendente_nome].some(x => (x || '').toLowerCase().includes(q));
  });

  const total = filtrada.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const totalDesc = filtrada.reduce((s, v) => s + (parseFloat(v.desconto) || 0), 0);
  // Repasse (comissão) é da função "atendente": 1% sobre cada venda feita por um atendente.
  // Assim vale para a Danielle e para quem entrar como atendente. Gestão ainda pode ajustar
  // manualmente uma venda específica; nesse caso o valor definido prevalece sobre o 1%.
  const TAXA_REPASSE = 0.01;
  const repasseDe = (v) => {
    const m = parseFloat(v.repasse) || 0;
    if (m > 0) return m;
    /* 💰 Comissão pessoal calculada pelo servidor (Gabriellen, 04/09: R$ 20 por
       consulta até R$ 400, R$ 35 acima) vale no lugar do 1%. */
    if (v.comissao_calc != null) return parseFloat(v.comissao_calc) || 0;
    return v.atendente_role === 'atendente' ? (parseFloat(v.valor) || 0) * TAXA_REPASSE : 0;
  };
  const temComissaoPessoal = filtrada.some(v => v.comissao_calc != null && String(v.atendente_id) === String(user?.id));
  const totalRepasse = filtrada.reduce((s, v) => s + repasseDe(v), 0);
  const liquido = total - totalRepasse;
  const comComp = filtrada.filter(v => (v.n_comprovantes || 0) > 0).length;
  const conferidas = filtrada.filter(v => v.conferido).length;

  // Fechamento por forma de pagamento — as 3 principais sempre visíveis + Outros
  const RECEBIDO_ST = ['pago', 'cortesia'];
  const ARECEBER_ST = ['sinal', 'aguardando', 'parcelado', 'pendente'];
  const fech = { Pix: { v: 0, n: 0 }, 'Cartão': { v: 0, n: 0 }, Dinheiro: { v: 0, n: 0 }, Outros: { v: 0, n: 0 } };
  /* "Que Outros são esses?" (pergunta do master): eram Crédito, Débito,
     À vista, Link de pagamento, Parcelado e vendas sem forma — o agrupador só
     reconhecia os nomes exatos Pix/Cartão/Dinheiro. Agora normaliza: cartão em
     todas as variações vira Cartão, link entra no Pix, à vista é Dinheiro; só
     sobra em Outros o que realmente não tem forma informada. */
  const formaNorm = (f) => {
    const t = String(f || '').toLowerCase();
    if (/pix|link/.test(t)) return 'Pix';
    if (/cart|cr[eé]dito|d[eé]bito|parcel/.test(t)) return 'Cartão';
    if (/dinheiro|vista|esp[eé]cie/.test(t)) return 'Dinheiro';
    return 'Outros';
  };
  const outrasFormas = {};
  filtrada.forEach(v => {
    const val = parseFloat(v.valor) || 0;
    const chave = formaNorm(v.forma_pagamento);
    if (chave === 'Outros') { const rot = v.forma_pagamento || '(sem forma)'; outrasFormas[rot] = (outrasFormas[rot] || 0) + val; }
    fech[chave].v += val; fech[chave].n += 1;
  });
  const formasFixas = ['Pix', 'Cartão', 'Dinheiro'];
  const formaCor = { Pix: '#059669', 'Cartão': '#2563eb', Dinheiro: '#d97706', Outros: '#7c3aed' };
  const formaIcone = { Pix: '⚡', 'Cartão': '💳', Dinheiro: '💵', Outros: '🔗' };
  const formasOrdenadas = [...formasFixas, ...(fech.Outros.v > 0 ? ['Outros'] : [])].map(f => [f, fech[f].v]);
  const outrosDetalhe = Object.entries(outrasFormas).map(([k, v]) => `${k}: ${fmt.brl(v)}`).join(' · ');

  // Vendas POR SETOR (quantas e quanto cada setor fez)
  const porSetor = { vacinas: { v: 0, n: 0 }, consultas: { v: 0, n: 0 }, terapias: { v: 0, n: 0 }, outros: { v: 0, n: 0 } };
  filtrada.forEach(v => {
    const s = ['vacinas', 'consultas', 'terapias'].includes(v.setor) ? v.setor : 'outros';
    porSetor[s].v += parseFloat(v.valor) || 0; porSetor[s].n += 1;
  });
  const setorMeta = { vacinas: { l: '💉 Vacinas', c: '#7c5cbf' }, consultas: { l: '🩺 Consultas', c: '#00B8C0' }, terapias: { l: '🧩 Terapias', c: '#C4973B' }, outros: { l: '📦 Outros', c: '#64748b' } };

  // Ferramentas do fechamento
  const recebido = filtrada.filter(v => RECEBIDO_ST.includes(v.status_pagamento)).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const aReceber = filtrada.filter(v => ARECEBER_ST.includes(v.status_pagamento)).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const nAReceber = filtrada.filter(v => ARECEBER_ST.includes(v.status_pagamento)).length;
  // Saldo real do caixa: entrou (recebido) − saiu (despesas + repasses)
  const saidas = despTotal + totalRepasse;
  const saldo = recebido - saidas;
  // Bônus: 1% SÓ das vendas COM comprovante (venda concluída/comprovada).
  // Venda sem comprovante NÃO conta pro bônus (pode ter sido registrada antes do pagamento).
  const baseBonus = filtrada.filter(v => (v.n_comprovantes || 0) > 0).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const bonus = baseBonus * 0.01;
  const semComprovante = filtrada.filter(v => !(v.n_comprovantes || 0)).length;
  // Caixa do DIA: vendas de hoje (dentro do filtro atual)
  const hojeISO = hojeLocalISO();
  const vendasHoje = filtrada.filter(v => String(v.data_venda || '').slice(0, 10) === hojeISO);

  // Filtro rápido afeta só a LISTA exibida — os totais do fechamento continuam do mês inteiro
  const listaExibida = filtrada.filter(v => {
    if (filtroRapido === 'areceber') return ARECEBER_ST.includes(v.status_pagamento);
    if (filtroRapido === 'sem_comprovante') return !(v.n_comprovantes || 0);
    if (filtroRapido === 'nao_conferidas') return !v.conferido;
    return true;
  });

  const podeAnexar = (v) => gestao || v.atendente_id === user?.id;

  const exportarCSV = () => {
    const head = ['Data', 'Cliente', 'Paciente', 'Setor', 'Categoria', 'Servico', 'Forma pagamento', 'Status', 'Valor', 'Desconto', 'Repasse', 'Atendente', 'Conferido', 'Comprovante'];
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = filtrada.map(v => [
      fmtData(v.data_venda), v.cliente_nome, v.paciente_nome, v.setor, v.categoria, v.servico,
      v.forma_pagamento, (STATUS_INFO[v.status_pagamento]?.label || v.status_pagamento),
      (parseFloat(v.valor) || 0).toFixed(2).replace('.', ','), (parseFloat(v.desconto) || 0).toFixed(2).replace('.', ','),
      repasseDe(v).toFixed(2).replace('.', ','),
      v.atendente_nome, v.conferido ? 'Sim' : 'Nao', (v.n_comprovantes || 0) > 0 ? `Sim (${v.n_comprovantes})` : 'Nao',
    ].map(esc).join(';'));
    const csv = '﻿' + [head.map(esc).join(';'), ...linhas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `caixa-${mes}${setor ? '-' + setor : ''}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  /* 📄 RELATÓRIO COM OS COMPROVANTES (ordem do master, 28/08: "quero ter de
     cada setor e o total, e que cada setor ao puxar o relatório venha com o
     comprovante"). Abre a folha pronta pra imprimir ou salvar em PDF: o resumo
     de cada setor, o total da casa, e depois cada venda com o comprovante do
     lado — é o documento de conferência. Só master. */
  const [relComp, setRelComp] = useState(false);
  const relatorioComComprovantes = async () => {
    if (relComp) return;
    setRelComp(true);
    try {
      const q = new URLSearchParams({ mes });
      if (setor) q.set('setor', setor);
      const d = await api.get(`/extras/caixa/relatorio?${q}`);
      const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const linhaSetor = (r2) => `<tr>
        <td>${esc(r2.setor)}</td><td class="n">${r2.n}</td>
        <td class="n">${fmt.brl(r2.total)}</td><td class="n">${fmt.brl(r2.recebido)}</td>
        <td class="n">${r2.com_comp}/${r2.n}</td></tr>`;
      const bloco = (v) => `<div class="v">
        <div class="vh">
          <b>${esc(v.cliente_nome || v.paciente_nome || 'Cliente')}</b>
          <span>${fmtData(v.data_venda)}</span>
          <span>${esc(v.setor)}</span>
          <span>${esc(v.servico || v.categoria || '')}</span>
          <span>${esc(v.forma_pagamento || '')}</span>
          <span class="val">${fmt.brl(v.valor)}</span>
          <span>${esc(v.atendente_nome || '')}</span>
          ${v.conferido ? '<span class="ok">conferida</span>' : ''}
        </div>
        <div class="cp">${
          v.comprovante && String(v.comprovante).startsWith('data:image')
            ? `<img src="${v.comprovante}"/>`
            : v.comprovante
              ? `<div class="pdf">📎 ${esc(v.comprovante_nome || 'Comprovante em PDF')} — abra pelo Caixa</div>`
              : v.comprovante_pesado
                ? '<div class="falta">Comprovante grande demais pra imprimir — está guardado no Caixa</div>'
                : '<div class="falta">⚠️ Sem comprovante anexado</div>'
        }</div></div>`;
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Caixa ${esc(d.mes)} — Vittalis Saúde</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#0a1520;background:#fff}
.faixa{height:7px;background:linear-gradient(90deg,#00B8C0,#0E8C96)}
.pg{padding:26px 32px}
.cab{display:flex;justify-content:space-between;align-items:center}
.cab img{height:66px}.cab .t{text-align:right}
.cab h1{font-size:20px;color:#06424A}.cab .s{font-size:12px;color:#5a7285;margin-top:3px}
.cab .p{display:inline-block;margin-top:6px;background:#e5f8f9;color:#007d83;padding:3px 11px;border-radius:20px;font-size:10.5px;font-weight:700}
.hr{height:1.5px;background:#e3ebf1;margin:14px 0 18px}
h2{font-size:14px;color:#06424A;border-left:4px solid #00B8C0;padding-left:9px;margin:0 0 9px}
table{width:100%;border-collapse:collapse;margin-bottom:18px}
th{background:#06424A;color:#fff;font-size:10px;text-transform:uppercase;padding:6px 9px;text-align:left}
td{font-size:11.5px;padding:6px 9px;border-top:1px solid #eef3f7}
td.n{text-align:right;font-weight:700}
tr.tot td{background:#f8fbfc;font-weight:900;color:#06424A;border-top:2px solid #06424A}
.v{border:1px solid #e3ebf1;border-radius:10px;padding:9px 11px;margin-bottom:9px;page-break-inside:avoid}
.vh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:11px;color:#5a7285}
.vh b{font-size:13px;color:#0a1520}
.vh .val{margin-left:auto;font-size:14px;font-weight:900;color:#06424A}
.vh .ok{background:#e2f8ef;color:#0a8f5b;border-radius:6px;padding:1px 7px;font-size:9.5px;font-weight:800}
.cp{margin-top:7px}
.cp img{max-width:100%;max-height:320px;border:1px solid #e3ebf1;border-radius:8px;display:block}
.falta{background:#fdecec;color:#c0392b;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:700}
.pdf{background:#eef2f6;color:#33506b;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:700}
.rod{margin-top:14px;border-top:1px solid #e3ebf1;padding-top:9px;font-size:9.5px;color:#8fa3b3;line-height:1.5}
@page{size:A4;margin:11mm}
</style></head><body><div class="faixa"></div><div class="pg">
<div class="cab"><img src="${window.location.origin}/logos/logo-v-color.png" alt="Vittalis Saúde"/>
<div class="t"><h1>Caixa — conferência com comprovantes</h1>
<div class="s">Cada venda do período com o comprovante anexado</div>
<div class="p">${esc(d.mes)}${d.setor ? ` · ${esc(d.setor)}` : ' · todos os setores'}</div></div></div>
<div class="hr"></div>
<h2>Resumo por setor</h2>
<table><tr><th>Setor</th><th>Vendas</th><th>Faturado</th><th>Recebido</th><th>Com comprovante</th></tr>
${d.resumo.map(linhaSetor).join('')}
<tr class="tot"><td>TOTAL DA CASA</td><td class="n">${d.total.n}</td>
<td class="n">${fmt.brl(d.total.total)}</td><td class="n">${fmt.brl(d.total.recebido)}</td>
<td class="n">${d.total.com_comp}/${d.total.n}</td></tr></table>
<h2>Vendas e comprovantes${d.setor ? ` · ${esc(d.setor)}` : ''}</h2>
${d.itens.map(bloco).join('')}
<div class="rod">Faturado = tudo que foi vendido no mês. Recebido = o que já entrou (pago ou cortesia).
${d.sem_comprovante} venda(s) sem comprovante anexado — aparecem em vermelho e são o que precisa ser cobrado da equipe.
Gerado em ${new Date().toLocaleString('pt-BR')} · Vittalis Saúde · documento interno.</div>
</div></body></html>`;
      const w = window.open('', '_blank');
      if (!w) { Toast.show('O navegador bloqueou a janela — libere os pop-ups.', 'error'); return; }
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 900);
    } catch (e) { Toast.show(e.message || 'Não consegui montar o relatório', 'error'); }
    finally { setRelComp(false); }
  };

  const exportarPDF = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const linhas = filtrada.map(v => `<tr>
      <td>${fmtData(v.data_venda)}</td><td>${v.cliente_nome || v.paciente_nome || '—'}</td>
      <td>${v.setor || '—'}</td><td>${v.servico || v.categoria || '—'}</td>
      <td>${v.forma_pagamento || '—'}</td><td>${STATUS_INFO[v.status_pagamento]?.label || v.status_pagamento || '—'}</td>
      <td style="text-align:right">${fmt.brl(v.valor)}</td><td style="text-align:right">${fmt.brl(repasseDe(v))}</td><td style="text-align:center">${v.conferido ? '✓' : ''}</td></tr>`).join('');
    const resumoForma = formasOrdenadas.map(([f, val]) => `<span style="margin-right:16px"><b>${f}:</b> ${fmt.brl(val)}</span>`).join('');
    w.document.write(`<html><head><title>Caixa ${mes}</title><meta charset="utf-8">
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:26px}h1{color:#065f46;margin:0 0 4px}
      .sub{color:#555;font-size:13px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f0fdf9;color:#065f46}
      .tot{margin-top:14px;font-size:15px;line-height:1.7}.forma{margin:10px 0;font-size:13px;color:#333}
      .box{display:inline-block;border:1px solid #ddd;border-radius:8px;padding:8px 14px;margin:4px 8px 4px 0}</style></head><body>
      <h1>Caixa — Vittalis Saúde</h1>
      <div class="sub">Mês ${mes}${setor ? ' · setor ' + setor : ' · todos os setores'} · ${filtrada.length} venda(s)</div>
      <div class="forma"><b>Fechamento por forma de pagamento:</b><br/>${resumoForma}</div>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Setor</th><th>Serviço</th><th>Pagamento</th><th>Status</th><th>Valor</th><th>Repasse</th><th>Conf.</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <div class="tot">
        <span class="box"><b>Total vendido:</b> ${fmt.brl(total)}</span>
        <span class="box"><b>Recebido:</b> ${fmt.brl(recebido)}</span>
        <span class="box"><b>A receber:</b> ${fmt.brl(aReceber)}</span>
        <span class="box"><b>Repasse:</b> ${fmt.brl(totalRepasse)}</span>
        <span class="box"><b>Líquido:</b> ${fmt.brl(liquido)}</span>
        <span class="box"><b>Descontos:</b> ${fmt.brl(totalDesc)}</span>
        <span class="box"><b>Bônus (1% c/ comprovante):</b> ${fmt.brl(bonus)}</span>
        <span class="box"><b>Sem comprovante:</b> ${semComprovante}</span>
        <span class="box"><b>Conferidas:</b> ${conferidas}/${filtrada.length}</span>
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  // Caixa do DIA — fechamento em PDF só das vendas de hoje
  const exportarCaixaDia = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const dia = vendasHoje;
    const totDia = dia.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
    const recDia = dia.filter(v => RECEBIDO_ST.includes(v.status_pagamento)).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
    const aRecDia = dia.filter(v => ARECEBER_ST.includes(v.status_pagamento)).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
    const formaDia = {}; dia.forEach(v => { const f = ['Pix', 'Cartão', 'Dinheiro'].includes(v.forma_pagamento) ? v.forma_pagamento : 'Outros'; formaDia[f] = (formaDia[f] || 0) + (parseFloat(v.valor) || 0); });
    const resumoForma = Object.entries(formaDia).map(([f, val]) => `<span style="margin-right:16px"><b>${f}:</b> ${fmt.brl(val)}</span>`).join('') || '—';
    const bonusDia = dia.filter(v => (v.n_comprovantes || 0) > 0).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0) * 0.01;
    const semCompDia = dia.filter(v => !(v.n_comprovantes || 0)).length;
    const linhas = dia.map(v => {
      const semC = !(v.n_comprovantes || 0);
      return `<tr${semC ? ' style="background:#fef3c7"' : ''}>
      <td>${v.cliente_nome || v.paciente_nome || '—'}</td><td>${v.setor || '—'}</td>
      <td>${v.servico || v.categoria || '—'}</td><td>${v.forma_pagamento || '—'}</td>
      <td>${STATUS_INFO[v.status_pagamento]?.label || v.status_pagamento || '—'}</td>
      <td style="text-align:right">${fmt.brl(v.valor)}</td><td style="text-align:center">${semC ? '⚠ confirmar' : '✓'}</td>${gestao ? `<td>${(v.atendente_nome || '').split(' ')[0]}</td>` : ''}</tr>`;
    }).join('');
    const hojeFmt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    w.document.write(`<html><head><title>Caixa do dia</title><meta charset="utf-8">
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:26px}h1{color:#065f46;margin:0 0 4px}
      .sub{color:#555;font-size:13px;margin-bottom:14px;text-transform:capitalize}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f0fdf9;color:#065f46}
      .tot{margin-top:14px;font-size:15px;line-height:1.8}.forma{margin:10px 0;font-size:13px}
      .box{display:inline-block;border:1px solid #ddd;border-radius:8px;padding:8px 14px;margin:4px 8px 4px 0}</style></head><body>
      <h1>Caixa do dia — Vittalis Saúde</h1>
      <div class="sub">${hojeFmt}${setor ? ' · setor ' + setor : ''} · ${dia.length} venda(s)</div>
      <div class="forma"><b>Por forma de pagamento:</b><br/>${resumoForma}</div>
      <table><thead><tr><th>Cliente</th><th>Setor</th><th>Serviço</th><th>Pagamento</th><th>Status</th><th>Valor</th><th>Comprov.</th>${gestao ? '<th>Atendente</th>' : ''}</tr></thead>
      <tbody>${linhas || `<tr><td colspan="${gestao ? 8 : 7}" style="text-align:center;color:#888">Nenhuma venda hoje ainda.</td></tr>`}</tbody></table>
      ${semCompDia ? `<div style="margin-top:10px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:12.5px;color:#92400e"><b>⚠ ${semCompDia} venda(s) sem comprovante</b> — confirmar se foram concluídas (não entram no bônus).</div>` : ''}
      <div class="tot">
        <span class="box"><b>Total do dia:</b> ${fmt.brl(totDia)}</span>
        <span class="box"><b>Recebido:</b> ${fmt.brl(recDia)}</span>
        <span class="box"><b>A receber:</b> ${fmt.brl(aRecDia)}</span>
        ${gestao ? `<span class="box"><b>Bônus (1% c/ comprovante):</b> ${fmt.brl(bonusDia)}</span>` : ''}
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div style={{ padding: 28, maxWidth: 1140, margin: '0 auto' }}>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={anexarComp} />

      {/* Header premium */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#0b1023 0%,#123 30%,#065f46 130%)', boxShadow: '0 10px 30px rgba(6,95,70,.28)', border: '1px solid rgba(212,175,55,.28)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 140, height: 140, borderRadius: '50%', background: 'rgba(212,175,55,.12)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}>
              <Wallet size={24} /> {user?.role === 'master' ? 'Caixa — Vittalis Saúde' : `Caixa do atendimento de ${String(user?.nome || '').split(' ')[0]}`}
            </div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          Todas as vendas registradas ficam aqui. Anexe o comprovante de pagamento de cada uma pra manter o financeiro organizado. 💚
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Total vendido{gestao ? '' : ' (suas)'}</div><div style={{ fontSize: 22, fontWeight: 900, color: '#a7f3d0' }}>{fmt.brl(total)}</div></div>
          {veRepasse && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>{gestao ? 'Repasse (1%)' : temComissaoPessoal ? 'Seu ganho por consulta' : 'Seu repasse (1%)'}</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fca5a5' }}>{fmt.brl(totalRepasse)}</div></div>}
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Líquido</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a' }}>{fmt.brl(liquido)}</div></div>}
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Vendas</div><div style={{ fontSize: 22, fontWeight: 900 }}>{filtrada.length}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>C/ comprovante</div><div style={{ fontSize: 20, fontWeight: 900, color: '#c7d2fe' }}>{comComp}/{filtrada.length}</div></div>
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Conferidas</div><div style={{ fontSize: 20, fontWeight: 900, color: '#7ee7c7' }}>{conferidas}/{filtrada.length}</div></div>}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {gestao && (
              <button onClick={() => { setShowRep(true); loadRep(); }} className="btn btn-sm" style={{ gap: 6, background: '#fca5a5', color: '#7f1d1d', border: 'none', fontWeight: 800 }} title="Fechar os repasses do mês (marcar pagos)">💸 Repasses</button>
            )}
            <button onClick={exportarCaixaDia} className="btn btn-sm" style={{ gap: 6, background: '#fde68a', color: '#7c2d12', border: 'none', fontWeight: 800 }} title="Fechamento do dia de hoje (PDF)"><CalendarCheck size={14} /> Caixa do dia{vendasHoje.length ? ` (${vendasHoje.length})` : ''}</button>
            <button onClick={() => abrirDia()} className="btn btn-sm" style={{ gap: 6, background: '#0E8C96', color: '#fff', border: 'none', fontWeight: 800 }} title="Conferir e fechar caixa e estoque do dia">🔒 Fechar o dia</button>
            <button onClick={exportarCSV} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.92)', color: '#065f46', border: 'none', fontWeight: 800 }} title="Exportar planilha (CSV)"><FileSpreadsheet size={14} /> Planilha</button>
            <button onClick={exportarPDF} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', fontWeight: 800 }} title="Gerar PDF do mês / imprimir"><Printer size={14} /> PDF do mês</button>
            {/* 📄 Conferência de verdade: cada venda com o comprovante do lado */}
            {user?.role === 'master' && (
              <button onClick={relatorioComComprovantes} disabled={relComp} className="btn btn-sm"
                style={{ gap: 6, background: '#C4973B', color: '#fff', border: 'none', fontWeight: 800, opacity: relComp ? .6 : 1 }}
                title="Relatório do mês com o comprovante de cada venda — por setor e com o total">
                <Printer size={14} /> {relComp ? 'Montando…' : 'Relatório com comprovantes'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fechamento por forma de pagamento + ferramentas */}
      <div className="card" style={{ padding: '13px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 9 }}>💳 Fechamento por forma de pagamento</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[...formasFixas, 'Outros'].filter(f => f !== 'Outros' || fech.Outros.v > 0).map(f => {
            const cor = formaCor[f]; const val = fech[f].v;
            return (
              <div key={f} title={f === 'Outros' ? `Vendas sem forma de pagamento informada — ${outrosDetalhe || 'edite a venda e escolha a forma'}` : ''}
                style={{ flex: '1 1 140px', minWidth: 130, background: 'var(--bg2)', borderRadius: 11, padding: '9px 13px', borderLeft: `3px solid ${cor}` }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{formaIcone[f]} {f === 'Outros' ? 'Sem forma informada' : f}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: cor }}>{fmt.brl(val)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--light)' }}>{fech[f].n} venda(s) · {total > 0 ? Math.round((val / total) * 100) : 0}%</div>
              </div>
            );
          })}
        </div>

        {/* Vendas por SETOR */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, margin: '14px 0 9px', paddingTop: 12, borderTop: '1px solid var(--border)' }}>🏷️ Vendas por setor</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['vacinas', 'consultas', 'terapias', ...(porSetor.outros.n ? ['outros'] : [])].map(s => {
            const m = setorMeta[s]; const d = porSetor[s];
            return (
              <div key={s} onClick={() => setSetor(s === 'outros' ? '' : (setor === s ? '' : s))} title={s !== 'outros' ? 'Filtrar por este setor' : ''}
                style={{ flex: '1 1 150px', minWidth: 140, background: setor === s ? m.c + '18' : 'var(--bg2)', borderRadius: 11, padding: '9px 13px', borderLeft: `3px solid ${m.c}`, cursor: s !== 'outros' ? 'pointer' : 'default', border: setor === s ? `1.5px solid ${m.c}` : '1.5px solid transparent' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{m.l}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: m.c }}>{fmt.brl(d.v)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--light)' }}>{d.n} venda(s) · {total > 0 ? Math.round((d.v / total) * 100) : 0}%</div>
              </div>
            );
          })}
        </div>

        {/* Ferramentas do fechamento */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {[
            { rot: 'Recebido', val: fmt.brl(recebido), cor: '#16a34a', sub: 'pago / cortesia' },
            { rot: 'A receber', val: fmt.brl(aReceber), cor: '#d97706', sub: `${nAReceber} pendente(s)`, click: 'areceber', destaque: aReceber > 0 },
            ...(gestao ? [{ rot: 'Bônus (1%)', val: fmt.brl(bonus), cor: '#C4973B', sub: 'só vendas c/ comprovante' }] : []),
            ...(gestao ? [{ rot: 'Saídas', val: fmt.brl(saidas), cor: '#dc2626', sub: 'despesas + repasse' }] : []),
            ...(gestao ? [{ rot: 'Saldo', val: fmt.brl(saldo), cor: saldo >= 0 ? '#0891b2' : '#dc2626', sub: 'recebido − saídas', destaque: false }] : []),
          ].map(t => {
            const ativo = t.click && filtroRapido === t.click;
            return (
              <div key={t.rot} onClick={t.click ? () => setFiltroRapido(f => f === t.click ? '' : t.click) : undefined}
                title={t.click ? 'Clique para ver quem está a receber' : undefined}
                style={{ flex: '1 1 130px', minWidth: 120, textAlign: 'center', borderRadius: 11, padding: '9px 10px', cursor: t.click ? 'pointer' : 'default',
                  background: ativo ? t.cor + '18' : (t.destaque ? '#fdf3e5' : 'var(--card)'),
                  border: `1.5px solid ${ativo ? t.cor : (t.destaque ? '#f5d9ad' : 'var(--border)')}`, transition: 'all .15s' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>{t.rot}{t.click ? (ativo ? ' ▾' : ' →') : ''}</div>
                <div style={{ fontSize: 16.5, fontWeight: 900, color: t.cor, marginTop: 2 }}>{t.val}</div>
                <div style={{ fontSize: 10, color: 'var(--light)' }}>{t.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggle Entradas / Saídas (gestão) */}
      {gestao && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setAba('entradas')} className="btn btn-sm" style={{ gap: 6, fontWeight: 800, background: aba === 'entradas' ? '#16a34a' : 'var(--card)', color: aba === 'entradas' ? '#fff' : 'var(--txt2)', border: aba === 'entradas' ? 'none' : '1.5px solid var(--border)' }}><TrendingUp size={14} /> Entradas</button>
          <button onClick={() => setAba('saidas')} className="btn btn-sm" style={{ gap: 6, fontWeight: 800, background: aba === 'saidas' ? '#dc2626' : 'var(--card)', color: aba === 'saidas' ? '#fff' : 'var(--txt2)', border: aba === 'saidas' ? 'none' : '1.5px solid var(--border)' }}><TrendingDown size={14} /> Saídas{despesas.length ? ` (${despesas.length})` : ''}</button>
          <button onClick={() => { setAba('excluidas'); loadExcluidas(); }} className="btn btn-sm" style={{ gap: 6, fontWeight: 800, background: aba === 'excluidas' ? '#6b7280' : 'var(--card)', color: aba === 'excluidas' ? '#fff' : 'var(--txt2)', border: aba === 'excluidas' ? 'none' : '1.5px solid var(--border)' }}><Trash2 size={14} /> Excluídas{aba === 'excluidas' && excluidas.length ? ` (${excluidas.length})` : ''}</button>
        </div>
      )}

      {aba === 'excluidas' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Vendas excluídas ficam guardadas aqui com quem excluiu e quando — nada se perde. Clique em <b>Restaurar</b> pra devolver ao caixa.
          </div>
          {excLoad ? (
            <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
          ) : excluidas.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <Trash2 size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhuma venda excluída.</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>Quando alguém excluir uma venda, ela aparece aqui — pronta pra restaurar.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {excluidas.map(arq => {
                const v = arq.dados || {};
                return (
                  <div key={arq.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', opacity: .92 }}>
                    <div style={{ width: 5, background: '#6b7280', flexShrink: 0 }} />
                    <div style={{ padding: '13px 16px', flex: 1, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 190 }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5, textDecoration: 'line-through', textDecorationColor: '#9ca3af' }}>{v.cliente_nome || v.paciente_nome || 'Cliente'}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                          {v.servico || v.categoria || '—'}{v.setor ? ` · ${v.setor}` : ''}{v.data_venda ? ` · venda de ${fmtData(v.data_venda)}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 3, fontWeight: 600 }}>
                          Excluída por {arq.excluida_por || '—'} em {arq.excluida_em ? new Date(arq.excluida_em).toLocaleString('pt-BR') : '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 96 }}>
                        <div style={{ fontSize: 16.5, fontWeight: 900, color: '#6b7280' }}>{fmt.brl(v.valor)}</div>
                      </div>
                      <button onClick={() => restaurarVenda(arq)} className="btn btn-sm" style={{ gap: 5, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800 }}>
                        ↩️ Restaurar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {aba === 'excluidas' ? null : aba === 'saidas' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Saídas de {mes} · <span style={{ color: '#dc2626' }}>{fmt.brl(despTotal)}</span></div>
            <button onClick={() => { setErro(''); setModalDesp({ descricao: '', categoria: 'Outros', valor: '', setor: '', forma_pagamento: '', data: hojeLocalISO() }); }} className="btn btn-p btn-sm" style={{ gap: 6 }}><Plus size={14} /> Lançar saída</button>
          </div>
          {despesas.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <TrendingDown size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhuma saída neste mês.</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>Lance despesas, repasses e custos pra fechar o saldo real do caixa.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {despesas.map(d => (
                <div key={d.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{d.descricao}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fdecec', borderRadius: 20, padding: '2px 8px' }}>{d.categoria}</span>
                      {d.setor && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{d.setor}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{fmtData(d.data)}{d.forma_pagamento ? ` · ${d.forma_pagamento}` : ''}{d.criado_por ? ` · ${d.criado_por.split(' ')[0]}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>− {fmt.brl(d.valor)}</div>
                  <button onClick={() => excluirDespesa(d)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* 🏁 FECHAR O CAIXA DO DIA (pedido do master): cada colaboradora fecha o
          seu e o relatório cai no grupo Caixa do WhatsApp. */}
      <div className="card" style={{ padding: '13px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'linear-gradient(120deg,#14532d,#166534)', color: '#fff', border: 'none' }}>
        <span style={{ fontSize: 20 }}>🏁</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 900, fontSize: 14.5 }}>{user?.role === 'master' ? 'Fechar o caixa da casa' : 'Fechar o meu caixa do dia'}</div>
          <div style={{ fontSize: 11.5, opacity: .9, marginTop: 2 }}>
            {fechStatus?.fechado_hoje
              ? `✅ Fechado hoje às ${new Date(fechStatus.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${fechStatus?.grupo ? ` · enviado no grupo ${fechStatus.grupo}` : ''}`
              : fechStatus?.grupo
                ? `O relatório das suas vendas de hoje vai direto pro grupo ${fechStatus.grupo} no WhatsApp.`
                : 'O relatório vai pro grupo Caixa do WhatsApp (grupo ainda não configurado — fale com o Miécio).'}
          </div>
        </div>
        <button onClick={async () => {
          if (fechStatus?.fechado_hoje && !window.confirm('O caixa de hoje já foi fechado e enviado. Reenviar o relatório atualizado pro grupo?')) return;
          setFechEnviando(true);
          try {
            const r2 = await api.post('/extras/caixa/fechar-meu', {});
            window.alert(`✅ Caixa fechado! ${r2.vendas} venda(s) · total ${Number(r2.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — relatório enviado no ${r2.grupo}.`);
            api.get('/extras/caixa/fechar-meu/status').then(setFechStatus).catch(() => {});
          } catch (e) { window.alert('Erro: ' + e.message); }
          setFechEnviando(false);
        }} disabled={fechEnviando}
          style={{ border: 'none', borderRadius: 11, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 900, flexShrink: 0,
            background: 'linear-gradient(180deg,#fde68a,#f59e0b)', color: '#78350f', boxShadow: '0 3px 12px rgba(245,158,11,.4)' }}>
          {fechEnviando ? 'Enviando…' : fechStatus?.fechado_hoje ? '↻ Reenviar no grupo' : '🏁 Fechar e enviar no grupo'}
        </button>
      </div>

      {/* 💸 Baixas aguardando autorização (master decide; Géssica acompanha as dela) */}
      {baixasPend.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12, border: '1.5px solid #fcd34d' }}>
          <div style={{ padding: '11px 16px', background: 'linear-gradient(120deg,#78350f,#b45309)', color: '#fff', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15 }}>💸</span>
            <b style={{ flex: 1, fontSize: 13.5 }}>{user?.role === 'master' ? 'Baixas manuais aguardando sua autorização' : 'Suas baixas aguardando o Miécio'}</b>
            <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 10, padding: '2px 9px', fontSize: 12, fontWeight: 800 }}>{baixasPend.length}</span>
          </div>
          {baixasPend.map((bp, i) => (
            <div key={bp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < baixasPend.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{bp.cliente_nome || 'Cliente'} · {Number(bp.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· pedido por {String(bp.solicitante_nome || '').split(' ')[0]}</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>📝 {bp.justificativa}</div>
              </div>
              {user?.role === 'master' ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => decidirBaixa(bp, true)} className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800 }}>✅ Autorizar</button>
                  <button onClick={() => decidirBaixa(bp, false)} className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', border: 'none', fontWeight: 800 }}>✕ Negar</button>
                </div>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '3px 10px', flexShrink: 0 }}>⏳ aguardando autorização</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 💸 Modal de justificativa da baixa supervisionada (Géssica) */}
      {baixaJust && (
        <div onClick={e => e.target === e.currentTarget && setBaixaJust(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>💸 Dar baixa com autorização</div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Baixa de <b>{baixaJust.venda.cliente_nome || 'cliente'}</b> ({Number(baixaJust.venda.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). A justificativa é obrigatória e a baixa só aplica depois que o <b>Miécio autorizar</b>.
            </p>
            <div className="field" style={{ margin: 0, marginBottom: 12 }}>
              <label>Justificativa * (como o pagamento foi confirmado?)</label>
              <textarea rows={3} value={baixaJust.texto} onChange={e => setBaixaJust(p => ({ ...p, texto: e.target.value }))}
                placeholder="Ex.: cliente mostrou o comprovante do Pix na recepção, valor conferido…" style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={enviarBaixaJust} className="btn btn-p" style={{ fontWeight: 800 }}>📨 Enviar pro Miécio</button>
              <button onClick={() => setBaixaJust(null)} className="btn">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* 🕵️ CAIXA DE SINALIZAÇÃO (pedido do master): a IA lê cada comprovante
          anexado; o que não bate (valor, autenticidade) aparece aqui — gestão
          vê tudo, cada atendente vê os das próprias vendas. */}
      {divergencias.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12, border: '1.5px solid #fca5a5' }}>
          <div style={{ padding: '11px 16px', background: 'linear-gradient(120deg,#7f1d1d,#dc2626)', color: '#fff', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15 }}>🕵️</span>
            <b style={{ flex: 1, fontSize: 13.5 }}>Comprovantes com divergência — conferir</b>
            <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 10, padding: '2px 9px', fontSize: 12, fontWeight: 800 }}>{divergencias.length}</span>
          </div>
          {divergencias.slice(0, 8).map((d, i) => {
            const a = d.analise || {};
            const motivo = a.parece_comprovante === false ? 'a imagem não parece um comprovante'
              : a.suspeita_fraude ? 'sinais de possível adulteração'
              : `valor lido ${fmt.brl(a.valor || 0)} ≠ venda ${fmt.brl(parseFloat(d.valor) || 0)}`;
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: i < Math.min(divergencias.length, 8) - 1 ? '1px solid var(--border)' : 'none' }}>
                <span>⚠️</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{d.cliente_nome || 'Cliente'} · {fmt.brl(parseFloat(d.valor) || 0)} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {String(d.atendente_nome || '').split(' ')[0]}</span></div>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>{motivo}{a.observacao ? ` — ${a.observacao}` : ''}</div>
                </div>
                <button onClick={() => abrirComprovantes({ id: d.venda_id, cliente_nome: d.cliente_nome, valor: d.valor })} className="btn btn-s btn-sm" style={{ flexShrink: 0, fontSize: 11, fontWeight: 700 }}>Ver comprovante</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 🔗 CONCILIAÇÃO COM O PLACAR (cobrança do master via Raylane: "um valor
          no painel de cima e outro no caixa") — este banner vem da MESMA fonte
          do placar, então os dois números são sempre iguais. A lista abaixo
          muda com os filtros (dia, status, busca), e é isso que pode fazer a
          soma da lista diferir: filtro não é divergência. */}
      {metaEu && metaEu.meta > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderLeft: '4px solid var(--tq)' }}>
          <span style={{ fontSize: 17 }}>🎯</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)' }}>Suas vendas no mês — mesmo número do placar de cima</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--tq2)' }}>
              {fmt.brl(metaEu.confirmado || 0)}
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginLeft: 8 }}>· faltam {fmt.brl(Math.max((metaEu.meta || 0) - (metaEu.confirmado || 0), 0))} pra sua meta</span>
            </div>
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--muted)', maxWidth: 260, lineHeight: 1.45 }}>
            A lista abaixo obedece aos filtros (dia, status, busca) — por isso a soma dela pode ser diferente deste total do mês.
          </span>
        </div>
      )}

      {/* 🎯 Metas do mês — cada usuário vê o(s) setor(es) dele; master vê todos */}
      {metasSetor.length > 0 && (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)' }}>
              🎯 Metas do mês por setor <span style={{ fontWeight: 600, textTransform: 'none' }}>(mínima e global configuráveis em Configurações)</span>
            </div>
            <button onClick={abrirFechamento} className="btn btn-sm" style={{ gap: 6, fontWeight: 800 }}>🏁 Fechar relatório de metas</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {metasSetor.map(ms => {
              const EMOJI = { vacinas: '💉', consultas: '🩺', terapias: '🧩' };
              const COR = { vacinas: '#8b5cf6', consultas: '#0891b2', terapias: '#d97706' }[ms.setor] || 'var(--tq)';
              const nome = ms.setor ? ms.setor[0].toUpperCase() + ms.setor.slice(1) : '—';
              const conf = ms.confirmado || 0;
              const metaG = ms.metaGlobal || 500000;
              const minM = ms.metaMinima || 100000;
              const pctG = Math.min((conf / metaG) * 100, 100);
              const posMin = Math.min((minM / metaG) * 100, 100);
              const minOk = conf >= minM;
              const ok = conf >= metaG;
              return (
                <div key={ms.setor}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800 }}>{EMOJI[ms.setor] || '🎯'} {nome}</span>
                    <span style={{ fontWeight: 800, color: COR }}>{fmt.brl(conf)} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {pctG.toFixed(1)}%</span></span>
                  </div>
                  <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'var(--bg2, #eef2f6)', overflow: 'hidden' }}>
                    <div style={{ width: `${pctG}%`, height: '100%', borderRadius: 6, background: ok ? '#16a34a' : COR, transition: 'width .5s' }} />
                    <div title={`Mínima: ${fmt.brl(minM)}`} style={{ position: 'absolute', left: `${posMin}%`, top: -1, bottom: -1, width: 2, background: minOk ? '#16a34a' : '#b45309' }} />
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 700, lineHeight: 1.5 }}>
                    {ok ? (
                      <span style={{ color: '#16a34a' }}>🏆 Meta global batida!</span>
                    ) : (
                      <>
                        <span style={{ color: minOk ? '#16a34a' : '#b45309' }}>
                          {minOk ? '✅ Mínima batida' : `Falta ${fmt.brl(minM - conf)} para a meta mínima`}
                        </span>
                        <span style={{ color: 'var(--muted)' }}> · </span>
                        <span style={{ color: '#0891b2' }}>Falta {fmt.brl(metaG - conf)} para a meta global</span>
                      </>
                    )}
                  </div>
                  {/* 🎁 Prêmios — repasse futuro provisionado quando a meta é batida */}
                  <div style={{ fontSize: 11, marginTop: 3, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.5 }}>
                    🎁 Prêmios: <span style={{ color: minOk ? '#16a34a' : 'inherit', fontWeight: minOk ? 800 : 600 }}>{fmt.brl(ms.premioMinimo ?? 1500)} na mínima{minOk ? ' ✅' : ''}</span>
                    <span> · </span>
                    <span style={{ color: ok ? '#16a34a' : 'inherit', fontWeight: ok ? 800 : 600 }}>{fmt.brl(ms.premio ?? 10000)} na global{ok ? ' ✅' : ''}</span>
                    {(minOk || ok) && (
                      <span style={{ color: '#b45309', fontWeight: 800 }}> — repasse futuro: {fmt.brl((minOk ? (ms.premioMinimo ?? 1500) : 0) + (ok ? (ms.premio ?? 10000) : 0))}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Filtros */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={abrirNovaVenda} className="btn btn-p btn-sm" style={{ gap: 6, fontWeight: 800 }}>
          <Plus size={14} /> Venda de balcão
        </button>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }} />
        <select value={setor} onChange={e => setSetor(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
          <option value="">Todos os setores</option>
          <option value="vacinas">Vacinas</option>
          <option value="consultas">Consultas</option>
          <option value="terapias">Terapias</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180, background: 'var(--bg2)', borderRadius: 9, padding: '6px 10px' }}>
          <Search size={14} color="var(--muted)" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, serviço, atendente…" style={{ border: 'none', background: 'none', outline: 'none', flex: 1, color: 'var(--txt)', fontSize: 13 }} />
        </div>
      </div>

      {/* Filtros rápidos (chips) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {[
          { k: '', rot: 'Todas' },
          { k: 'areceber', rot: `💰 A receber${nAReceber ? ` (${nAReceber})` : ''}`, cor: '#d97706' },
          { k: 'sem_comprovante', rot: 'Sem comprovante', cor: '#7c3aed' },
          ...(gestao ? [{ k: 'nao_conferidas', rot: 'Não conferidas', cor: '#0891b2' }] : []),
        ].map(c => {
          const ativo = filtroRapido === c.k;
          return (
            <button key={c.k} onClick={() => setFiltroRapido(c.k)} style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${ativo ? (c.cor || 'var(--tq)') : 'var(--border)'}`,
              background: ativo ? (c.cor || 'var(--tq)') : 'var(--card)', color: ativo ? '#fff' : 'var(--txt2)' }}>{c.rot}</button>
          );
        })}
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto' }}>
          {listaExibida.length} de {filtrada.length}{filtroRapido === 'areceber' && aReceber > 0 ? ` · ${fmt.brl(aReceber)} a receber` : ''}
        </div>
      </div>

      {erro && <div style={{ fontSize: 13, color: 'var(--err)', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : listaExibida.length === 0 ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
          <Wallet size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>{filtroRapido ? 'Nada neste filtro rápido.' : 'Nenhuma venda neste filtro.'}</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>{filtroRapido === 'areceber' ? 'Tudo recebido por aqui! 🎉' : 'As vendas registradas nos atendimentos aparecem aqui automaticamente.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {listaExibida.map(v => {
            const st = STATUS_INFO[v.status_pagamento] || { label: v.status_pagamento || '—', cor: 'var(--muted)', bg: 'var(--bg2)' };
            const cor = SETOR_COR[v.setor] || '#0E8C96';
            return (
              <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: 5, background: cor, flexShrink: 0 }} />
                <div style={{ padding: '13px 16px', flex: 1, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14.5 }}>{v.cliente_nome || v.paciente_nome || 'Cliente'}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: cor, background: cor + '18', borderRadius: 20, padding: '2px 8px' }}>{v.setor || '—'}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: st.cor, background: st.bg, borderRadius: 20, padding: '2px 8px' }}>{st.label}</span>
                      {!(v.n_comprovantes || 0) && (
                        <span title="Registrada sem comprovante — confirme se a venda foi concluída. Não entra no bônus." style={{ fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={11} /> confirmar conclusão
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {v.servico || v.categoria}{v.forma_pagamento ? ` · ${v.forma_pagamento}` : ''} · {fmtData(v.data_venda)}{v.atendente_nome ? ` · ${v.atendente_nome.split(' ')[0]}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 110 }}>
                    {gestao && editValor?.id === v.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <input autoFocus value={editValor.valor}
                          onChange={e => setEditValor({ id: v.id, valor: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') salvarValor(); if (e.key === 'Escape') setEditValor(null); }}
                          style={{ width: 92, padding: '4px 6px', borderRadius: 7, border: '1.5px solid var(--tq)', fontSize: 13.5, fontWeight: 700, textAlign: 'right' }} />
                        <button onClick={salvarValor} style={{ background: 'var(--tq)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 6px', display: 'flex' }}><Check size={13} /></button>
                      </div>
                    ) : (
                      <div onClick={(podeAnexar(v) && !(v.conferido && !gestao)) ? () => setEditValor({ id: v.id, valor: String(parseFloat(v.valor) || 0).replace('.', ',') }) : undefined}
                        title={(podeAnexar(v) && !(v.conferido && !gestao)) ? 'Clique para editar o valor da venda' : undefined}
                        style={{ fontSize: 16.5, fontWeight: 900, color: '#16a34a', cursor: (podeAnexar(v) && !(v.conferido && !gestao)) ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {fmt.brl(v.valor)}{(podeAnexar(v) && !(v.conferido && !gestao)) && <Pencil size={11} style={{ opacity: .45 }} />}
                      </div>
                    )}
                    {parseFloat(v.desconto) > 0 && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>desc. {fmt.brl(v.desconto)}</div>}
                  </div>
                  {ARECEBER_ST.includes(v.status_pagamento) && podeAnexar(v) && (
                    <button onClick={() => marcarRecebido(v)} disabled={recebendo === v.id} className="btn btn-sm" style={{ gap: 5, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800 }} title="Dar baixa: marcar como recebido">
                      <HandCoins size={13} /> {recebendo === v.id ? '…' : 'Receber'}
                    </button>
                  )}
                  {gestao && (
                    <div style={{ minWidth: 92, textAlign: 'right' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>Repasse</div>
                      {editRepasse?.id === v.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input autoFocus value={editRepasse.valor} onChange={e => setEditRepasse({ id: v.id, valor: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') salvarRepasse(); if (e.key === 'Escape') setEditRepasse(null); }}
                            placeholder="0,00" style={{ width: 66, padding: '3px 6px', borderRadius: 7, border: '1.5px solid var(--tq)', fontSize: 12, textAlign: 'right' }} />
                          <button onClick={salvarRepasse} style={{ background: 'var(--tq)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '3px 5px', display: 'flex' }}><Check size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setEditRepasse({ id: v.id, valor: parseFloat(v.repasse) ? String(v.repasse).replace('.', ',') : '' })}
                          title={parseFloat(v.repasse) > 0 ? 'Repasse ajustado manualmente — clique para editar' : 'Repasse automático (1% da venda) — clique para ajustar'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', color: parseFloat(v.repasse) > 0 ? '#b45309' : 'var(--muted)', fontWeight: 800, fontSize: 13.5 }}>
                          {fmt.brl(repasseDe(v))} <Pencil size={11} style={{ opacity: .6 }} />
                        </button>
                      )}
                    </div>
                  )}
                  {gestao && (
                    <button onClick={() => toggleConferido(v)} title={v.conferido ? 'Conferido pelo financeiro' : 'Marcar como conferido'}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: v.conferido ? '#e7f8ef' : 'var(--bg2)', color: v.conferido ? '#16a34a' : 'var(--muted)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11.5 }}>
                      {v.conferido ? <CheckCircle2 size={14} /> : <Circle size={14} />} {v.conferido ? 'Conferido' : 'Conferir'}
                    </button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(v.n_comprovantes || 0) > 0 ? (
                      <button onClick={() => abrirComprovantes(v)} className="btn btn-s btn-sm" style={{ gap: 5 }}>
                        <Paperclip size={13} /> {v.n_comprovantes} comprovante{v.n_comprovantes === 1 ? '' : 's'}
                      </button>
                    ) : podeAnexar(v) ? (
                      <button onClick={() => abrirComprovantes(v)} className="btn btn-p btn-sm" style={{ gap: 5 }}>
                        <Paperclip size={13} /> Anexar comprovante
                      </button>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--light)', fontWeight: 600 }}>sem comprovante</span>
                    )}
                  </div>
                  {podeAnexar(v) && !(v.conferido && !gestao) && (
                    <button onClick={() => abrirEditVenda(v)} title="Editar todas as informações da venda"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--tq3)', color: 'var(--tq2, #0e7490)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11.5 }}>
                      <Pencil size={13} /> Editar
                    </button>
                  )}
                  <button onClick={() => excluirVenda(v)} title="Excluir venda"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fdecec', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11.5 }}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* ➕ Modal: venda de balcão (cliente sem WhatsApp) */}
      {novaVenda && (
        <div onClick={() => setNovaVenda(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 480, maxWidth: '100%', padding: 22, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>➕ Venda de balcão</h3>
              <button onClick={() => setNovaVenda(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Cliente que chegou direto na clínica, sem passar pelo WhatsApp. Entra no caixa, nas metas e no placar normalmente.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Cliente *</label>
                <input autoFocus value={novaVenda.cliente_nome} onChange={e => setNovaVenda({ ...novaVenda, cliente_nome: e.target.value })} placeholder="Nome de quem pagou" /></div>
              <div className="field"><label>Paciente</label>
                <input value={novaVenda.paciente_nome} onChange={e => setNovaVenda({ ...novaVenda, paciente_nome: e.target.value })} placeholder="Quem recebeu o serviço" /></div>
              <div className="field"><label>Categoria</label>
                <select value={novaVenda.categoria} onChange={e => {
                  const cat = e.target.value;
                  const st = ['Vacinação Geral', 'Plano Vacinal', 'Fidelidade Mensal'].includes(cat) ? 'vacinas' : cat === 'Consulta' ? 'consultas' : 'terapias';
                  setNovaVenda({ ...novaVenda, categoria: cat, setor: st });
                }} style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {['Vacinação Geral', 'Plano Vacinal', 'Fidelidade Mensal', 'Consulta', 'Terapia'].map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Serviço</label>
                <input value={novaVenda.servico} onChange={e => setNovaVenda({ ...novaVenda, servico: e.target.value })} placeholder="ex: Pneumocócica 20 + Rotavírus" /></div>
              <div className="field"><label>Valor (R$) *</label>
                <input value={novaVenda.valor} onChange={e => setNovaVenda({ ...novaVenda, valor: e.target.value })} placeholder="0,00" /></div>
              <div className="field"><label>Desconto (R$)</label>
                <input value={novaVenda.desconto} onChange={e => setNovaVenda({ ...novaVenda, desconto: e.target.value })} placeholder="0,00" /></div>
              <div className="field"><label>Forma de pagamento</label>
                <select value={novaVenda.forma_pagamento} onChange={e => setNovaVenda({ ...novaVenda, forma_pagamento: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado', 'Cortesia'].map(f => <option key={f} value={f}>{f}</option>)}
                </select></div>
              <div className="field"><label>Status</label>
                <select value={novaVenda.status_pagamento} onChange={e => setNovaVenda({ ...novaVenda, status_pagamento: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {[['pago', 'Pago'], ['sinal', 'Sinal'], ['aguardando', 'Aguardando'], ['parcelado', 'Parcelado'], ['cortesia', 'Cortesia'], ['pendente', 'Pendente']].map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}
                </select></div>
              <div className="field"><label>Data</label>
                <input type="date" value={novaVenda.data_venda} onChange={e => setNovaVenda({ ...novaVenda, data_venda: e.target.value })} /></div>
              <div className="field"><label>Origem</label>
                <input value={novaVenda.origem} onChange={e => setNovaVenda({ ...novaVenda, origem: e.target.value })} placeholder="Balcão" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observação</label>
                <textarea rows={2} value={novaVenda.observacao} onChange={e => setNovaVenda({ ...novaVenda, observacao: e.target.value })} style={{ resize: 'vertical' }} /></div>
              {/* 📞 Ligação antes de fechar — entra no relatório da equipe */}
              <label onClick={() => setNovaVenda({ ...novaVenda, ligou: !novaVenda.ligou })}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', marginTop: 4,
                  background: novaVenda.ligou ? '#ecfdf5' : 'var(--bg2)', border: `1.5px solid ${novaVenda.ligou ? '#6ee7b7' : 'var(--border)'}` }}>
                <span style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${novaVenda.ligou ? '#16a34a' : 'var(--border)'}`, background: novaVenda.ligou ? '#16a34a' : 'transparent', color: '#fff', fontSize: 12, fontWeight: 900 }}>
                  {novaVenda.ligou ? '✓' : ''}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: novaVenda.ligou ? '#15803d' : 'var(--txt2)' }}>
                  📞 Liguei para a cliente antes de fechar
                </span>
              </label>
            </div>
            <button onClick={salvarNovaVenda} disabled={novaVendaSaving} className="btn btn-p" style={{ width: '100%', marginTop: 12, fontWeight: 800 }}>
              {novaVendaSaving ? '…' : '💾 Registrar venda'}
            </button>
          </div>
        </div>
      )}

      {/* ✏️ Modal: editar venda completa */}
      {editVenda && (
        <div onClick={() => setEditVenda(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 480, maxWidth: '100%', padding: 22, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>✏️ Editar venda</h3>
              <button onClick={() => setEditVenda(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Cliente</label>
                <input value={editVenda.cliente_nome} onChange={e => setEditVenda({ ...editVenda, cliente_nome: e.target.value })} /></div>
              <div className="field"><label>Paciente</label>
                <input value={editVenda.paciente_nome} onChange={e => setEditVenda({ ...editVenda, paciente_nome: e.target.value })} /></div>
              <div className="field"><label>Setor</label>
                <select value={editVenda.setor} onChange={e => setEditVenda({ ...editVenda, setor: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {[['vacinas', '💉 Vacinas'], ['consultas', '🩺 Consultas'], ['terapias', '🧩 Terapias']].map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}
                </select></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Serviço</label>
                <input value={editVenda.servico} onChange={e => setEditVenda({ ...editVenda, servico: e.target.value })} /></div>
              <div className="field"><label>Valor (R$)</label>
                <input value={editVenda.valor} onChange={e => setEditVenda({ ...editVenda, valor: e.target.value })} /></div>
              <div className="field"><label>Desconto (R$)</label>
                <input value={editVenda.desconto} onChange={e => setEditVenda({ ...editVenda, desconto: e.target.value })} /></div>
              <div className="field"><label>Forma de pagamento</label>
                <select value={editVenda.forma_pagamento} onChange={e => setEditVenda({ ...editVenda, forma_pagamento: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  <option value="">—</option>
                  {['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado', 'Cortesia'].map(f => <option key={f} value={f}>{f}</option>)}
                </select></div>
              <div className="field"><label>Status</label>
                <select value={editVenda.status_pagamento} onChange={e => setEditVenda({ ...editVenda, status_pagamento: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {[['pago', 'Pago'], ['sinal', 'Sinal'], ['aguardando', 'Aguardando'], ['parcelado', 'Parcelado'], ['cortesia', 'Cortesia'], ['pendente', 'Pendente']].map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}
                </select></div>
              <div className="field"><label>Data da venda</label>
                <input type="date" value={editVenda.data_venda} onChange={e => setEditVenda({ ...editVenda, data_venda: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observação</label>
                <textarea rows={2} value={editVenda.observacao} onChange={e => setEditVenda({ ...editVenda, observacao: e.target.value })} style={{ resize: 'vertical' }} /></div>
            </div>
            <button onClick={salvarEditVenda} disabled={editVendaSaving} className="btn btn-p" style={{ width: '100%', marginTop: 12, fontWeight: 800 }}>
              {editVendaSaving ? '…' : '💾 Salvar alterações'}
            </button>
          </div>
        </div>
      )}

      {/* Fechamento de repasses do mês */}
      {showRep && (
        <div onClick={() => setShowRep(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 560, maxWidth: '100%', maxHeight: '88vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', color: '#fff', background: 'linear-gradient(135deg,#7f1d1d,#b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>💸 Repasses de {mes}</div>
                <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>1% por venda da função atendente (ajustes manuais respeitados). Marque como pago ao acertar.</div>
              </div>
              <button onClick={() => setShowRep(false)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              {!repDados ? (
                <div style={{ color: 'var(--muted)', padding: 20 }}>Carregando…</div>
              ) : repDados.itens.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>Nenhum repasse a pagar neste mês.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {repDados.itens.map(it => (
                    <div key={String(it.atendente_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: it.pago ? '#e7f8ef' : 'var(--bg2)', border: `1.5px solid ${it.pago ? '#a7f3d0' : 'var(--border)'}`, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{it.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.vendas} venda(s) · vendeu {fmt.brl(it.vendido)}</div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: 15, color: it.pago ? '#16a34a' : '#b91c1c' }}>{fmt.brl(it.repasse)}</div>
                      {it.pago ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a' }}>✓ PAGO {it.pago_em ? `em ${fmtData(it.pago_em)}` : ''}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{it.pago_por ? `por ${String(it.pago_por).split(' ')[0]}` : ''} · <button onClick={() => pagarRep(it, true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 10, textDecoration: 'underline', padding: 0 }}>desfazer</button></div>
                        </div>
                      ) : (
                        <button onClick={() => pagarRep(it)} className="btn btn-sm" style={{ gap: 5, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800 }}>Marcar pago</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderTop: '2px solid var(--border)', fontWeight: 900, fontSize: 14 }}>
                    <span>Total do mês</span><span style={{ color: '#b91c1c' }}>{fmt.brl(repDados.total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Análise da IA */}
      {preview?.analise && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 440, maxWidth: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={17} color="#7c3aed" /> Análise do comprovante</h3>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            {(() => { const a = preview.analise; return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, fontWeight: 800,
                  background: a.confere ? '#e7f8ef' : '#fdf3e5', color: a.confere ? '#16a34a' : '#b45309' }}>
                  {a.confere ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  {a.confere ? 'Valor confere com a venda' : 'Atenção: valor não bate com a venda'}
                </div>
                {!a.parece_comprovante && <div style={{ fontSize: 12.5, color: 'var(--err)', fontWeight: 600 }}>⚠️ A imagem não parece um comprovante de pagamento.</div>}
                {[['Valor no comprovante', a.valor != null ? fmt.brl(a.valor) : '—'], ['Valor da venda', fmt.brl(a.valor_venda)], ['Data', a.data || '—'], ['Pagador', a.pagador || '—'], ['Recebedor', a.recebedor || '—'], ['Forma', a.forma || '—'], ['Instituição', a.instituicao || '—']].map(([k, val]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span><span style={{ fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
                {a.observacao && <div style={{ fontSize: 12.5, color: 'var(--txt2)', fontStyle: 'italic' }}>“{a.observacao}”</div>}
                <div style={{ fontSize: 10.5, color: 'var(--light)' }}>Confira sempre o documento original. A IA é um apoio, não substitui a conferência humana.</div>
              </div>
            ); })()}
          </div>
        </div>
      )}

      {/* Preview do comprovante */}
      {preview && preview.url && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 720, maxWidth: '100%', maxHeight: '90vh', padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {(preview.tipo || '').startsWith('image') ? <ImageIcon size={16} color="var(--tq2)" /> : <FileText size={16} color="var(--tq2)" />}
                <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.nome}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={preview.url} download={preview.nome} className="btn btn-s btn-sm" style={{ gap: 5, textDecoration: 'none' }}><Download size={13} /> Baixar</a>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bg2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(preview.tipo || '').startsWith('image') ? (
                <img src={preview.url} alt={preview.nome} style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} />
              ) : (
                <iframe src={preview.url} title={preview.nome} style={{ width: '100%', height: '72vh', border: 'none', borderRadius: 10 }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal gerenciar comprovantes (múltiplos) */}
      {compModal && (
        <div onClick={() => setCompModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 540, maxWidth: '100%', maxHeight: '88vh', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Paperclip size={17} color="var(--tq2)" /> Comprovantes</h3>
              <button onClick={() => setCompModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>{compModal.cliente_nome || compModal.paciente_nome || 'Venda'} · {fmt.brl(compModal.valor)}</div>
            {erro && <div style={{ fontSize: 12.5, color: 'var(--err)', fontWeight: 600, marginBottom: 8 }}>{erro}</div>}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {compLoad ? <div style={{ color: 'var(--muted)', padding: 16 }}>Carregando…</div>
              : comps.length === 0 ? <div style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>Nenhum comprovante ainda. Anexe abaixo.</div>
              : comps.map(c => (
                <div key={c.id} className="card" style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {(c.tipo || '').startsWith('image') ? <ImageIcon size={16} color="var(--tq2)" /> : <FileText size={16} color="var(--tq2)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome || 'Comprovante'}</div>
                    {c.analise && <div style={{ fontSize: 10.5, fontWeight: 700, color: c.analise.confere ? '#16a34a' : '#b45309' }}>{c.analise.confere ? '✓ IA confere' : '⚠ IA: verificar'} · {fmt.brl(c.analise.valor)}</div>}
                  </div>
                  <button onClick={() => verComp(c)} className="btn btn-s btn-sm" style={{ gap: 4 }} title="Ver"><Eye size={13} /></button>
                  {(c.tipo || '').startsWith('image') && (
                    c.analise ? (
                      <button onClick={() => setPreview({ analise: c.analise, nome: c.nome })} title="Ver análise" style={{ border: 'none', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', background: c.analise.confere ? '#e7f8ef' : '#fdf3e5', color: c.analise.confere ? '#16a34a' : '#b45309' }}>{c.analise.confere ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}</button>
                    ) : (
                      <button onClick={() => analisarComp(c)} disabled={analisandoComp === c.id} className="btn btn-sm" style={{ gap: 4, background: '#f2ecfe', color: '#7c3aed', border: 'none', fontWeight: 700 }} title="Analisar com IA"><Sparkles size={13} /> {analisandoComp === c.id ? '…' : 'IA'}</button>
                    )
                  )}
                  {podeAnexar(compModal) && <button onClick={() => removerComp(c)} title="Excluir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)' }}><Trash2 size={14} /></button>}
                </div>
              ))}
            </div>
            {podeAnexar(compModal) && (
              <button onClick={() => fileRef.current?.click()} disabled={anexando} className="btn btn-p" style={{ gap: 6, marginTop: 12 }}>
                <Plus size={14} /> {anexando ? 'Enviando…' : 'Anexar mais um comprovante'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal lançar saída/despesa */}
      {modalDesp && (
        <div onClick={() => setModalDesp(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><TrendingDown size={18} color="#dc2626" /> Lançar saída</h3>
              <button onClick={() => setModalDesp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="field" style={{ margin: 0 }}><label>Descrição *</label><input value={modalDesp.descricao} onChange={e => setModalDesp({ ...modalDesp, descricao: e.target.value })} placeholder="Ex: Repasse vacinadora, compra de insumos…" /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ margin: 0, flex: 1 }}><label>Valor (R$) *</label><input value={modalDesp.valor} onChange={e => setModalDesp({ ...modalDesp, valor: e.target.value })} placeholder="0,00" /></div>
                <div className="field" style={{ margin: 0, flex: 1 }}><label>Data</label><input type="date" value={modalDesp.data} onChange={e => setModalDesp({ ...modalDesp, data: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ margin: 0, flex: 1 }}><label>Categoria</label>
                  <select value={modalDesp.categoria} onChange={e => setModalDesp({ ...modalDesp, categoria: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                    {DESPESA_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0, flex: 1 }}><label>Setor</label>
                  <select value={modalDesp.setor} onChange={e => setModalDesp({ ...modalDesp, setor: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                    <option value="">Geral</option><option value="vacinas">Vacinas</option><option value="consultas">Consultas</option><option value="terapias">Terapias</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}><label>Forma de pagamento</label>
                <select value={modalDesp.forma_pagamento} onChange={e => setModalDesp({ ...modalDesp, forma_pagamento: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  <option value="">—</option>{FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={salvarDespesa} disabled={salvandoDesp} className="btn btn-p" style={{ flex: 1, gap: 6 }}><Check size={14} /> {salvandoDesp ? 'Salvando…' : 'Lançar saída'}</button>
                <button onClick={() => setModalDesp(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 🏁 RELATÓRIO DE METAS DO MÊS — prévia, impressão e fechamento */}
      {relMetas && (
        <div onClick={e => e.target === e.currentTarget && setRelMetas(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', background: 'linear-gradient(120deg,#0E8C96,#00B8C0)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17 }}>🏁</span>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>Relatório de metas</div>
                <div style={{ fontSize: 11, opacity: .9 }}>
                  {relMetas.fechado ? `Fechado por ${relMetas.fechado_por} em ${new Date(relMetas.fechado_em).toLocaleDateString('pt-BR')}` : 'Prévia — ainda não fechado'}
                </div>
              </div>
              <input type="month" value={mesFech} onChange={e => abrirFechamento(e.target.value)}
                style={{ padding: '5px 9px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700 }} />
              <button onClick={() => setRelMetas(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {relMetas.carregando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Calculando o mês…</div>
              : relMetas.erro ? <div style={{ color: 'var(--err)', fontSize: 13, fontWeight: 600 }}>⚠️ {relMetas.erro}</div>
              : (<>
                {relMetas.fechado && (
                  <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac', fontSize: 12.5, fontWeight: 700, color: '#15803d' }}>
                    ✅ Mês fechado — os números abaixo são a foto oficial e não mudam mais.
                  </div>
                )}
                {/* Por setor */}
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', marginBottom: 7 }}>Por setor</div>
                {(relMetas.setores || []).map(s2 => {
                  const N = { vacinas: '💉 Vacinas', consultas: '🩺 Consultas', terapias: '🧩 Terapias' }[s2.setor] || s2.setor;
                  return (
                    <div key={s2.setor} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, marginBottom: 3 }}>
                        <span>{N} <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>· {s2.vendas} venda(s)</span></span>
                        <span style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(s2.confirmado)}</span>
                      </div>
                      <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                        <span style={{ color: s2.bateu_minima ? '#16a34a' : '#b45309', fontWeight: 700 }}>
                          {s2.bateu_minima ? '✅ Mínima batida' : `Faltou ${fmt.brl(s2.falta_minima)} p/ a mínima`}
                        </span>
                        <span style={{ color: 'var(--muted)' }}> · </span>
                        <span style={{ color: s2.bateu_global ? '#16a34a' : '#0891b2', fontWeight: 700 }}>
                          {s2.bateu_global ? '🏆 Global batida' : `Faltou ${fmt.brl(s2.falta_global)} p/ a global`}
                        </span>
                        {s2.premio_conquistado > 0 && (
                          <span style={{ color: '#16a34a', fontWeight: 800 }}> · 🎁 Prêmio {fmt.brl(s2.premio_conquistado)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Por atendente */}
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', margin: '16px 0 7px' }}>Por atendente</div>
                {(relMetas.atendentes || []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma venda registrada no mês.</div>
                ) : relMetas.atendentes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: i === 0 ? 'var(--gold,#C4973B)' : 'var(--muted)', minWidth: 20 }}>{i + 1}º</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{String(a.nome).split(' ')[0]}
                      <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--muted)' }}> · {a.vendas} venda(s)</span></span>
                    {a.meta > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.bateu ? '#16a34a' : '#b45309' }}>
                        {a.bateu ? '✅ meta' : `faltou ${fmt.brl(a.falta)}`}
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ok,#16a34a)', minWidth: 90, textAlign: 'right' }}>{fmt.brl(a.confirmado)}</span>
                  </div>
                ))}

                {/* Totais */}
                <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 12, background: 'var(--bg2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>Confirmado</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--ok,#16a34a)' }}>{fmt.brl(relMetas.total?.confirmado)}</div></div>
                  <div><div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>A receber</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#d97706' }}>{fmt.brl(relMetas.total?.pendente)}</div></div>
                  <div><div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>🎁 Prêmios</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--tq2)' }}>{fmt.brl(relMetas.total?.premios)}</div></div>
                </div>
              </>)}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <button onClick={imprimirMetas} className="btn btn-s" style={{ gap: 6, fontWeight: 700 }}>🖨️ Imprimir</button>
              <div style={{ flex: 1 }} />
              {relMetas.fechado ? (
                gestao && (
                  <button onClick={async () => {
                    if (!window.confirm('Reabrir este mês? Os números voltam a ser recalculados.')) return;
                    try { await api.del(`/extras/metas/fechamento/${mesFech}`); abrirFechamento(mesFech); }
                    catch (e) { window.alert('Erro: ' + e.message); }
                  }} className="btn btn-s" style={{ color: 'var(--err)' }}>Reabrir mês</button>
                )
              ) : (
                <button onClick={confirmarFechamento} disabled={relBusy || relMetas.carregando || relMetas.erro} className="btn btn-p" style={{ fontWeight: 800 }}>
                  {relBusy ? 'Fechando…' : '🏁 Fechar o mês'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🔒 FECHAMENTO DO DIA — caixa e estoque conferidos e congelados */}
      {fd && (
        <div onClick={e => e.target === e.currentTarget && setFd(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '13px 20px', background: 'linear-gradient(120deg,#0E8C96,#00B8C0)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17 }}>🔒</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>Fechamento do dia</div>
                <div style={{ fontSize: 11, opacity: .9 }}>
                  {fd.fechado ? `Fechado por ${fd.fechado_por} em ${new Date(fd.fechado_em).toLocaleString('pt-BR')}` : 'Confira e feche caixa e estoque'}
                </div>
              </div>
              <input type="date" value={diaSel} onChange={e => abrirDia(e.target.value)}
                style={{ padding: '5px 9px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700 }} />
              <button onClick={() => setFd(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {fd.carregando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Conferindo o dia…</div>
              : fd.erro ? <div style={{ color: 'var(--err)', fontSize: 13, fontWeight: 600 }}>⚠️ {fd.erro}</div>
              : (<>
                {fd.fechado && (
                  <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac', fontSize: 12.5, fontWeight: 700, color: '#15803d' }}>
                    ✅ Dia fechado — esta é a conferência oficial.
                  </div>
                )}

                {/* 💰 CAIXA */}
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', marginBottom: 7 }}>💰 Caixa do dia</div>
                {(fd.caixa?.formas || []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Nenhuma venda registrada neste dia.</div>
                ) : (fd.caixa.formas.map(f2 => (
                  <div key={f2.forma} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{f2.forma} <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--muted)' }}>· {f2.n}x</span></span>
                    {Number(f2.a_receber) > 0 && <span style={{ fontSize: 11.5, color: '#d97706', fontWeight: 700 }}>a receber {fmt.brl(f2.a_receber)}</span>}
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ok,#16a34a)', minWidth: 92, textAlign: 'right' }}>{fmt.brl(f2.recebido)}</span>
                  </div>
                )))}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
                  {[['Vendas', fd.caixa?.vendas ?? 0], ['Recebido', fmt.brl(fd.caixa?.recebido)], ['A receber', fmt.brl(fd.caixa?.a_receber)]].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--bg2)', borderRadius: 11, padding: '8px 13px' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 900 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Conferência do dinheiro em espécie */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 13px', borderRadius: 11, background: 'var(--bg2)', marginBottom: 6 }}>
                  <div style={{ minWidth: 140 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>💵 Dinheiro esperado</div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>{fmt.brl(fd.caixa?.dinheiro_esperado)}</div>
                  </div>
                  <div style={{ minWidth: 130 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>Contado na gaveta</div>
                    <input value={dinContado} onChange={e => setDinContado(e.target.value)} disabled={fd.fechado} placeholder="0,00"
                      style={{ width: 120, padding: '6px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 800, background: 'var(--card)', color: 'var(--txt)', marginTop: 2 }} />
                  </div>
                  {(() => {
                    const cont = dinContado === '' ? null : parseFloat(String(dinContado).replace(',', '.'));
                    if (cont == null || isNaN(cont)) return null;
                    const dif = +(cont - Number(fd.caixa?.dinheiro_esperado || 0)).toFixed(2);
                    return (
                      <div style={{ minWidth: 110 }}>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>Diferença</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: dif === 0 ? 'var(--ok,#16a34a)' : 'var(--err,#dc2626)' }}>
                          {dif === 0 ? '✅ bateu' : fmt.brl(dif)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {fd.caixa?.sem_comprovante > 0 && (
                  <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9, padding: '7px 11px', marginBottom: 8 }}>
                    ⚠ {fd.caixa.sem_comprovante} venda(s) sem comprovante anexado — confira antes de fechar.
                  </div>
                )}

                {/* 💉 ESTOQUE */}
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', margin: '16px 0 7px' }}>💉 Estoque — doses do dia</div>
                {(fd.estoque || []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma dose aplicada ou prevista neste dia.</div>
                ) : (<>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', padding: '0 0 4px' }}>
                    <span style={{ flex: 1 }}>Vacina</span><span style={{ width: 62, textAlign: 'center' }}>Previstas</span>
                    <span style={{ width: 62, textAlign: 'center' }}>Aplicadas</span><span style={{ width: 74, textAlign: 'center' }}>Saldo</span>
                  </div>
                  {fd.estoque.map(e => (
                    <div key={e.vacina} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{e.vacina}</span>
                      <span style={{ width: 62, textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>{e.previstas}</span>
                      <span style={{ width: 62, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--tq2)' }}>{e.aplicadas}</span>
                      <input value={estContado[e.vacina] ?? ''} onChange={ev => setEstContado(p2 => ({ ...p2, [e.vacina]: ev.target.value }))}
                        disabled={fd.fechado} type="number" min={0} placeholder="—"
                        style={{ width: 74, padding: '4px 7px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12.5, textAlign: 'center', background: 'var(--card)', color: 'var(--txt)' }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>No campo <b>Saldo</b>, anote quantas doses sobraram na geladeira ao fim do dia.</div>
                </>)}

                {/* Observações */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', marginBottom: 5 }}>Observações do dia</div>
                  <textarea value={fdObs} onChange={e => setFdObs(e.target.value)} disabled={fd.fechado} rows={2}
                    placeholder="Ex.: sangria de R$ 200 para o banco, cliente pagou metade em dinheiro…"
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </>)}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <button onClick={imprimirDia} className="btn btn-s" style={{ gap: 6, fontWeight: 700 }}>🖨️ Imprimir</button>
              <div style={{ flex: 1 }} />
              {fd.fechado ? (
                gestao && (
                  <button onClick={async () => {
                    if (!window.confirm('Reabrir este dia? A conferência volta a ser recalculada.')) return;
                    try { await api.del(`/extras/fechamento-diario/${diaSel}`); abrirDia(diaSel); }
                    catch (e) { window.alert('Erro: ' + e.message); }
                  }} className="btn btn-s" style={{ color: 'var(--err)' }}>Reabrir dia</button>
                )
              ) : (
                <button onClick={fecharDia} disabled={fdBusy || fd.carregando || fd.erro} className="btn btn-p" style={{ fontWeight: 800 }}>
                  {fdBusy ? 'Fechando…' : '🔒 Fechar caixa e estoque'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
