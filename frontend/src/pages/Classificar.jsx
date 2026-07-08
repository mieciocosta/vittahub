import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, RefreshCw, Zap, Trophy } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* HUB DE CLASSIFICAÇÃO — o coração da distribuição de leads.
   Cada conversa aqui é um cliente esperando: classifique rápido, com 1 clique,
   e o lead cai na carteira/funil certo pra virar venda. Esvaziar a fila =
   nenhum cliente esquecido. Respeita o acesso por setor (cada um vê o seu). */

const DESTINOS = [
  { k: 'vacinacao',       label: 'Vacinação',       cor: '#7c5cbf', emoji: '💉' },
  { k: 'planos_vacinais', label: 'Planos Vacinais', cor: '#3b82f6', emoji: '🗓️' },
  { k: 'fidelidade',      label: 'Fidelidade',      cor: '#eab308', emoji: '⭐' },
  { k: 'consultas',       label: 'Consultas',       cor: '#00B8C0', emoji: '🩺' },
  { k: 'terapias',        label: 'Terapias',        cor: '#C4973B', emoji: '🧩' },
  { k: 'banco_dados',     label: 'Banco de Dados',  cor: '#0E8C96', emoji: '🗄️', categoria: true },
];

const FRASES = [
  'Cada conversa aqui é um cliente esperando. Lead organizado é venda mais perto! 💰',
  'Fila vazia = nenhum cliente esquecido. Bora zerar e faturar! 🚀',
  'Classificar rápido é o 1º passo pra fechar. Você consegue! 🔥',
  'Organização hoje, comissão amanhã. Cada clique conta! 💎',
  'Lead na mão certa é lead que vende. Distribua e acelere! ⚡',
  'Não deixe dinheiro parado na fila. Cada card é uma oportunidade! 🏆',
];

// Mensagem de energia que cresce com o ritmo
function energiaMsg(n) {
  if (n >= 20) return '🏆 IMPARÁVEL! Você é uma máquina de organização!';
  if (n >= 15) return '⚡ Em chamas! Ninguém segura esse ritmo!';
  if (n >= 10) return '🚀 Voando! Já são 10+ leads no lugar certo!';
  if (n >= 5)  return '🔥 Embalou! Continua nesse pique!';
  if (n >= 1)  return '💪 Boa! Cada lead classificado conta.';
  return '';
}

export default function Classificar() {
  const api = useApi();
  const nav = useNavigate();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [feitas, setFeitas] = useState(0);
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState('');       // micro-elogio ao classificar
  const [placar, setPlacar] = useState(null);   // vendas de hoje (equipe)
  const hoje = Math.floor(Date.now() / 864e5);
  const frase = FRASES[hoje % FRASES.length];

  const load = useCallback(() => {
    setCarregando(true);
    api.get('/inbox/conversations?classificacao=sem&limit=300')
      .then(d => setLista(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : [])))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  }, []); // eslint-disable-line
  useEffect(load, [load]);

  // Placar de vendas do dia — reforça o clima de meta (atualiza a cada 30s)
  useEffect(() => {
    const p = () => api.get('/extras/vendas/hoje').then(setPlacar).catch(() => {});
    p(); const t = setInterval(p, 30000); return () => clearInterval(t);
  }, []); // eslint-disable-line

  const classificar = async (c, dest) => {
    if (busy) return;
    setBusy(c.id);
    setLista(prev => prev.filter(x => x.id !== c.id));
    setFeitas(n => n + 1);
    setFlash(`${dest.emoji} ${c.contact_name || 'Cliente'} → ${dest.label}!`);
    setTimeout(() => setFlash(''), 1600);
    try {
      if (dest.categoria) await api.patch(`/inbox/conversations/${c.id}/categoria`, { categoria: dest.k });
      else await api.patch(`/inbox/conversations/${c.id}/classificar`, { classificacao: dest.k });
    } catch (e) {
      setLista(prev => [c, ...prev]);
      setFeitas(n => Math.max(0, n - 1));
      window.alert('Não consegui classificar: ' + (e.message || e));
    } finally { setBusy(null); }
  };

  const restantes = lista.length;
  const total = restantes + feitas;
  const pct = total > 0 ? Math.round((feitas / total) * 100) : (feitas > 0 ? 100 : 0);
  const energia = energiaMsg(feitas);

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto' }}>
      {/* ── Cabeçalho motivacional ── */}
      <div style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #00B8C0 0%, #0E8C96 60%, #7c5cbf 130%)', boxShadow: '0 10px 30px rgba(0,184,192,.32)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 22, fontWeight: 800 }}>
              <Zap size={22} /> Central de Leads
            </div>
            <div style={{ fontSize: 13.5, opacity: .95, marginTop: 5, maxWidth: 520, lineHeight: 1.5 }}>{frase}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {placar && (placar.n > 0 || placar.total > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 12, padding: '8px 14px' }}>
                <span style={{ fontSize: 20 }}>💰</span>
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{placar.total != null ? fmt.brl(placar.total) : `${placar.n} venda${placar.n === 1 ? '' : 's'}`}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .9 }}>{placar.total != null ? `${placar.n} venda${placar.n === 1 ? '' : 's'} · fechadas hoje` : 'fechadas hoje pela equipe'}</div>
                </div>
              </div>
            )}
            {placar?.campeao && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 12, padding: '8px 14px' }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{(placar.campeao.nome || '—').split(' ')[0]}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .9 }}>campeã(o) do dia · {placar.campeao.n} venda{placar.campeao.n === 1 ? '' : 's'}</div>
                </div>
              </div>
            )}
            <button onClick={load} className="btn" style={{ gap: 7, background: 'rgba(255,255,255,.9)', color: 'var(--tq2)', border: 'none', fontWeight: 800 }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>
        {/* barra de progresso */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 5, opacity: .95 }}>
            <span>{feitas} organizada{feitas === 1 ? '' : 's'} agora · {restantes} na fila</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 6, transition: 'width .4s ease' }} />
          </div>
          {energia && <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 8 }}>{energia}</div>}
        </div>
      </div>

      {/* flash de micro-elogio */}
      {flash && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
          background: '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 30, fontWeight: 800, fontSize: 13.5, boxShadow: '0 8px 24px rgba(22,163,74,.4)' }}>
          {flash}
        </div>
      )}

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando a fila…</div>
      ) : restantes === 0 ? (
        <div className="card" style={{ padding: 52, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>{feitas > 0 ? '🚀' : '🎉'}</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Fila zerada!</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            {feitas > 0
              ? <>Você organizou <b style={{ color: 'var(--ok,#16a34a)' }}>{feitas} conversa{feitas === 1 ? '' : 's'}</b> — cada uma agora está na carteira certa, mais perto de virar venda. Mandou bem! 🏆</>
              : 'Nenhum cliente esperando classificação. Tudo organizado por aqui!'}
          </div>
          {feitas > 0 && (
            <button onClick={() => nav('/')} className="btn btn-p" style={{ marginTop: 16, gap: 7 }}><Trophy size={15} /> Ver o resultado no Resumo</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {lista.map(c => (
            <div key={c.id} className="card" style={{ padding: '14px 16px', opacity: busy === c.id ? .45 : 1, transition: 'opacity .15s', borderLeft: '3px solid var(--tq)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,var(--tq),var(--pet))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14.5, flexShrink: 0 }}>
                  {fmt.initials(c.contact_name || c.phone || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{c.contact_name || fmt.phone(c.phone)}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>⏱ {fmt.relTime(c.last_message_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {c.phone ? fmt.phone(c.phone) : ''}{c.last_message ? ` · ${c.last_message}` : ' · (sem prévia de mensagem)'}
                  </div>
                </div>
                <button onClick={() => nav(`/inbox?conv=${c.id}`)} title="Abrir no chat para ler" className="btn btn-sm" style={{ padding: '7px 11px', flexShrink: 0, gap: 5 }}>
                  <MessageSquare size={13} /> Ler
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, flexShrink: 0 }}>Mandar para:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DESTINOS.map(d => (
                    <button key={d.k} disabled={busy === c.id} onClick={() => classificar(c, d)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10,
                        border: `1.5px solid ${d.cor}`, background: d.cor + '14', color: d.cor,
                        fontSize: 12.5, fontWeight: 800, cursor: busy === c.id ? 'wait' : 'pointer', transition: 'all .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = d.cor; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = d.cor + '14'; e.currentTarget.style.color = d.cor; e.currentTarget.style.transform = 'none'; }}>
                      <span>{d.emoji}</span> {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
