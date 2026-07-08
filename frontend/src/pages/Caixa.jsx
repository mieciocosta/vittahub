import React, { useEffect, useState, useRef } from 'react';
import { Wallet, Paperclip, FileText, X, Check, Download, Eye, Search, Filter, Image as ImageIcon } from 'lucide-react';
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

  const filtrada = lista.filter(v => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return [v.cliente_nome, v.paciente_nome, v.servico, v.atendente_nome].some(x => (x || '').toLowerCase().includes(q));
  });

  const total = filtrada.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
  const totalDesc = filtrada.reduce((s, v) => s + (parseFloat(v.desconto) || 0), 0);
  const comComp = filtrada.filter(v => v.tem_comprovante).length;

  const podeAnexar = (v) => gestao || v.atendente_id === user?.id;

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
        <div style={{ display: 'flex', gap: 22, marginTop: 16, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Total{gestao ? '' : ' (suas vendas)'}</div><div style={{ fontSize: 22, fontWeight: 900, color: '#a7f3d0' }}>{fmt.brl(total)}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Vendas</div><div style={{ fontSize: 22, fontWeight: 900 }}>{filtrada.length}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Descontos</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fca5a5' }}>{fmt.brl(totalDesc)}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>C/ comprovante</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a' }}>{comComp}/{filtrada.length}</div></div>
        </div>
      </div>

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {v.tem_comprovante ? (
                      <>
                        <button onClick={() => verComprovante(v)} className="btn btn-s btn-sm" style={{ gap: 5 }} title={v.comprovante_nome || 'Comprovante'}><Eye size={13} /> Comprovante</button>
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

      {/* Preview do comprovante */}
      {preview && (
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
