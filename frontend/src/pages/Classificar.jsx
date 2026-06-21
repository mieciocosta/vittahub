import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, CheckCircle2, RefreshCw } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* HUB DE CLASSIFICAÇÃO RÁPIDA
   Lista só as conversas SEM classificação (as "Novas a classificar") e deixa
   jogar cada uma, com 1 clique, pro destino certo. Esvazia a fila rápido e
   alimenta as páginas por setor/pasta — que dependem da conversa classificada.
   Respeita o acesso por setor (cada um classifica o que enxerga; master vê tudo). */

// Destinos: 5 classificações (vão pro chat do setor / pasta) + Banco de Dados.
const DESTINOS = [
  { k: 'vacinacao',       label: 'Vacinação',       cor: '#7c5cbf', emoji: '💉' },
  { k: 'planos_vacinais', label: 'Planos Vacinais', cor: '#3b82f6', emoji: '🗓️' },
  { k: 'fidelidade',      label: 'Fidelidade',      cor: '#eab308', emoji: '⭐' },
  { k: 'consultas',       label: 'Consultas',       cor: '#00B8C0', emoji: '🩺' },
  { k: 'terapias',        label: 'Terapias',        cor: '#C4973B', emoji: '🧩' },
  { k: 'banco_dados',     label: 'Banco de Dados',  cor: '#0E8C96', emoji: '🗄️', categoria: true },
];

export default function Classificar() {
  const api = useApi();
  const nav = useNavigate();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [feitas, setFeitas] = useState(0);      // quantas classifiquei nesta sessão
  const [busy, setBusy] = useState(null);        // id em processamento

  const load = useCallback(() => {
    setCarregando(true);
    api.get('/inbox/conversations?classificacao=sem&limit=300')
      .then(d => setLista(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : [])))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  }, []); // eslint-disable-line
  useEffect(load, [load]);

  const classificar = async (c, dest) => {
    if (busy) return;
    setBusy(c.id);
    // otimista: tira da fila na hora
    setLista(prev => prev.filter(x => x.id !== c.id));
    setFeitas(n => n + 1);
    try {
      if (dest.categoria) await api.patch(`/inbox/conversations/${c.id}/categoria`, { categoria: dest.k });
      else await api.patch(`/inbox/conversations/${c.id}/classificar`, { classificacao: dest.k });
    } catch (e) {
      // deu erro — devolve pra fila
      setLista(prev => [c, ...prev]);
      setFeitas(n => Math.max(0, n - 1));
      window.alert('Não consegui classificar: ' + (e.message || e));
    } finally { setBusy(null); }
  };

  const restantes = lista.length;

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto' }}>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Classificar conversas</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
            Bata o olho e mande cada conversa pro lugar certo com 1 clique. Some da fila na hora.
          </p>
        </div>
        <button onClick={load} className="btn btn-s" style={{ gap: 7 }}><RefreshCw size={14} /> Atualizar</button>
      </div>

      {/* faixa de progresso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: restantes > 0 ? 'var(--tq2)' : 'var(--ok,#16a34a)' }}>{restantes}</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.3 }}>conversas<br />na fila</span>
        </div>
        {feitas > 0 && (
          <div className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--tq4)' }}>
            <CheckCircle2 size={20} color="var(--ok,#16a34a)" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>{feitas} classificada{feitas > 1 ? 's' : ''} agora</span>
          </div>
        )}
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando a fila…</div>
      ) : restantes === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Fila zerada!</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhuma conversa esperando classificação. Bom trabalho!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map(c => (
            <div key={c.id} className="card" style={{ padding: '14px 16px', opacity: busy === c.id ? .5 : 1, transition: 'opacity .15s' }}>
              {/* identificação + preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,var(--tq),var(--pet))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {fmt.initials(c.contact_name || c.phone || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{c.contact_name || fmt.phone(c.phone)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt.relTime(c.last_message_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {c.phone ? fmt.phone(c.phone) : ''}{c.last_message ? ` · ${c.last_message}` : ' · (sem prévia de mensagem)'}
                  </div>
                </div>
                <button onClick={() => nav(`/inbox?conv=${c.id}`)} title="Abrir no chat para ler" className="btn btn-sm" style={{ padding: '7px 10px', flexShrink: 0, gap: 5 }}>
                  <MessageSquare size={13} /> Ler
                </button>
              </div>

              {/* botões de destino */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DESTINOS.map(d => (
                  <button key={d.k} disabled={busy === c.id} onClick={() => classificar(c, d)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10,
                      border: `1.5px solid ${d.cor}`, background: d.cor + '14', color: d.cor,
                      fontSize: 12.5, fontWeight: 700, cursor: busy === c.id ? 'wait' : 'pointer', transition: 'all .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = d.cor; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = d.cor + '14'; e.currentTarget.style.color = d.cor; }}>
                    <span>{d.emoji}</span> {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
