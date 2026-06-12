import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, Send, Check, ChevronRight, ChevronLeft, Search, Baby, User, Package, CalendarRange, Syringe, Loader2, CheckCircle2 } from 'lucide-react';

/* ─── PropostaModal ───────────────────────────────────────────────────────────
   Monta e envia a proposta REAL: mesmo catálogo, mesmos templates de PDF e o
   mesmo envio Z-API que a Vitta usa. (Substitui a versão antiga, que tinha um
   catálogo fictício chumbado no código e imprimia um PDF local.)             */

const BASE = import.meta.env.VITE_API_URL || '';
const brl = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const ABAS = [
  { k: 'plano',  l: 'Planos completos', Icon: CalendarRange },
  { k: 'pacote', l: 'Pacotes por idade', Icon: Package },
  { k: 'avulsa', l: 'Vacinas avulsas', Icon: Syringe },
];

export default function PropostaModal({ convId, token, contactName, atendente, onClose }) {
  const [cat, setCat] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('plano');
  const [passo, setPasso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // seleção
  const [planoSel, setPlanoSel] = useState(null);
  const [pacoteSel, setPacoteSel] = useState(null);
  const [avulsasSel, setAvulsasSel] = useState([]); // idx[]
  const [buscaVac, setBuscaVac] = useState('');

  // revisão
  const [nomeCliente, setNomeCliente] = useState(contactName || '');
  const [nomeBebe, setNomeBebe] = useState('');
  const [template, setTemplate] = useState('infantil');
  const [parcelas, setParcelas] = useState(1);

  const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token || localStorage.getItem('vh_token') || ''}` };

  useEffect(() => {
    fetch(`${BASE}/api/inbox/proposta/catalogo`, { headers: hdr })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setCat(d); })
      .catch(e => setErro(`Não consegui carregar o catálogo: ${e.message}`));
  }, []); // eslint-disable-line

  const vacFiltradas = useMemo(() => {
    if (!cat) return [];
    const q = buscaVac.trim().toLowerCase();
    return cat.vacinas.filter(v => !q || v.nome.toLowerCase().includes(q) || (v.descricao || '').toLowerCase().includes(q));
  }, [cat, buscaVac]);

  const selecionou = aba === 'plano' ? !!planoSel : aba === 'pacote' ? !!pacoteSel : avulsasSel.length > 0;

  const resumo = useMemo(() => {
    if (!cat) return null;
    if (aba === 'plano' && planoSel) {
      const p = cat.planos.find(x => x.id === planoSel);
      return p && { titulo: p.nome, sub: p.periodo, avista: p.avista, credito: p.credito, parcelas: p.parcelas, itens: [] };
    }
    if (aba === 'pacote' && pacoteSel) {
      const p = cat.pacotes.find(x => x.id === pacoteSel);
      return p && { titulo: p.label, sub: p.vacinas.join(' + '), avista: p.avista, credito: p.credito, parcelas: p.parcelas, itens: [] };
    }
    if (aba === 'avulsa' && avulsasSel.length) {
      const itens = avulsasSel.map(i => cat.vacinas[i]).filter(Boolean);
      return {
        titulo: `${itens.length} vacina${itens.length > 1 ? 's' : ''} selecionada${itens.length > 1 ? 's' : ''}`,
        sub: itens.map(v => v.nome).join(', '),
        avista: itens.reduce((s, v) => s + (v.avista || 0), 0),
        credito: itens.reduce((s, v) => s + (v.credito || 0), 0),
        parcelas, itens,
      };
    }
    return null;
  }, [cat, aba, planoSel, pacoteSel, avulsasSel, parcelas]);

  const enviar = async () => {
    if (enviando) return;
    setErro(''); setEnviando(true);
    try {
      const body = { convId, nomeCliente: nomeCliente.trim().slice(0, 60), nomeBebe: nomeBebe.trim().slice(0, 60) };
      if (aba === 'plano') { body.tipo = 'plano'; body.planoId = planoSel; }
      else if (aba === 'pacote') { body.tipo = 'pacote'; body.pacoteId = pacoteSel; }
      else { body.tipo = 'avulsas'; body.vacinasIdx = avulsasSel; body.template = template; body.parcelas = parcelas; }
      const r = await fetch(`${BASE}/api/inbox/proposta/enviar`, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEnviado(true);
      setTimeout(() => onClose(null), 1500);
    } catch (e) {
      setErro(e.message);
    } finally { setEnviando(false); }
  };

  const toggleAvulsa = (idx) => setAvulsasSel(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx]);

  const cardSel = (ativo) => ({
    textAlign: 'left', cursor: 'pointer', borderRadius: 13, padding: '13px 15px',
    border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`,
    background: ativo ? 'var(--tq4)' : 'var(--card)',
    boxShadow: ativo ? '0 2px 10px rgba(0,184,192,.15)' : 'var(--s1)',
    transition: 'border-color .12s, background .12s, box-shadow .15s',
  });

  return (
    <div onClick={e => e.target === e.currentTarget && onClose(null)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,30,44,.55)', backdropFilter: 'blur(3px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ width: '100%', maxWidth: 720, maxHeight: '88vh', background: 'var(--card)', borderRadius: 18, boxShadow: 'var(--s4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 13px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#06424A,#00B8C0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={17} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Montar Proposta</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Para <b>{contactName || 'cliente'}</b> · enviada em PDF pelo WhatsApp</div>
          </div>
          <button onClick={() => onClose(null)} style={{ width: 30, height: 30, borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>

        {/* Sucesso */}
        {enviado ? (
          <div style={{ padding: '52px 20px', textAlign: 'center' }}>
            <CheckCircle2 size={42} color="var(--ok)" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Proposta enviada</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>O PDF já está chegando no WhatsApp de {nomeCliente || 'cliente'}.</div>
          </div>
        ) : !cat && !erro ? (
          <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center' }}><Loader2 size={26} className="spin" color="var(--tq)" /></div>
        ) : (
          <>
            {/* Passos */}
            <div style={{ display: 'flex', gap: 16, padding: '12px 20px 0', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {[['1. Selecionar', 1], ['2. Revisar & enviar', 2]].map(([l, n]) => (
                <div key={n} style={{ paddingBottom: 9, borderBottom: `2.5px solid ${passo === n ? 'var(--tq)' : 'transparent'}`, color: passo === n ? 'var(--tq2)' : 'var(--light)' }}>{l}</div>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {erro && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: 'var(--err2)', color: 'var(--err)', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}

              {passo === 1 && cat && (
                <>
                  {/* Abas */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                    {ABAS.map(({ k, l, Icon }) => (
                      <button key={k} onClick={() => setAba(k)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                          border: `1.5px solid ${aba === k ? 'var(--tq)' : 'var(--border)'}`,
                          background: aba === k ? 'var(--pet)' : 'var(--card)', color: aba === k ? '#fff' : 'var(--muted)' }}>
                        <Icon size={13} />{l}
                      </button>
                    ))}
                  </div>

                  {/* Planos completos */}
                  {aba === 'plano' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
                      {cat.planos.map(p => (
                        <button key={p.id} onClick={() => setPlanoSel(planoSel === p.id ? null : p.id)} style={cardSel(planoSel === p.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{p.nome}</div>
                            {planoSel === p.id && <Check size={15} color="var(--tq)" style={{ flexShrink: 0 }} />}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{p.periodo} · PDF com cronograma e benefícios</div>
                          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: 'var(--ok)' }}>{brl(p.avista)} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>à vista</span></div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>ou {brl(p.credito)} em até {p.parcelas}x sem juros</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Pacotes por idade */}
                  {aba === 'pacote' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
                      {cat.pacotes.map(p => (
                        <button key={p.id} onClick={() => setPacoteSel(pacoteSel === p.id ? null : p.id)} style={cardSel(pacoteSel === p.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{p.label}</div>
                            {pacoteSel === p.id && <Check size={15} color="var(--tq)" style={{ flexShrink: 0 }} />}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{p.vacinas.join(' + ')}</div>
                          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: 'var(--ok)' }}>{brl(p.avista)} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>à vista</span></div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>ou {brl(p.credito)} em até {p.parcelas}x sem juros</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Avulsas */}
                  {aba === 'avulsa' && (
                    <>
                      <div style={{ position: 'relative', marginBottom: 10 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--light)' }} />
                        <input value={buscaVac} maxLength={40} onChange={e => setBuscaVac(e.target.value)} placeholder="Buscar vacina…"
                          style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, outline: 'none', background: 'var(--bg)' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8 }}>
                        {vacFiltradas.map(v => {
                          const sel = avulsasSel.includes(v.idx);
                          return (
                            <button key={v.idx} onClick={() => toggleAvulsa(v.idx)} style={{ ...cardSel(sel), padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{v.nome}</div>
                                <div style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${sel ? 'var(--tq)' : 'var(--bord2)'}`, background: sel ? 'var(--tq)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {sel && <Check size={11} color="#fff" />}
                                </div>
                              </div>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ok)', marginTop: 4 }}>{brl(v.avista)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {passo === 2 && resumo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Resumo */}
                  <div style={{ borderRadius: 13, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ padding: '11px 15px', background: 'linear-gradient(90deg,#06424A,#0E8C96)', color: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{resumo.titulo}</div>
                      <div style={{ fontSize: 11, opacity: .75, marginTop: 1 }}>{resumo.sub}</div>
                    </div>
                    <div style={{ padding: '11px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ok)' }}>{brl(resumo.avista)} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>à vista</span></div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>ou {brl(resumo.credito)} no crédito{resumo.parcelas > 1 ? ` em até ${resumo.parcelas}x` : ''}</div>
                      </div>
                      <button onClick={() => setPasso(1)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        <ChevronLeft size={12} /> Alterar itens
                      </button>
                    </div>
                  </div>

                  {/* Dados do destinatário */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label>Nome no PDF (cliente/responsável)</label>
                      <input value={nomeCliente} maxLength={60} onChange={e => setNomeCliente(e.target.value)} placeholder="Ex: Lidia Rodrigues" />
                    </div>
                    <div className="field">
                      <label>Nome do bebê (opcional)</label>
                      <input value={nomeBebe} maxLength={60} onChange={e => setNomeBebe(e.target.value)} placeholder="Ex: Lara Sophia" />
                    </div>
                  </div>

                  {aba === 'avulsa' && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Modelo do PDF</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[['infantil', 'Infantil', Baby], ['adulto', 'Adulto', User]].map(([k, l, Icon]) => (
                            <button key={k} onClick={() => setTemplate(k)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                border: `1.5px solid ${template === k ? 'var(--tq)' : 'var(--border)'}`,
                                background: template === k ? 'var(--tq3)' : 'var(--card)', color: template === k ? 'var(--tq2)' : 'var(--muted)' }}>
                              <Icon size={12} />{l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field" style={{ width: 140 }}>
                        <label>Parcelas no cartão</label>
                        <select value={parcelas} onChange={e => setParcelas(parseInt(e.target.value))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                          {[1, 2, 3, 4, 5, 6, 10, 12].map(n => <option key={n} value={n}>{n === 1 ? 'À vista no cartão' : `${n}x sem juros`}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 11.5, color: 'var(--light)' }}>Enviada por {atendente || 'atendente'} · o PDF entra na conversa como documento.</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              <button onClick={() => onClose(null)} className="btn btn-s">Cancelar</button>
              {passo === 1 ? (
                <button onClick={() => selecionou && setPasso(2)} disabled={!selecionou} className="btn btn-p" style={{ gap: 6, opacity: selecionou ? 1 : .5 }}>
                  Revisar proposta <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={enviar} disabled={enviando || !nomeCliente.trim()} className="btn btn-p" style={{ gap: 7, opacity: enviando || !nomeCliente.trim() ? .6 : 1 }}>
                  {enviando ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                  {enviando ? 'Gerando PDF…' : 'Enviar pelo WhatsApp'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
