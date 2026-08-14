import React, { useEffect, useState } from 'react';
import { Syringe, ChevronLeft, ChevronRight, Plus, Check, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 💉 PLANO VACINAL — onde a atendente registra os planos que fechou.
   Meta: 20 no mês, 1 por dia. A tela existe pra responder duas perguntas em um
   olhar: "quanto falta pro mês?" e "eu fechei o de hoje?".

   O calendário embaixo é o que dá a resposta diária: cada dia útil sem plano
   fica marcado. Somar 20 no fim do mês fechando 5 num dia só não é o mesmo que
   fechar 1 por dia — e só o calendário mostra essa diferença. */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const FORMAS = ['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado'];

export default function PlanoVacinal() {
  const api = useApi();
  const { user } = useAuth();
  const isMaster = user?.role === 'master';
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [quem, setQuem] = useState('');
  const [equipe, setEquipe] = useState([]);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = (m = mes, q = quem) => {
    setD(null); setErro('');
    api.get(`/extras/planos-vacinais?mes=${m}${q ? `&usuario_id=${q}` : ''}`)
      .then(setD).catch(e => setErro(e.message));
  };
  useEffect(() => { carregar(); }, []);            // eslint-disable-line
  useEffect(() => {
    if (isMaster) api.get('/auth/usuarios').then(u => setEquipe((u || []).filter(x => x.ativo !== false))).catch(() => {});
  }, [isMaster]);                                  // eslint-disable-line

  const andarMes = (n) => {
    const [a, m] = mes.split('-').map(Number);
    const dt = new Date(a, m - 1 + n, 1);
    const novo = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    setMes(novo); carregar(novo);
  };

  const abrirForm = () => setForm({
    cliente_nome: '', paciente_nome: '', valor: '', forma_pagamento: 'Pix',
    data_venda: hojeISO(), observacao: '',
  });

  const salvar = async () => {
    if (!form.cliente_nome.trim()) return window.alert('Informe o nome do cliente.');
    setSalvando(true);
    try {
      // Registra como VENDA de categoria "Plano Vacinal" — assim entra no caixa,
      // no placar e nos relatórios junto com o resto, sem contagem paralela.
      await api.post('/extras/vendas', {
        categoria: 'Plano Vacinal', setor: 'vacinas',
        cliente_nome: form.cliente_nome.trim(), paciente_nome: form.paciente_nome.trim(),
        servico: 'Plano Vacinal', valor: form.valor || 0,
        forma_pagamento: form.forma_pagamento, status_pagamento: 'pago',
        data_venda: form.data_venda, observacao: form.observacao.trim(),
      });
      setForm(null); carregar();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(false);
  };

  const [ano, mm] = mes.split('-').map(Number);

  return (
    <div style={{ padding: '20px 22px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
            <Syringe size={20} color="var(--tq2)" /> Plano Vacinal
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
            Meta: 20 planos no mês · 1 por dia
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => andarMes(-1)} className="btn btn-s btn-sm btn-ico"><ChevronLeft size={14} /></button>
          <span style={{ fontWeight: 800, fontSize: 14, minWidth: 118, textAlign: 'center' }}>{MESES[mm - 1]} {ano}</span>
          <button onClick={() => andarMes(1)} className="btn btn-s btn-sm btn-ico"><ChevronRight size={14} /></button>
        </div>
        <button onClick={abrirForm} className="btn btn-p btn-sm" style={{ gap: 6, fontWeight: 800 }}>
          <Plus size={14} /> Registrar plano
        </button>
      </div>

      {isMaster && equipe.length > 0 && (
        <select value={quem} onChange={e => { setQuem(e.target.value); carregar(mes, e.target.value); }}
          style={{ marginBottom: 14, padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }}>
          <option value="">Meus planos</option>
          {equipe.map(u => <option key={u.id} value={u.id}>Planos de {u.nome}</option>)}
        </select>
      )}

      {erro && <div className="card" style={{ padding: 18, color: 'var(--err)', fontWeight: 600 }}>⚠️ {erro}</div>}
      {!d && !erro && <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Carregando…</div>}

      {d && (<>
        {/* Progresso do mês */}
        <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--tq2)', lineHeight: 1 }}>
                {d.feitos}<span style={{ fontSize: 17, color: 'var(--muted)', fontWeight: 700 }}> / {d.meta_mes}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>
                planos fechados{d.valor ? ` · ${fmt.brl(d.valor)}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: d.hoje > 0 ? 'var(--ok,#16a34a)' : '#ea580c' }}>
                {d.hoje > 0 ? `✅ Hoje: ${d.hoje} fechado(s)` : '⏳ Hoje: nenhum ainda'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                {d.falta > 0 ? `faltam ${d.falta} pro mês` : '🏆 meta do mês batida!'}
              </div>
            </div>
          </div>
          <div style={{ height: 10, borderRadius: 7, background: 'var(--bg2)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(d.pct, 100)}%`, height: '100%', borderRadius: 7,
              background: d.pct >= 100 ? 'var(--ok,#16a34a)' : 'linear-gradient(90deg,var(--tq),var(--pet))' }} />
          </div>
        </div>

        {/* Calendário do mês — 1 quadradinho por dia */}
        <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 11 }}>
            <b style={{ fontSize: 13.5 }}>Meta diária — 1 plano por dia</b>
            {d.furos > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9a3412', background: '#fff7ed', padding: '3px 10px', borderRadius: 20 }}>
                {d.furos} dia(s) útil(eis) sem nenhum plano
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(38px,1fr))', gap: 6 }}>
            {d.dias.map(x => {
              const feito = x.n > 0;
              // Domingo não cobra; dia útil vencido e vazio é o que precisa aparecer
              const furou = x.passou && !x.domingo && !feito;
              return (
                <div key={x.data} title={`${x.dia}/${mm} — ${x.n} plano(s)`}
                  style={{ padding: '7px 2px', borderRadius: 9, textAlign: 'center',
                    border: `1.5px solid ${x.hoje ? 'var(--tq)' : 'transparent'}`,
                    background: feito ? 'var(--ok,#16a34a)' : furou ? '#fee2e2' : x.domingo ? 'var(--bg2)' : 'var(--bg)',
                    color: feito ? '#fff' : furou ? '#991b1b' : 'var(--muted)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, opacity: .85 }}>{x.dia}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{feito ? x.n : furou ? '–' : ''}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span>🟩 fechou</span><span>🟥 dia útil sem plano</span><span>⬜ domingo / ainda por vir</span>
          </div>
        </div>

        {/* Lista dos planos do mês */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
            Planos de {MESES[mm - 1]} ({d.planos.length})
          </div>
          {!d.planos.length ? (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
              Nenhum plano registrado neste mês. Clique em <b>Registrar plano</b> ao fechar o primeiro. 💪
            </div>
          ) : d.planos.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: i < d.planos.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--tq2)', minWidth: 46 }}>
                {p.data_venda.split('-').reverse().slice(0, 2).join('/')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.cliente_nome}</div>
                {p.paciente_nome && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>👶 {p.paciente_nome}</div>}
              </div>
              {p.forma_pagamento && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.forma_pagamento}</span>}
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--ok,#16a34a)' }}>{fmt.brl(p.valor)}</span>
            </div>
          ))}
        </div>
      </>)}

      {/* Cadastro do plano fechado */}
      {form && (
        <div onClick={e => e.target === e.currentTarget && setForm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', background: 'linear-gradient(120deg,#0E8C96,#00B8C0)', color: '#fff', display: 'flex', alignItems: 'center', gap: 9 }}>
              <Syringe size={17} />
              <b style={{ flex: 1, fontSize: 14.5 }}>Registrar Plano Vacinal</b>
              <button onClick={() => setForm(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}><X size={14} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[['Cliente (quem fechou)', 'cliente_nome', 'Nome do responsável'],
                ['Paciente (bebê/criança)', 'paciente_nome', 'Opcional']].map(([lb, k, ph]) => (
                <div key={k} className="field">
                  <label>{lb}</label>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Valor (R$)</label>
                  <input type="number" min={0} step={50} value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" />
                </div>
                <div className="field">
                  <label>Data</label>
                  <input type="date" value={form.data_venda} onChange={e => setForm(p => ({ ...p, data_venda: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Forma de pagamento</label>
                <select value={form.forma_pagamento} onChange={e => setForm(p => ({ ...p, forma_pagamento: e.target.value }))}
                  style={{ padding: '9px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }}>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Observação</label>
                <input value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Ex.: entrada + 30 dias" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setForm(null)} className="btn btn-s">Cancelar</button>
                <button onClick={salvar} disabled={salvando || !form.cliente_nome.trim()} className="btn btn-p" style={{ gap: 6, fontWeight: 800 }}>
                  <Check size={14} /> {salvando ? 'Salvando…' : 'Registrar plano'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                O plano entra no caixa e no placar junto com as outras vendas — não é um registro à parte.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
