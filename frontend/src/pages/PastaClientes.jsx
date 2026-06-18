import React, { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, MessageSquare, Star, Database, Phone } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';

/* Pasta de organização de clientes — usada por Fidelidade e Banco de Dados.
   Lista as conversas movidas pra esta categoria, com busca e ações. */
export default function PastaClientes({ categoria }) {
  const api = useApi();
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  const cfg = categoria === 'fidelidade'
    ? { titulo: 'Clientes Fidelidade', Icon: Star, cor: '#C4973B',
        sub: 'Clientes que vacinam todo mês (mensalistas). Mova atendimentos para cá pra organizar e não perder o contato.' }
    : { titulo: 'Banco de Dados', Icon: Database, cor: '#0E8C96',
        sub: 'Contatos que pegaram só 1 vacina e nada mais (ex.: idosos). Ficam guardados aqui pra nenhum cliente ser esquecido.' };

  const load = useCallback(() => {
    setCarregando(true);
    api.get(`/inbox/conversations?categoria=${categoria}&limit=500`)
      .then(d => setLista(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : [])))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  }, [categoria]); // eslint-disable-line
  useEffect(load, [load]);

  const tirar = async (c) => {
    if (!window.confirm(`Tirar "${c.contact_name || c.phone}" da pasta? Ele volta para o fluxo normal de atendimento.`)) return;
    setLista(p => p.filter(x => x.id !== c.id));
    try { await api.patch(`/inbox/conversations/${c.id}/categoria`, { categoria: null }); } catch { load(); }
  };

  const filtrada = lista.filter(c => {
    const s = busca.toLowerCase().trim();
    if (!s) return true;
    return (c.contact_name || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
  });

  return (
    <div style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: cfg.cor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <cfg.Icon size={22} color={cfg.cor} />
        </div>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>{cfg.titulo}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 620 }}>{cfg.sub}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>{filtrada.length} cliente(s)</span>
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : filtrada.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <cfg.Icon size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhum cliente nesta pasta ainda.</div>
          <div style={{ fontSize: 12.5 }}>No chat, abra um atendimento e use “Mover para {cfg.titulo}”.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtrada.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < filtrada.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {fmt.initials(c.contact_name || c.phone || '?')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.contact_name || fmt.phone(c.phone)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.phone ? fmt.phone(c.phone) : ''}{c.last_message ? ` · ${c.last_message}` : ''}
                </div>
              </div>
              <button onClick={() => openWA(c.phone)} title="Abrir no WhatsApp" className="btn btn-sm" style={{ padding: '6px 9px' }}><Phone size={13} /></button>
              <button onClick={() => tirar(c)} title="Tirar da pasta" className="btn btn-sm" style={{ padding: '6px 9px', color: 'var(--err)' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
