import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Gift, Trophy, X, Save, Trash2 } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ─── Programa de Indicações Vittalis ────────────────────────────────────────
   Indicador → Indicado, status do ciclo, pontos por conversão, prêmios
   (Voucher Coco Bambu / Cabana do Sol / Retroprojetor a cada 3 Planos),
   ranking dos indicadores e os campos de Estratégia do programa.            */

const STATUS = ['Cadastrada', 'Em atendimento', 'Orçamento enviado', 'Convertida', 'Não convertida'];
const ST_CLR = { Cadastrada: ['#e8f4fd', '#1d6fb8'], 'Em atendimento': ['#fdf3e2', '#a07514'], 'Orçamento enviado': ['#fdeede', '#c2611a'], Convertida: ['#e2f8ef', '#0a8f5b'], 'Não convertida': ['#eef2f6', '#5a6b7b'] };
const TIPOS = ['Plano Vacinal', 'Pacote Infantil', 'Pacote Adulto', 'Vacina Avulsa'];

export default function Indicacoes() {
  const api = useApi();
  const { user, isMaster } = useAuth();
  const gestao = isMaster || user?.role === 'supervisor';
  const [dados, setDados] = useState(null);
  const [novo, setNovo] = useState(null);
  const [conv, setConv] = useState(null); // modal de conversão {id, tipo, premio}
  const [estr, setEstr] = useState(null);
  const [pontos, setPontos] = useState(null);
  const [erro, setErro] = useState('');

  const load = useCallback(() => {
    api.get('/extras/indicacoes').then(d => {
      setDados(d);
      if (estr === null) setEstr(d.estrategias || {});
      if (pontos === null) setPontos(d.pontos || {});
    }).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(load, [load]);

  if (!dados) return <div style={{ padding: 40, color: 'var(--muted)' }}>Carregando…</div>;
  const { indicacoes, ranking, resumo } = dados;

  const criar = async () => {
    setErro('');
    if (!novo.indicador_nome?.trim() || !novo.indicado_nome?.trim()) return setErro('Preencha quem indicou e quem foi indicado.');
    try { await api.post('/extras/indicacoes', novo); setNovo(null); load(); }
    catch (e) { setErro(e.message); }
  };

  const mudaStatus = async (ind, status) => {
    if (status === 'Convertida') { setConv({ id: ind.id, tipo: 'Plano Vacinal', premio: 'Voucher Coco Bambu' }); return; }
    try { await api.put(`/extras/indicacoes/${ind.id}`, { status }); load(); } catch (e) { window.alert(e.message); }
  };

  const confirmarConversao = async () => {
    try { await api.put(`/extras/indicacoes/${conv.id}`, { status: 'Convertida', tipo_conversao: conv.tipo, premio: conv.premio }); setConv(null); load(); }
    catch (e) { window.alert(e.message); }
  };

  const salvarConfig = async () => {
    try { await api.put('/extras/indicacoes-config', { pontos, estrategias: estr }); load(); window.alert('Configurações do programa salvas! ✅'); }
    catch (e) { window.alert(e.message); }
  };

  const medalha = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}º`;

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>🎁 Programa de Indicações</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Cada cliente satisfeito vira um promotor da Vittalis</p>
        </div>
        <button onClick={() => setNovo({})} className="btn btn-p" style={{ gap: 6 }}><Plus size={14} /> Nova indicação</button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[['📩', resumo.total, 'Indicações'], ['🟢', resumo.convertidas, 'Convertidas'],
          ['🎁', resumo.premiosPendentes, 'Prêmios a entregar'], ['✅', resumo.premiosEntregues, 'Prêmios entregues']].map(([ic, v, l]) => (
          <div key={l} className="card" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11, background: '#fff' }}>
            <span style={{ fontSize: 22 }}>{ic}</span>
            <div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{l}</div></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px,1.6fr) minmax(280px,1fr)', gap: 16, alignItems: 'start' }}>
        {/* Lista */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '12px 18px', fontWeight: 800, fontSize: 14, borderBottom: '1px solid var(--border)' }}>Indicações</div>
          {indicacoes.length === 0 && <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhuma indicação ainda — registre a primeira! 🚀</div>}
          {indicacoes.map((ind, i) => {
            const [bg, cor] = ST_CLR[ind.status] || ST_CLR.Cadastrada;
            return (
              <div key={ind.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < indicacoes.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {ind.indicador_nome} <span style={{ color: 'var(--light)', fontWeight: 600 }}>indicou</span> {ind.indicado_nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {fmt.shortDate(ind.created_at)}{ind.tipo_conversao ? ` · ${ind.tipo_conversao} (+${ind.pontos} pts)` : ''}{ind.premio ? ` · 🎁 ${ind.premio}${ind.premio_entregue ? ' ✅' : ' (pendente)'}` : ''}
                  </div>
                </div>
                <select value={ind.status} onChange={e => mudaStatus(ind, e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: 'none', background: bg, color: cor, cursor: 'pointer' }}>
                  {STATUS.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                {ind.premio && !ind.premio_entregue && gestao && (
                  <button onClick={async () => { await api.put(`/extras/indicacoes/${ind.id}`, { premio_entregue: true }); load(); }}
                    title="Marcar prêmio como entregue" className="btn btn-s btn-sm" style={{ fontSize: 10.5 }}>Entregar 🎁</button>
                )}
                {isMaster && (
                  <button onClick={async () => { if (window.confirm('Excluir esta indicação?')) { await api.delete(`/extras/indicacoes/${ind.id}`); load(); } }}
                    style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ranking + Retroprojetor */}
          <div className="card" style={{ padding: '15px 18px', background: '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 7 }}><Trophy size={15} color="var(--gold)" /> Ranking dos Indicadores</div>
            {ranking.slice(0, 6).map((rk, i) => (
              <div key={rk.nome} style={{ padding: '7px 0', borderBottom: i < Math.min(ranking.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, minWidth: 26 }}>{medalha(i)}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5 }}>{rk.nome}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{rk.convertidas}/{rk.total} conv. · <b style={{ color: 'var(--tq2)' }}>{rk.pontos} pts</b></span>
                </div>
                {rk.planos > 0 && rk.planos < 3 && (
                  <div style={{ marginTop: 5, marginLeft: 34 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                      <span>🎥 Retroprojetor</span><span>{rk.planos} de 3 planos</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ width: `${(rk.planos / 3) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--gold),#e0b35c)', borderRadius: 5 }} />
                    </div>
                  </div>
                )}
                {rk.planos >= 3 && <div style={{ marginLeft: 34, fontSize: 10.5, fontWeight: 800, color: 'var(--gold)', marginTop: 3 }}>🎥 Retroprojetor conquistado!</div>}
              </div>
            ))}
            {ranking.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>O ranking aparece com as primeiras conversões.</div>}
          </div>

          {/* Regras (pontos) + Estratégias */}
          {gestao && pontos && estr && (
            <div className="card" style={{ padding: '15px 18px', background: '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 7 }}><Gift size={15} color="var(--tq2)" /> Regras & Estratégias</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 7 }}>Pontos por conversão</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 13 }}>
                {TIPOS.map(t => (
                  <div key={t} className="field">
                    <label style={{ fontSize: 10 }}>{t}</label>
                    <input type="number" min={0} max={10000} value={pontos[t] ?? ''} onChange={e => setPontos({ ...pontos, [t]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 7 }}>Estratégia do programa</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="field"><label>Objetivo</label>
                  <input value={estr.objetivo || ''} maxLength={400} onChange={e => setEstr({ ...estr, objetivo: e.target.value })} placeholder="Ex: transformar mães de planos em embaixadoras" /></div>
                <div className="field"><label>Público-alvo</label>
                  <input value={estr.publico || ''} maxLength={400} onChange={e => setEstr({ ...estr, publico: e.target.value })} placeholder="Ex: famílias com plano vacinal ativo" /></div>
                <div className="field"><label>Mensagem de convite</label>
                  <textarea rows={3} value={estr.convite || ''} maxLength={600} onChange={e => setEstr({ ...estr, convite: e.target.value })}
                    placeholder="Texto que a equipe envia convidando pro programa…"
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, resize: 'vertical', background: 'var(--bg)', color: 'var(--txt)', fontFamily: 'inherit' }} /></div>
                <div className="field"><label>Canais de divulgação</label>
                  <input value={estr.canais || ''} maxLength={300} onChange={e => setEstr({ ...estr, canais: e.target.value })} placeholder="Ex: WhatsApp pós-vacinal, Instagram, recepção" /></div>
                <div className="field"><label>Observações</label>
                  <input value={estr.observacoes || ''} maxLength={600} onChange={e => setEstr({ ...estr, observacoes: e.target.value })} placeholder="Regras extras, validade dos vouchers…" /></div>
              </div>
              <button onClick={salvarConfig} className="btn btn-p btn-sm" style={{ marginTop: 11, gap: 6 }}><Save size={13} /> Salvar programa</button>
            </div>
          )}
        </div>
      </div>

      {/* Modal nova indicação */}
      {novo && (
        <div onClick={e => e.target === e.currentTarget && setNovo(null)} style={overlay}>
          <div style={caixa}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Nova indicação</div>
              <button onClick={() => setNovo(null)} style={fechaBtn}><X size={14} /></button>
            </div>
            {erro && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--err2)', color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>Quem indicou *</label>
                <input value={novo.indicador_nome || ''} maxLength={80} onChange={e => setNovo({ ...novo, indicador_nome: e.target.value })} placeholder="Cliente Vittalis" /></div>
              <div className="field"><label>Telefone do indicador</label>
                <input value={novo.indicador_telefone || ''} maxLength={15} onChange={e => setNovo({ ...novo, indicador_telefone: e.target.value.replace(/[^\d() -]/g, '') })} /></div>
              <div className="field"><label>Quem foi indicado *</label>
                <input value={novo.indicado_nome || ''} maxLength={80} onChange={e => setNovo({ ...novo, indicado_nome: e.target.value })} placeholder="Novo cliente" /></div>
              <div className="field"><label>Telefone do indicado</label>
                <input value={novo.indicado_telefone || ''} maxLength={15} onChange={e => setNovo({ ...novo, indicado_telefone: e.target.value.replace(/[^\d() -]/g, '') })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observações</label>
                <input value={novo.observacoes || ''} maxLength={200} onChange={e => setNovo({ ...novo, observacoes: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 13 }}>
              <button onClick={() => setNovo(null)} className="btn btn-s">Cancelar</button>
              <button onClick={criar} className="btn btn-p">Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de conversão */}
      {conv && (
        <div onClick={e => e.target === e.currentTarget && setConv(null)} style={overlay}>
          <div style={{ ...caixa, maxWidth: 380 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🎉 Indicação convertida!</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 13 }}>O que o indicado fechou? Isso define os pontos e o prêmio.</div>
            <div className="field" style={{ marginBottom: 10 }}><label>Tipo da conversão</label>
              <select value={conv.tipo} onChange={e => setConv({ ...conv, tipo: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            {conv.tipo !== 'Vacina Avulsa' && (
              <div className="field" style={{ marginBottom: 10 }}><label>Prêmio do indicador 🎁</label>
                <select value={conv.premio} onChange={e => setConv({ ...conv, premio: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                  <option>Voucher Coco Bambu</option>
                  <option>Voucher Cabana do Sol</option>
                </select></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConv(null)} className="btn btn-s">Cancelar</button>
              <button onClick={confirmarConversao} className="btn btn-p">Confirmar conversão</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const caixa = { width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--s4)', padding: '18px 22px' };
const fechaBtn = { width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
