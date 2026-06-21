import React, { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, Star, Database, Phone, CalendarDays } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';

/* Pasta de organização de clientes — usada por Fidelidade e Banco de Dados.
   Agora ORGANIZADA POR MÊS: os clientes ficam agrupados pelo mês em que
   entraram na pasta (mês de referência), do mais recente para o mais antigo.
   Na Fidelidade (mensalistas) dá pra marcar o DIA do mês que o cliente costuma
   vacinar — assim cada mês fica em ordem e ninguém é esquecido. */
export default function PastaClientes({ categoria }) {
  const api = useApi();
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const ehFidelidade = categoria === 'fidelidade';

  const cfg = ehFidelidade
    ? { titulo: 'Clientes Fidelidade', Icon: Star, cor: '#C4973B',
        sub: 'Clientes que vacinam todo mês (mensalistas). Organizados por mês — marque o dia de vacinação pra não perder ninguém.' }
    : { titulo: 'Banco de Dados', Icon: Database, cor: '#0E8C96',
        sub: 'Contatos que pegaram só 1 vacina e nada mais (ex.: idosos). Organizados por mês de entrada pra nenhum cliente ser esquecido.' };

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

  const definirDia = async (c) => {
    const atual = c.pasta_dia ? String(c.pasta_dia) : '';
    const v = window.prompt(`Dia do mês que ${c.contact_name || 'o cliente'} costuma vacinar (1 a 31). Deixe vazio para limpar:`, atual);
    if (v === null) return; // cancelou
    const dia = v.trim() === '' ? null : Math.max(1, Math.min(31, parseInt(v) || 0)) || null;
    setLista(p => p.map(x => x.id === c.id ? { ...x, pasta_dia: dia } : x));
    try { await api.patch(`/inbox/conversations/${c.id}/pasta-dia`, { dia }); } catch { load(); }
  };

  const filtrada = lista.filter(c => {
    const s = busca.toLowerCase().trim();
    if (!s) return true;
    return (c.contact_name || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
  });

  // Agrupa por mês de referência (categoria_em → último contato → criação)
  const refDate = (c) => c.categoria_em || c.last_message_at || c.created_at || null;
  const chaveMes = (c) => { const d = refDate(c); if (!d) return '0000-00'; const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
  const nomeMes = (chave) => {
    if (chave === '0000-00') return 'Sem data';
    const [y, m] = chave.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const grupos = {};
  for (const c of filtrada) { const k = chaveMes(c); (grupos[k] = grupos[k] || []).push(c); }
  const mesesOrdenados = Object.keys(grupos).sort((a, b) => b.localeCompare(a)); // mais recente primeiro
  // Dentro do mês: por dia de vacinação (quem tem dia primeiro), depois nome
  for (const k of mesesOrdenados) {
    grupos[k].sort((a, b) => {
      const da = a.pasta_dia || 99, db = b.pasta_dia || 99;
      if (da !== db) return da - db;
      return (a.contact_name || a.phone || '').localeCompare(b.contact_name || b.phone || '');
    });
  }

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
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>{filtrada.length} cliente(s) · {mesesOrdenados.length} mês(es)</span>
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
        mesesOrdenados.map(mes => (
          <div key={mes} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 10px' }}>
              <CalendarDays size={15} color={cfg.cor} />
              <span style={{ fontWeight: 800, fontSize: 14, textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: cfg.cor, borderRadius: 20, padding: '1px 9px' }}>{grupos[mes].length}</span>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {grupos[mes].map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < grupos[mes].length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {fmt.initials(c.contact_name || c.phone || '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.contact_name || fmt.phone(c.phone)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.phone ? fmt.phone(c.phone) : ''}{c.last_message ? ` · ${c.last_message}` : ''}
                    </div>
                  </div>
                  {ehFidelidade && (
                    <button onClick={() => definirDia(c)} title="Dia do mês que costuma vacinar"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: `1px solid ${c.pasta_dia ? cfg.cor : 'var(--border)'}`, background: c.pasta_dia ? cfg.cor + '18' : 'var(--card)', color: c.pasta_dia ? cfg.cor : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      <CalendarDays size={13} />{c.pasta_dia ? `dia ${c.pasta_dia}` : 'definir dia'}
                    </button>
                  )}
                  <button onClick={() => openWA(c.phone)} title="Abrir no WhatsApp" className="btn btn-sm" style={{ padding: '6px 9px' }}><Phone size={13} /></button>
                  <button onClick={() => tirar(c)} title="Tirar da pasta" className="btn btn-sm" style={{ padding: '6px 9px', color: 'var(--err)' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
