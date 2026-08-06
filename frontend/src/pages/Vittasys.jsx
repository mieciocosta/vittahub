import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search, RefreshCw, Settings2 } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* 🏥 VITTASYS DENTRO DO VITTAHUB
   Aba que abre o Vittasys aqui dentro (sem trocar de janela) e leva o nome do
   cliente já na busca. Alguns sistemas bloqueiam ser exibidos dentro de outro
   site — quando isso acontece, o botão "abrir em nova aba" resolve na hora. */

const PADRAO = 'https://vittasys.vittalissaude.com.br';

export default function Vittasys() {
  const api = useApi();
  const { user } = useAuth();
  const gestao = ['master', 'supervisor'].includes(user?.role);
  const [cfg, setCfg] = useState({ url: PADRAO, busca_url: '' });
  const [busca, setBusca] = useState('');
  const [src, setSrc] = useState(PADRAO);
  const [bloqueado, setBloqueado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [clientes, setClientes] = useState([]);
  const iframeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    // Veio da ficha do cliente (?cliente=Nome): já abre a busca nele
    const nome = new URLSearchParams(window.location.search).get('cliente') || '';
    api.get('/extras/vittasys/config')
      .then(d => {
        const c = { url: d?.url || PADRAO, busca_url: d?.busca_url || '' };
        setCfg(c);
        if (nome) {
          setBusca(nome);
          const base = (c.url || PADRAO).replace(/\/+$/, '');
          setSrc(c.busca_url?.includes('{NOME}') ? c.busca_url.replace('{NOME}', encodeURIComponent(nome)) : base);
        } else setSrc(c.url);
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  // Alguns sistemas recusam ser embutidos: se não carregar em 6s, oferecemos a aba
  useEffect(() => {
    setCarregando(true); setBloqueado(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setCarregando(false); setBloqueado(true); }, 6000);
    return () => clearTimeout(timerRef.current);
  }, [src]);

  const montarUrl = (nome) => {
    const base = (cfg.url || PADRAO).replace(/\/+$/, '');
    if (!nome) return base;
    if (cfg.busca_url && cfg.busca_url.includes('{NOME}')) return cfg.busca_url.replace('{NOME}', encodeURIComponent(nome));
    return base;
  };

  const abrir = (nome) => {
    const url = montarUrl(nome);
    setSrc(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now());
  };

  // Busca no CADASTRO do VittaHub — dá o nome exato pra levar ao Vittasys
  const buscarClientes = async (q) => {
    setBusca(q);
    if (q.trim().length < 2) return setClientes([]);
    try {
      const d = await api.get(`/inbox/conversations/buscar?q=${encodeURIComponent(q.trim())}`);
      setClientes((Array.isArray(d) ? d : []).slice(0, 6));
    } catch { setClientes([]); }
  };

  const salvarCfg = async () => {
    try { await api.put('/extras/vittasys/config', cfg); setEditando(false); setSrc(cfg.url); }
    catch (e) { window.alert('Erro: ' + e.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 42px)' }}>
      {/* Barra de busca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>🏥 Vittasys</span>
        <div style={{ position: 'relative', flex: 1, minWidth: 210, maxWidth: 420 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--muted)' }} />
          <input value={busca} onChange={e => buscarClientes(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { abrir(busca); setClientes([]); } }}
            placeholder="Buscar cliente e abrir no Vittasys…"
            style={{ width: '100%', padding: '8px 11px 8px 32px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--bg2)', color: 'var(--txt)', boxSizing: 'border-box' }} />
          {clientes.length > 0 && (
            <div style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 40, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--s4)', overflow: 'hidden' }}>
              {clientes.map(c => (
                <div key={c.id} onClick={() => { const n = c.contact_name || c.phone; setBusca(n); abrir(n); setClientes([]); }}
                  style={{ padding: '9px 13px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ fontWeight: 700 }}>{c.contact_name || 'Cliente'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => abrir(busca)} className="btn btn-p btn-sm" style={{ fontWeight: 700 }}>Abrir</button>
        <button onClick={() => setSrc(montarUrl('') + '?_t=' + Date.now())} title="Recarregar" className="btn btn-s btn-sm"><RefreshCw size={13} /></button>
        <a href={montarUrl(busca)} target="_blank" rel="noreferrer" className="btn btn-s btn-sm" style={{ gap: 5, fontWeight: 700 }}>
          <ExternalLink size={13} /> Nova aba
        </a>
        {gestao && <button onClick={() => setEditando(e => !e)} title="Configurar endereço" className="btn btn-s btn-sm"><Settings2 size={13} /></button>}
      </div>

      {editando && (
        <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 7, lineHeight: 1.6 }}>
            <b>Endereço do Vittasys</b> e, se o sistema tiver busca por link, o <b>modelo com {'{NOME}'}</b> — assim a busca já abre no cliente certo.
          </div>
          <input value={cfg.url} onChange={e => setCfg({ ...cfg, url: e.target.value })} placeholder="https://vittasys.vittalissaude.com.br"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, marginBottom: 7, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box' }} />
          <input value={cfg.busca_url} onChange={e => setCfg({ ...cfg, busca_url: e.target.value })} placeholder="https://vittasys.vittalissaude.com.br/pacientes?busca={NOME}"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box' }} />
          <button onClick={salvarCfg} className="btn btn-p btn-sm" style={{ marginTop: 9, fontWeight: 700 }}>Salvar</button>
        </div>
      )}

      {/* O sistema embutido */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg2)' }}>
        {carregando && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, zIndex: 2, pointerEvents: 'none' }}>
            <span className="spin" style={{ width: 22, height: 22, borderColor: 'rgba(0,184,192,.2)', borderTopColor: 'var(--tq)', marginRight: 10 }} /> Abrindo o Vittasys…
          </div>
        )}
        {bloqueado && (
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 3, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '11px 16px', maxWidth: 520, boxShadow: 'var(--s4)' }}>
            <div style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
              <b>Se a tela abaixo estiver em branco</b>, o Vittasys não permite ser exibido dentro de outro sistema (proteção do próprio servidor).
              Use o botão <b>Nova aba</b> — a busca do cliente vai junto.
            </div>
          </div>
        )}
        <iframe ref={iframeRef} src={src} title="Vittasys"
          onLoad={() => { setCarregando(false); clearTimeout(timerRef.current); }}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }} />
      </div>
    </div>
  );
}
