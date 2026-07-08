import React, { useEffect, useState, useRef } from 'react';
import { Wallet, Paperclip, FileText, X, Check, Download, Eye, Search, Filter, Image as ImageIcon, CheckCircle2, Circle, FileSpreadsheet, Printer, Sparkles, AlertTriangle, Pencil } from 'lucide-react';
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
  const [preview, setPreview] = useState(null); // { url, nome, tipo }
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);
  const [alvoAnexo, setAlvoAnexo] = useState(null); // venda id sendo anexada
  const [anexando, setAnexando] = useState(null);

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

  const escolherArquivo = (id) => { setAlvoAnexo(id); setErro(''); fileRef.current?.click(); };

  const anexar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !alvoAnexo) return;
    const url = await fileToDataUrl(f);
    if (url.length > 15_500_000) { setErro('Comprovante muito grande (máx. ~12MB).'); return; }
    setAnexando(alvoAnexo); setErro('');
    try {
      const r = await api.patch(`/extras/vendas/${alvoAnexo}/comprovante`, { comprovante: url, filename: f.name, mimetype: f.type });
      setLista(p => p.map(v => v.id === alvoAnexo ? { ...v, tem_comprovante: true, comprovante_nome: r.comprovante_nome || f.name, comprovante_tipo: r.comprovante_tipo || f.type } : v));
    } catch (err) { setErro(err.message || 'Falha ao anexar.'); }
    setAnexando(null); setAlvoAnexo(null);
  };

  const verComprovante = async (v) => {
    try {
      const d = await api.get(`/extras/vendas/${v.id}/comprovante`);
      setPreview({ url: d.comprovante, nome: d.comprovante_nome || 'comprovante', tipo: d.comprovante_tipo || '' });
    } catch (err) { setErro(err.message || 'Não foi possível abrir o comprovante.'); }
  };

  const removerComprovante = async (v) => {
    if (!window.confirm('Remover o comprovante desta venda?')) return;
    try {
      await api.patch(`/extras/vendas/${v.id}/comprovante`, { comprovante: null });
      setLista(p => p.map(x => x.id === v.id ? { ...x, tem_comprovante: false, comprovante_nome: null } : x));
    } catch (err) { setErro(err.message || 'Falha ao remover.'); }
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

  const [analisando, setAnalisando] = useState(null);
  const analisarComprovante = async (v) => {
    setAnalisando(v.id); setErro('');
    try {
      const a = await api.post(`/extras/vendas/${v.id}/analisar-comprovante`, {});
      setLista(p => p.map(x => x.id === v.id ? { ...x, comprovante_analise: a } : x));
    } catch (err) { setErro(err.message || 'Falha na análise da IA.'); }
    setAnalisando(null);
  };

  const filtrada = lista.filter(v => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return [v.cliente_nome, v.paciente_nome, v.servico, v.atendente_nome].some(x => (x || '').toLowerCase().includes(q));
  });

  const total = filtrada.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const totalDesc = filtrada.reduce((s, v) => s + (parseFloat(v.desconto) || 0), 0);
  const totalRepasse = filtrada.reduce((s, v) => s + (parseFloat(v.repasse) || 0), 0);
  const liquido = total - totalRepasse;
  const comComp = filtrada.filter(v => v.tem_comprovante).length;
  const conferidas = filtrada.filter(v => v.conferido).length;

  // Fechamento por forma de pagamento
  const porForma = {};
  filtrada.forEach(v => { const f = v.forma_pagamento || 'Não informado'; porForma[f] = (porForma[f] || 0) + (parseFloat(v.valor) || 0); });
  const formasOrdenadas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);

  const podeAnexar = (v) => gestao || v.atendente_id === user?.id;

  const exportarCSV = () => {
    const head = ['Data', 'Cliente', 'Paciente', 'Setor', 'Categoria', 'Servico', 'Forma pagamento', 'Status', 'Valor', 'Desconto', 'Repasse', 'Atendente', 'Conferido', 'Comprovante'];
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = filtrada.map(v => [
      fmtData(v.data_venda), v.cliente_nome, v.paciente_nome, v.setor, v.categoria, v.servico,
      v.forma_pagamento, (STATUS_INFO[v.status_pagamento]?.label || v.status_pagamento),
      (parseFloat(v.valor) || 0).toFixed(2).replace('.', ','), (parseFloat(v.desconto) || 0).toFixed(2).replace('.', ','),
      (parseFloat(v.repasse) || 0).toFixed(2).replace('.', ','),
      v.atendente_nome, v.conferido ? 'Sim' : 'Nao', v.tem_comprovante ? 'Sim' : 'Nao',
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
      <td style="text-align:right">${fmt.brl(v.valor)}</td><td style="text-align:right">${parseFloat(v.repasse) > 0 ? fmt.brl(v.repasse) : '—'}</td><td style="text-align:center">${v.conferido ? '✓' : ''}</td></tr>`).join('');
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
        <span class="box"><b>Repasse:</b> ${fmt.brl(totalRepasse)}</span>
        <span class="box"><b>Líquido:</b> ${fmt.brl(liquido)}</span>
        <span class="box"><b>Descontos:</b> ${fmt.brl(totalDesc)}</span>
        <span class="box"><b>Conferidas:</b> ${conferidas}/${filtrada.length}</span>
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div style={{ padding: 28, maxWidth: 1140, margin: '0 auto' }}>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={anexar} />

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
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Repasse</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fca5a5' }}>{fmt.brl(totalRepasse)}</div></div>}
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Líquido</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a' }}>{fmt.brl(liquido)}</div></div>}
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Vendas</div><div style={{ fontSize: 22, fontWeight: 900 }}>{filtrada.length}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>C/ comprovante</div><div style={{ fontSize: 20, fontWeight: 900, color: '#c7d2fe' }}>{comComp}/{filtrada.length}</div></div>
          {gestao && <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Conferidas</div><div style={{ fontSize: 20, fontWeight: 900, color: '#7ee7c7' }}>{conferidas}/{filtrada.length}</div></div>}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportarCSV} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.92)', color: '#065f46', border: 'none', fontWeight: 800 }} title="Exportar planilha (CSV)"><FileSpreadsheet size={14} /> Planilha</button>
            <button onClick={exportarPDF} className="btn btn-sm" style={{ gap: 6, background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', fontWeight: 800 }} title="Gerar PDF / imprimir"><Printer size={14} /> PDF</button>
          </div>
        </div>
      </div>

      {/* Fechamento por forma de pagamento */}
      {formasOrdenadas.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 9 }}>💳 Fechamento por forma de pagamento</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {formasOrdenadas.map(([f, val]) => (
              <div key={f} style={{ flex: '1 1 130px', minWidth: 120, background: 'var(--bg2)', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{f}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--tq2)' }}>{fmt.brl(val)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--light)' }}>{total > 0 ? Math.round((val / total) * 100) : 0}% do total</div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {erro && <div style={{ fontSize: 13, color: 'var(--err)', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : filtrada.length === 0 ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
          <Wallet size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>Nenhuma venda neste filtro.</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>As vendas registradas nos atendimentos aparecem aqui automaticamente.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filtrada.map(v => {
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
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {v.servico || v.categoria}{v.forma_pagamento ? ` · ${v.forma_pagamento}` : ''} · {fmtData(v.data_venda)}{v.atendente_nome ? ` · ${v.atendente_nome.split(' ')[0]}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 96 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 900, color: '#16a34a' }}>{fmt.brl(v.valor)}</div>
                    {parseFloat(v.desconto) > 0 && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>desc. {fmt.brl(v.desconto)}</div>}
                  </div>
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
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', color: parseFloat(v.repasse) > 0 ? '#b45309' : 'var(--light)', fontWeight: 800, fontSize: 13.5 }}>
                          {parseFloat(v.repasse) > 0 ? fmt.brl(v.repasse) : 'definir'} <Pencil size={11} style={{ opacity: .6 }} />
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
                    {v.tem_comprovante ? (
                      <>
                        <button onClick={() => verComprovante(v)} className="btn btn-s btn-sm" style={{ gap: 5 }} title={v.comprovante_nome || 'Comprovante'}><Eye size={13} /> Comprovante</button>
                        {(v.comprovante_tipo || '').startsWith('image') && (
                          v.comprovante_analise ? (
                            <button onClick={() => setPreview({ analise: v.comprovante_analise, nome: v.comprovante_nome })} title="Ver análise da IA"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontWeight: 800, fontSize: 11,
                                border: 'none', background: v.comprovante_analise.confere ? '#e7f8ef' : '#fdf3e5', color: v.comprovante_analise.confere ? '#16a34a' : '#b45309' }}>
                              {v.comprovante_analise.confere ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} IA {v.comprovante_analise.confere ? 'confere' : 'verificar'}
                            </button>
                          ) : (
                            <button onClick={() => analisarComprovante(v)} disabled={analisando === v.id} className="btn btn-sm" style={{ gap: 5, background: '#f2ecfe', color: '#7c3aed', border: 'none', fontWeight: 700 }} title="IA analisa o comprovante">
                              <Sparkles size={13} /> {analisando === v.id ? 'Analisando…' : 'Analisar IA'}
                            </button>
                          )
                        )}
                        {podeAnexar(v) && <button onClick={() => removerComprovante(v)} title="Remover comprovante" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>}
                      </>
                    ) : podeAnexar(v) ? (
                      <button onClick={() => escolherArquivo(v.id)} disabled={anexando === v.id} className="btn btn-p btn-sm" style={{ gap: 5 }}>
                        <Paperclip size={13} /> {anexando === v.id ? 'Enviando…' : 'Anexar comprovante'}
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
    </div>
  );
}
