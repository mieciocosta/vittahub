import React, { useEffect, useState, useRef } from 'react';
import { Wallet, Paperclip, FileText, X, Check, Download, Eye, Search, Filter, Image as ImageIcon, CheckCircle2, Circle, FileSpreadsheet, Printer, Sparkles, AlertTriangle, Pencil, HandCoins, TrendingDown, TrendingUp, Plus, Trash2, CalendarCheck, Gift } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

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
    if (url.length > 15_500_000) { setErro('Comprovante muito grande (máx. ~12MB).'); return; }
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
    setRecebendo(v.id); setErro('');
    setLista(p => p.map(x => x.id === v.id ? { ...x, status_pagamento: 'pago' } : x));
    try { await api.patch(`/extras/vendas/${v.id}/receber`, { status: 'pago' }); }
    catch (err) { setErro(err.message || 'Falha ao dar baixa.'); load(); }
    setRecebendo(null);
  };

  // Saídas / despesas (gestão) — pra fechar o saldo real
  const [aba, setAba] = useState('entradas'); // 'entradas' | 'saidas'
  const [despesas, setDespesas] = useState([]);
  const [despTotal, setDespTotal] = useState(0);
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
  const excluirDespesa = async (d) => {
    if (!window.confirm(`Remover "${d.descricao}"?`)) return;
    setDespesas(p => p.filter(x => x.id !== d.id)); setDespTotal(t => t - (parseFloat(d.valor) || 0));
    try { await api.del(`/extras/despesas/${d.id}`); } catch { loadDespesas(); }
  };

  const filtrada = lista.filter(v => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return [v.cliente_nome, v.paciente_nome, v.servico, v.atendente_nome].some(x => (x || '').toLowerCase().includes(q));
  });

  const total = filtrada.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const totalDesc = filtrada.reduce((s, v) => s + (parseFloat(v.desconto) || 0), 0);
  // Repasse = 1% sobre cada venda (padrão automático). Gestão ainda pode ajustar
  // manualmente uma venda específica; nesse caso o valor definido prevalece sobre o 1%.
  const TAXA_REPASSE = 0.01;
  const repasseDe = (v) => { const m = parseFloat(v.repasse) || 0; return m > 0 ? m : (parseFloat(v.valor) || 0) * TAXA_REPASSE; };
  const totalRepasse = filtrada.reduce((s, v) => s + repasseDe(v), 0);
  const liquido = total - totalRepasse;
  const comComp = filtrada.filter(v => (v.n_comprovantes || 0) > 0).length;
  const conferidas = filtrada.filter(v => v.conferido).length;

  // Fechamento por forma de pagamento — as 3 principais sempre visíveis + Outros
  const RECEBIDO_ST = ['pago', 'cortesia'];
  const ARECEBER_ST = ['sinal', 'aguardando', 'parcelado', 'pendente'];
  const fech = { Pix: { v: 0, n: 0 }, 'Cartão': { v: 0, n: 0 }, Dinheiro: { v: 0, n: 0 }, Outros: { v: 0, n: 0 } };
  filtrada.forEach(v => {
    const val = parseFloat(v.valor) || 0;
    const chave = ['Pix', 'Cartão', 'Dinheiro'].includes(v.forma_pagamento) ? v.forma_pagamento : 'Outros';
    fech[chave].v += val; fech[chave].n += 1;
  });
  const formasFixas = ['Pix', 'Cartão', 'Dinheiro'];
  const formaCor = { Pix: '#059669', 'Cartão': '#2563eb', Dinheiro: '#d97706', Outros: '#7c3aed' };
  const formaIcone = { Pix: '⚡', 'Cartão': '💳', Dinheiro: '💵', Outros: '🔗' };
  const formasOrdenadas = [...formasFixas, ...(fech.Outros.v > 0 ? ['Outros'] : [])].map(f => [f, fech[f].v]);

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
  const hojeISO = new Date().toISOString().slice(0, 10);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><Wallet size={24} /> Caixa</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          Todas as vendas registradas ficam aqui. Anexe o comprovante de pagamento de cada uma pra manter o financeiro organizado. 💚
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Total vendido{gestao ? '' : ' (suas)'}</div><div style={{ fontSize: 22, fontWeight: 900, color: '#a7f3d0' }}>{fmt.brl(total)}</div></div>
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Repasse (1%)</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fca5a5' }}>{fmt.brl(totalRepasse)}</div></div>}
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Líquido</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a' }}>{fmt.brl(liquido)}</div></div>}
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Vendas</div><div style={{ fontSize: 22, fontWeight: 900 }}>{filtrada.length}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>C/ comprovante</div><div style={{ fontSize: 20, fontWeight: 900, color: '#c7d2fe' }}>{comComp}/{filtrada.length}</div></div>
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Conferidas</div><div style={{ fontSize: 20, fontWeight: 900, color: '#7ee7c7' }}>{conferidas}/{filtrada.length}</div></div>}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportarCaixaDia} className="btn btn-sm" style={{ gap: 6, background: '#fde68a', color: '#7c2d12', border: 'none', fontWeight: 800 }} title="Fechamento do dia de hoje (PDF)"><CalendarCheck size={14} /> Caixa do dia{vendasHoje.length ? ` (${vendasHoje.length})` : ''}</button>
            <button onClick={exportarCSV} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.92)', color: '#065f46', border: 'none', fontWeight: 800 }} title="Exportar planilha (CSV)"><FileSpreadsheet size={14} /> Planilha</button>
            <button onClick={exportarPDF} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', fontWeight: 800 }} title="Gerar PDF do mês / imprimir"><Printer size={14} /> PDF do mês</button>
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
              <div key={f} style={{ flex: '1 1 140px', minWidth: 130, background: 'var(--bg2)', borderRadius: 11, padding: '9px 13px', borderLeft: `3px solid ${cor}` }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{formaIcone[f]} {f}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: cor }}>{fmt.brl(val)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--light)' }}>{fech[f].n} venda(s) · {total > 0 ? Math.round((val / total) * 100) : 0}%</div>
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
        </div>
      )}

      {aba === 'saidas' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Saídas de {mes} · <span style={{ color: '#dc2626' }}>{fmt.brl(despTotal)}</span></div>
            <button onClick={() => { setErro(''); setModalDesp({ descricao: '', categoria: 'Outros', valor: '', setor: '', forma_pagamento: '', data: new Date().toISOString().slice(0, 10) }); }} className="btn btn-p btn-sm" style={{ gap: 6 }}><Plus size={14} /> Lançar saída</button>
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
      {/* Filtros */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
                  <div style={{ textAlign: 'right', minWidth: 96 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 900, color: '#16a34a' }}>{fmt.brl(v.valor)}</div>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
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
    </div>
  );
}
