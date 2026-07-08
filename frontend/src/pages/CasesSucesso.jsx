import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, MessageSquare, Search, Sparkles } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* CASES DE SUCESSO — conversas que viraram VENDA. A equipe estuda o padrão de
   atendimento vencedor pra replicar. Valor em R$ só pra gestão. */

const ICO = { vacinas: '💉', consultas: '🩺', terapias: '🧩' };

export default function CasesSucesso() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const gestao = user?.role === 'master' || user?.role === 'supervisor';
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get('/inbox/cases-sucesso')
      .then(d => setLista(Array.isArray(d) ? d : []))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  }, []); // eslint-disable-line

  const filtrada = lista.filter(c => {
    const s = busca.toLowerCase().trim();
    if (!s) return true;
    return (c.contact_name || '').toLowerCase().includes(s) || (c.servico || '').toLowerCase().includes(s) || (c.categoria || '').toLowerCase().includes(s) || (c.atendente_nome || '').toLowerCase().includes(s);
  });

  return (
    <div style={{ padding: 28, maxWidth: 1040, margin: '0 auto' }}>
      {/* cabeçalho premium */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #C4973B 0%, #b45309 55%, #7c2d12 130%)', boxShadow: '0 10px 30px rgba(196,151,59,.3)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><Trophy size={24} /> Cases de Sucesso</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          Conversas que <b>viraram venda</b>. Estude o padrão de atendimento vencedor — o jeito de abordar, conduzir e fechar — e replique na equipe. 🏆
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 380 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por cliente, serviço, atendente…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>{filtrada.length} case(s)</span>
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando cases…</div>
      ) : filtrada.length === 0 ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
          <Trophy size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhum case ainda.</div>
          <div style={{ fontSize: 12.5 }}>Assim que as vendas forem registradas, as conversas que fecharam aparecem aqui pra estudo.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14 }}>
          {filtrada.map(c => (
            <div key={c.id} className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '3px solid #C4973B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#C4973B,#b45309)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {fmt.initials(c.contact_name || c.phone || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5 }}>{c.contact_name || fmt.phone(c.phone)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ICO[c.setor] || '📌'} {c.categoria || '—'}{c.servico ? ` · ${c.servico}` : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                <span>👤 {(c.atendente_nome || '—').split(' ')[0]}</span>
                <span>{c.data_venda ? new Date(c.data_venda).toLocaleDateString('pt-BR') : ''}</span>
              </div>
              {gestao && c.valor != null && (
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(c.valor)}</div>
              )}
              <button onClick={() => nav(`/inbox?conv=${c.id}`)} className="btn btn-p" style={{ gap: 7, marginTop: 2 }}>
                <MessageSquare size={14} /> Estudar a conversa
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 22, padding: '14px 18px', borderRadius: 12, background: 'var(--tq4)', border: '1px solid var(--tq3)', fontSize: 12.5, color: 'var(--txt2)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Sparkles size={18} color="var(--tq2)" style={{ flexShrink: 0 }} />
        <span>Dica: abra os cases, veja como a atendente <b>abordou, tirou dúvidas e conduziu ao fechamento</b>, e transforme isso no <b>passo a passo dos funis</b> pra padronizar o atendimento da equipe.</span>
      </div>
    </div>
  );
}
