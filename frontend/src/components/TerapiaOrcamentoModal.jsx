import React, { useState } from 'react';
import { X, Plus, Trash2, FileText, Palette } from 'lucide-react';
import { gerarOrcamentoTerapia, TEMAS_TERAPIA } from '../hooks/orcamentoTerapia.js';

/* Orçamento de Terapias — monta as sessões e gera um documento branded (logo
   Vittalis) com opção de tema infantil. Documento sai em PDF (imprimir/salvar). */

const CATALOGO = ['Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional', 'Terapia ABA', 'Psicopedagogia', 'Fisioterapia', 'Musicoterapia', 'Nutrição', 'Avaliação / Anamnese'];
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function TerapiaOrcamentoModal({ contactName, atendente, onClose }) {
  const [paciente, setPaciente] = useState(contactName || '');
  const [responsavel, setResponsavel] = useState('');
  const [tema, setTema] = useState('none');
  const [itens, setItens] = useState([{ terapia: 'Fonoaudiologia', sessoes: 8, valorSessao: 150 }]);
  const [desconto, setDesconto] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [obs, setObs] = useState('');

  const setItem = (i, patch) => setItens(p => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addItem = () => setItens(p => [...p, { terapia: '', sessoes: 4, valorSessao: 150 }]);
  const delItem = (i) => setItens(p => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const bruto = itens.reduce((s, i) => s + (Number(i.sessoes) || 0) * (Number(i.valorSessao) || 0), 0);
  const desc = Math.min(parseFloat(String(desconto).replace(',', '.')) || 0, bruto);
  const totalAvista = Math.max(0, bruto - desc);
  const totalSessoes = itens.reduce((s, i) => s + (Number(i.sessoes) || 0), 0);

  const gerar = () => gerarOrcamentoTerapia({ paciente, responsavel, tema, itens, descontoRaw: desc, parcelas, observacoes: obs, atendente });

  const inp = { padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13, width: '100%' };
  const lbl = { fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4, display: 'block' };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: 640, maxWidth: '100%', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', color: '#fff', background: 'linear-gradient(135deg,#06424A,#0E8C96 60%,#00B8C0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 16 }}><FileText size={18} /> Orçamento de Terapias</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.18)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}><X size={16} /></button>
        </div>

        <datalist id="terapias-cat">{CATALOGO.map(c => <option key={c} value={c} />)}</datalist>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Dados */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Paciente</label><input style={inp} value={paciente} onChange={e => setPaciente(e.target.value)} placeholder="Nome da criança" /></div>
            <div><label style={lbl}>Responsável</label><input style={inp} value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável" /></div>
          </div>

          {/* Tema */}
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 6 }}><Palette size={13} /> Tema do documento</label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {Object.entries(TEMAS_TERAPIA).map(([k, t]) => (
                <button key={k} onClick={() => setTema(k)} style={{ padding: '6px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${tema === k ? 'var(--tq)' : 'var(--border)'}`, background: tema === k ? 'var(--tq3)' : 'var(--card)', color: tema === k ? 'var(--tq2)' : 'var(--txt2)' }}>
                  {t.emojis ? t.emojis.split(' ')[0] + ' ' : ''}{t.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Sessões */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Sessões</label>
              <button onClick={addItem} className="btn btn-s btn-sm" style={{ gap: 5 }}><Plus size={13} /> Adicionar terapia</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px 100px 92px 28px', gap: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .3, padding: '0 2px' }}>
                <span>Terapia</span><span style={{ textAlign: 'center' }}>Sessões</span><span style={{ textAlign: 'right' }}>Valor/sessão</span><span style={{ textAlign: 'right' }}>Subtotal</span><span />
              </div>
              {itens.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 74px 100px 92px 28px', gap: 8, alignItems: 'center' }}>
                  <input list="terapias-cat" style={inp} value={it.terapia} onChange={e => setItem(i, { terapia: e.target.value })} placeholder="Ex: Fonoaudiologia" />
                  <input type="number" min="0" style={{ ...inp, textAlign: 'center' }} value={it.sessoes} onChange={e => setItem(i, { sessoes: e.target.value })} />
                  <input type="number" min="0" step="0.01" style={{ ...inp, textAlign: 'right' }} value={it.valorSessao} onChange={e => setItem(i, { valorSessao: e.target.value })} />
                  <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--tq2)' }}>{brl((Number(it.sessoes) || 0) * (Number(it.valorSessao) || 0))}</div>
                  <button onClick={() => delItem(i)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', justifyContent: 'center' }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Desconto + parcelas + obs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Desconto (R$)</label><input style={inp} value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" /></div>
            <div><label style={lbl}>Parcelas (cartão)</label>
              <select style={inp} value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 10, 12].map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            </div>
          </div>
          <div><label style={lbl}>Observações (opcional)</label><textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: pacote válido por 30 dias, avaliação inclusa…" /></div>
        </div>

        {/* Rodapé com total + gerar */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{totalSessoes} sessõe(s){desc > 0 ? ` · desc. ${brl(desc)}` : ''}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tq2)' }}>{brl(totalAvista)} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>à vista</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-s">Cancelar</button>
            <button onClick={gerar} disabled={totalSessoes === 0} className="btn btn-p" style={{ gap: 6 }}><FileText size={15} /> Gerar documento</button>
          </div>
        </div>
      </div>
    </div>
  );
}
