import React, { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 👥 SUA EQUIPE — o segundo papel da supervisora, que não aparecia em lugar
   nenhum (pedido do master).

   Ela acumula duas funções: vende como atendente e responde pelo setor. O
   painel só mostrava a meta dela — então o time era cobrança, não construção.
   Aqui fica escrito o que o master explicou: cada integrante tem meta de
   R$ 100 mil e um prêmio; quando o integrante ganha, ELA ganha o mesmo valor
   EM CIMA. E o time tem tamanho: meta global do setor ÷ 100 mil. R$ 500 mil =
   5 pessoas; com 2, faltam 3 — daí o convite pra cadastrar integrante. */

export default function MinhaEquipe() {
  const api = useApi();
  const { user } = useAuth();
  const [eq, setEq] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api.get('/extras/minha-equipe').then(setEq).catch(() => {});
  useEffect(() => { if (user) carregar(); }, [user]); // eslint-disable-line

  if (!eq?.ativo) return null;

  const salvar = async () => {
    const nome = String(form.nome || '').trim();
    const cpf = String(form.cpf || '').replace(/\D/g, '');
    if (!nome) return window.alert('Escreva o nome do integrante.');
    if (cpf.length !== 11) return window.alert('O CPF precisa ter 11 números — é com ele que a pessoa entra no sistema.');
    setSalvando(true);
    try {
      await api.post('/auth/usuarios', { nome, cpf, senha: 'Vittalis@2026', setor: eq.setor, meta_individual: eq.meta_por_pessoa });
      setForm(null);
      await carregar();
      window.alert(`✅ ${nome.split(' ')[0]} entrou no seu time!\n\nEntra com o CPF e a senha Vittalis@2026 — peça pra trocar no primeiro acesso.`);
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(false);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20, border: '1.5px solid var(--tq3,#7fd8dd)' }}>

      {/* Cabeçalho: o que ela leva se o time bater */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 18px',
        background: 'linear-gradient(90deg,#0E8C96,#00B8C0)', color: '#fff' }}>
        <span style={{ fontSize: 19 }}>👥</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>Sua equipe</div>
          <div style={{ fontSize: 11.5, opacity: .92 }}>
            Cada integrante tem meta de {fmt.brl(eq.meta_por_pessoa)} — e você ganha por cima do resultado de cada um
          </div>
        </div>
        {eq.ganho_potencial > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', opacity: .85 }}>
              Seu ganho pelo time
            </div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>
              {fmt.brl(eq.ganho_conquistado)}<span style={{ fontSize: 12, opacity: .85 }}> de {fmt.brl(eq.ganho_potencial)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Um cartão por integrante */}
      <div style={{ padding: '6px 0' }}>
        {eq.membros.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            {m.avatar
              ? <img src={m.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: m.cor || 'var(--tq)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>{fmt.initials(m.nome)}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{m.nome}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.papel}</span>
              </div>
              {/* A frase inteira do master, escrita sem rodeio */}
              <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5 }}>
                {/* Sem "ela/ele" fixo: o nome resolve o gênero sozinho (auditoria
                    — José e Carlos apareciam como "ela ganha") */}
                Meta <b>{fmt.brl(m.meta)}</b> · {(m.nome || '').split(' ')[0]} ganha <b style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(m.premio)}</b> ·
                {' '}você ganha <b style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(m.ganhoLider)}</b> em cima
              </div>
              <div style={{ height: 6, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden', marginTop: 5 }}>
                <div style={{ width: `${Math.min(m.pct, 100)}%`, height: '100%', borderRadius: 5,
                  background: m.bateu ? 'var(--ok,#16a34a)' : 'linear-gradient(90deg,#0E8C96,#00B8C0)', transition: 'width .6s' }} />
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: m.bateu ? 'var(--ok,#16a34a)' : 'var(--txt)' }}>
                {m.bateu ? '🏆 bateu!' : `${m.pct}%`}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                {m.bateu ? 'prêmio garantido' : `faltam ${fmt.brl(m.falta)}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vagas: o time tem tamanho, e o tamanho vem da meta global */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 18px',
        background: eq.vagas > 0 ? '#fffbeb' : 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 17 }}>{eq.vagas > 0 ? '🎯' : '✅'}</span>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, lineHeight: 1.5, color: eq.vagas > 0 ? '#92400e' : 'var(--txt2)' }}>
          {eq.vagas > 0 ? (
            <>
              <b>Faltam {eq.vagas} pessoa{eq.vagas > 1 ? 's' : ''} no seu time.</b> A meta global do setor é {fmt.brl(eq.meta_global)},
              e cada uma fica com {fmt.brl(eq.meta_por_pessoa)} — são {eq.tamanho_ideal} pessoas no total, e hoje vocês são {eq.no_time}.
              {eq.ganho_se_time_completo > eq.ganho_potencial && (
                <> Com o time completo, seu ganho por cima chega a <b>{fmt.brl(eq.ganho_se_time_completo)}</b> por mês.</>
              )}
            </>
          ) : (
            <><b>Time completo!</b> {eq.no_time} pessoas para os {fmt.brl(eq.meta_global)} do setor.</>
          )}
        </div>
        <button onClick={() => setForm({ nome: '', cpf: '' })}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 11, cursor: 'pointer',
            border: 'none', background: 'linear-gradient(180deg,#fbbf24,#f59e0b)', color: '#3b2a00',
            fontSize: 12.5, fontWeight: 900, whiteSpace: 'nowrap', boxShadow: '0 3px 10px rgba(245,158,11,.35)' }}>
          <UserPlus size={14} /> Cadastrar integrante
        </button>
      </div>

      {/* Cadastro do integrante — o mínimo pra pessoa entrar hoje */}
      {form && (
        <div onClick={e => e.target === e.currentTarget && setForm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 430, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 900, fontSize: 15.5, flex: 1 }}>👥 Novo integrante do seu time</span>
              <button onClick={() => setForm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Entra como atendente de <b style={{ textTransform: 'capitalize' }}>{eq.setor}</b>, com meta de {fmt.brl(eq.meta_por_pessoa)}.
              Quando essa pessoa bater a meta, você ganha {fmt.brl(eq.premio_por_pessoa)} em cima.
            </div>
            {[['nome', 'Nome completo', 'Ex.: Ana Carolina de Sousa'], ['cpf', 'CPF (é o login dela)', 'Só números']].map(([k, rot, ph]) => (
              <div key={k} style={{ marginBottom: 11 }}>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>{rot}</label>
                <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                  placeholder={ph} autoFocus={k === 'nome'}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: '1.5px solid var(--border)', fontSize: 13.5,
                    background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', marginTop: 3 }} />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              🔑 A senha inicial é <b>Vittalis@2026</b> — peça pra ela trocar no primeiro acesso, em Meu Painel.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} className="btn btn-s">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ fontWeight: 900 }}>
                {salvando ? 'Cadastrando…' : 'Cadastrar no meu time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
