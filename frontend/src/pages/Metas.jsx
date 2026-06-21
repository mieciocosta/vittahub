import React, { useEffect, useState } from 'react';
import { Target, TrendingUp, Save } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* Metas — meta de vendas por setor, com as 4 camadas (confirmado/agendado/
   pendente/falta) e ranking por atendente e categoria. */

const SETORES = [
  ['vacinas', '💉 Vacinas', '#7c5cbf'],
  ['consultas', '🩺 Consultas', '#00B8C0'],
  ['terapias', '🧩 Terapias', '#C4973B'],
];

export default function Metas() {
  const api = useApi();
  const { user } = useAuth();
  const ehGestao = user?.role === 'master' || user?.role === 'supervisor';
  const [data, setData] = useState(null);
  const [metaEdit, setMetaEdit] = useState({ vacinas: '', consultas: '', terapias: '' });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const load = () => api.get('/extras/vendas/resumo').then(d => {
    setData(d);
    setMetaEdit({ vacinas: d.setores?.vacinas?.meta || '', consultas: d.setores?.consultas?.meta || '', terapias: d.setores?.terapias?.meta || '' });
  }).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line

  const salvarMeta = async () => {
    setSalvando(true);
    try {
      await api.put('/extras/vendas/meta', { vacinas: +metaEdit.vacinas || 0, consultas: +metaEdit.consultas || 0, terapias: +metaEdit.terapias || 0 });
      setSalvo(true); setTimeout(() => setSalvo(false), 2000); load();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(false);
  };

  if (user?.role !== 'master') return <div style={{ padding: 40, color: 'var(--muted)' }}>🔒 Painel de metas restrito ao master.</div>;
  if (!data) return <div style={{ padding: 40, color: 'var(--muted)' }}>Carregando metas…</div>;

  return (
    <div style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--tq3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Target size={22} color="var(--tq)" />
        </div>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>Metas — {data.mes}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Vendas registradas alimentam aqui. Confirmado = pago · Agendado = na agenda · Pendente = aguardando pagamento.</p>
        </div>
      </div>

      {/* Cards de meta por setor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, marginBottom: 22 }}>
        {SETORES.map(([k, rotulo, cor]) => {
          const s = data.setores?.[k] || { meta: 0, confirmado: 0, agendado: 0, pendente: 0, falta: 0, pct: null };
          const pct = Math.min(s.pct || 0, 100);
          return (
            <div key={k} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{rotulo}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>{s.pct != null ? `${s.pct}%` : '—'}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt.brl(s.confirmado)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>de {fmt.brl(s.meta)} {s.falta > 0 && `· faltam ${fmt.brl(s.falta)}`}{s.meta > 0 && s.falta === 0 && ' · 🏆 batida!'}</div>
              <div style={{ height: 9, borderRadius: 6, background: 'var(--bg2)', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: s.falta === 0 && s.meta > 0 ? 'var(--ok)' : cor }} />
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 8, padding: '6px 8px' }}>
                  <div style={{ color: 'var(--muted)' }}>Agendado</div>
                  <div style={{ fontWeight: 800, color: '#2563eb' }}>{fmt.brl(s.agendado)}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 8, padding: '6px 8px' }}>
                  <div style={{ color: 'var(--muted)' }}>Pendente</div>
                  <div style={{ fontWeight: 800, color: '#d97706' }}>{fmt.brl(s.pendente)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Definir metas (gestão) */}
      {ehGestao && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={16} /> Definir meta de vendas do mês (R$)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {SETORES.map(([k, rotulo]) => (
              <div key={k} className="field" style={{ flex: '1 1 160px', margin: 0 }}>
                <label>{rotulo}</label>
                <input type="number" min={0} value={metaEdit[k]} onChange={e => setMetaEdit(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
            <button onClick={salvarMeta} disabled={salvando} className="btn btn-p" style={{ gap: 6, height: 40 }}><Save size={14} /> {salvando ? '…' : salvo ? 'Salvo!' : 'Salvar metas'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {/* Ranking por atendente */}
        <div className="card" style={{ padding: '17px 19px' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>🏆 Ranking de vendas — atendente</div>
          {(data.porAtendente || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem vendas registradas neste mês.</div>}
          {(data.porAtendente || []).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < data.porAtendente.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? 'var(--gold,#C4973B)' : 'var(--muted)', minWidth: 18 }}>{i + 1}º</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5 }}>{(a.nome || '—').split(' ')[0]}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{a.n} venda(s)</span>
              <span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ok,#16a34a)' }}>{fmt.brl(a.confirmado)}</span>
            </div>
          ))}
        </div>
        {/* Por categoria */}
        <div className="card" style={{ padding: '17px 19px' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📊 Vendas por categoria</div>
          {(data.porCategoria || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem vendas registradas neste mês.</div>}
          {(data.porCategoria || []).map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < data.porCategoria.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5 }}>{c.categoria || '—'}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.n}</span>
              <span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--tq2)' }}>{fmt.brl(c.confirmado)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
