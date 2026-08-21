import React, { useEffect, useState, useRef } from 'react';
import { Stethoscope, Plus, Pencil, Trash2, X, Check, Phone, Clock, Camera, Paperclip, FileText, Download, CalendarPlus } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* Painel de Profissionais — cadastro de médicos/especialistas + disponibilidade.
   Restrito ao setor de Consultas (e à gestão). */

const DIAS = [['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];
const SETORES = [['vacinas','Vacinas'],['consultas','Consultas'],['terapias','Terapias']];
const CORES = ['#00B8C0','#7c5cbf','#C4973B','#0fb07a','#e8671a','#3b82f6','#ec4899','#0E8C96'];
const MAX_DOCS = 20;   // anexos por profissional (pedido do master)
const vazio = { nome:'', especialidade:'', setor:'consultas', cor:'#00B8C0', telefone:'', ativo:true, disponibilidade:{}, observacoes:'', foto:null, documentos:[] };
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export default function Profissionais() {
  const api = useApi();
  const { user } = useAuth();
  // Painel da CLÍNICA INTEIRA (pedido do master: 3 colunas — vacinas,
  // consultas e terapias). Todo mundo consulta; só a gestão edita.
  const podeVer = true;
  const ehGestao = podeVer;
  const fotoRef = useRef(null);
  const docRef = useRef(null);
  const [lista, setLista] = useState([]);
  const [modal, setModal] = useState(null);
  const [ag, setAg] = useState(null);          // 📅 agendar com o profissional
  const [ocupados, setOcupados] = useState([]); // horários já tomados na data
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const load = () => api.get('/extras/profissionais').then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line

  const salvar = async () => {
    if (!modal.nome?.trim()) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro('');
    try {
      if (modal.id) await api.put(`/extras/profissionais/${modal.id}`, modal);
      else await api.post('/extras/profissionais', modal);
      setModal(null); load();
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  const excluir = async (p) => {
    if (!window.confirm(`Remover ${p.nome}?`)) return;
    setLista(l => l.filter(x => x.id !== p.id));
    try { await api.del(`/extras/profissionais/${p.id}`); } catch { load(); }
  };

  const escolherFoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErro('A foto precisa ser uma imagem.'); return; }
    const url = await fileToDataUrl(f);
    if (url.length > 2_400_000) { setErro('Foto muito grande (máx. ~2MB). Tente outra.'); return; }
    setErro(''); setModal(m => ({ ...m, foto: url }));
  };
  const anexarDocs = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    const novos = [];
    for (const f of files) {
      const url = await fileToDataUrl(f);
      if (url.length > 11_000_000) { setErro(`"${f.name}" é muito grande (máx. ~8MB).`); continue; }
      novos.push({ nome: f.name, arquivo: url, mimetype: f.type });
    }
    // Pedido do master: até 20 anexos por profissional.
    if (novos.length) setModal(m => {
      const juntos = [...(m.documentos || []), ...novos];
      if (juntos.length > MAX_DOCS) setErro(`Cabem ${MAX_DOCS} anexos por profissional — os últimos ficaram de fora.`);
      return { ...m, documentos: juntos.slice(0, MAX_DOCS) };
    });
  };
  const removerDoc = (idx) => setModal(m => ({ ...m, documentos: (m.documentos || []).filter((_, i) => i !== idx) }));

  const setDispDia = (dia, campo, valor) => setModal(m => ({
    ...m, disponibilidade: { ...m.disponibilidade, [dia]: { ...(m.disponibilidade?.[dia] || {}), [campo]: valor } },
  }));
  /* Carga horária "conosco" em números: soma as janelas da semana. É o dado
     que o master quer enxergar de cara — quanto desse profissional a clínica
     tem por semana. */
  const horasDia = (d) => {
    if (!d?.inicio || !d?.fim) return 0;
    const [hi, mi] = d.inicio.split(':').map(Number);
    const [hf, mf] = d.fim.split(':').map(Number);
    return Math.max(0, (hf * 60 + mf) - (hi * 60 + mi)) / 60;
  };
  const horasSemana = (disp) => DIAS.reduce((a2, [k]) => a2 + horasDia(disp?.[k]), 0);
  const fmtH = (h) => h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  // dia da semana de HOJE no formato das chaves (seg..dom)
  const CHAVES_DIA = ['dom','seg','ter','qua','qui','sex','sab'];
  const hojeK = CHAVES_DIA[new Date().getDay()];

  /* 📅 AGENDAR RESPEITANDO A DISPONIBILIDADE (pedido do master): o modal só
     oferece os DIAS em que o profissional atende e os HORÁRIOS dentro da
     janela dele — meia em meia hora. O que já está tomado na agenda aparece
     riscado. Salvou → cai direto na Agenda (mesma tabela que a aba lê). */
  const proximasDatas = (disp) => {
    const out = [];
    const d = new Date();
    for (let i = 0; i < 28 && out.length < 10; i++) {
      const k = CHAVES_DIA[d.getDay()];
      if (disp?.[k]?.inicio && disp?.[k]?.fim) {
        out.push({
          iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã'
            : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
          k,
        });
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  };
  const slotsDoDia = (disp, k) => {
    const j = disp?.[k]; if (!j?.inicio || !j?.fim) return [];
    const [hi, mi] = j.inicio.split(':').map(Number);
    const [hf, mf] = j.fim.split(':').map(Number);
    const out = [];
    for (let t = hi * 60 + mi; t + 30 <= hf * 60 + mf; t += 30) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
    return out;
  };
  const abrirAgendar = (p) => {
    const datas = proximasDatas(p.disponibilidade);
    if (!datas.length) { window.alert(`${p.nome} está sem horário definido — edite o cadastro e preencha a disponibilidade primeiro.`); return; }
    setOcupados([]);
    setAg({ prof: p, datas, data: datas[0], hora: '', paciente: '', telefone: '', servico: p.especialidade || '', salvando: false, erro: '' });
    carregarOcupados(p, datas[0].iso);
  };
  const carregarOcupados = (p, iso) => {
    api.get(`/extras/agenda?data=${iso}`)
      .then(d => setOcupados((Array.isArray(d) ? d : [])
        .filter(e => e.profissional === p.nome && String(e.status || '') !== 'Cancelado')
        .map(e => e.hora)))
      .catch(() => setOcupados([]));
  };
  const salvarAgendamento = async () => {
    if (!ag.paciente.trim()) return setAg(m => ({ ...m, erro: 'Escreva o nome do paciente.' }));
    if (!ag.hora) return setAg(m => ({ ...m, erro: 'Escolha um horário.' }));
    setAg(m => ({ ...m, salvando: true, erro: '' }));
    try {
      await api.post('/extras/agenda', {
        paciente: ag.paciente.trim(), telefone: ag.telefone,
        data: ag.data.iso, hora: ag.hora,
        servico: ag.servico || ag.prof.especialidade || 'Consulta',
        setor: ag.prof.setor || 'consultas',
        profissional: ag.prof.nome,
      });
      const quando = `${ag.data.rotulo === 'Hoje' || ag.data.rotulo === 'Amanhã' ? ag.data.rotulo : ag.data.iso.split('-').reverse().join('/')} às ${ag.hora}`;
      setAg(null);
      window.alert(`✅ Agendado com ${ag.prof.nome}: ${quando}.\n\nJá está na Agenda.`);
    } catch (e) { setAg(m => ({ ...m, salvando: false, erro: e.message })); }
  };

  if (!podeVer) return <div style={{ padding:40, color:'var(--muted)' }}>🔒 O Painel de Profissionais é do setor de Consultas.</div>;

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Stethoscope size={22} color="var(--tq)"/>
          </div>
          <div>
            <h1 style={{ fontSize:27, fontWeight:800 }}>Painel de Profissionais</h1>
            <p style={{ color:'var(--muted)', fontSize:13 }}>Cadastro de médicos e especialistas + disponibilidade semanal.</p>
          </div>
        </div>
        {ehGestao && <button onClick={()=>{setErro('');setModal({...vazio});}} className="btn btn-p" style={{ gap:6 }}><Plus size={15}/> Novo profissional</button>}
      </div>

      {/* 👨‍⚕️ QUEM ATENDE HOJE — o painel que a recepção olha antes de agendar */}
      {lista.some(p => p.ativo && p.disponibilidade?.[hojeK]?.inicio) && (
        <div className="card" style={{ padding:'13px 17px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5 }}>Atendem hoje</span>
          {lista.filter(p => p.ativo && p.disponibilidade?.[hojeK]?.inicio && p.disponibilidade?.[hojeK]?.fim).map(p => (
            <span key={p.id} style={{ display:'flex', alignItems:'center', gap:7, background:`${p.cor || 'var(--tq)'}14`,
              border:`1px solid ${p.cor || 'var(--tq)'}55`, borderRadius:20, padding:'4px 12px 4px 5px' }}>
              {p.foto
                ? <img src={p.foto} alt="" style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover' }}/>
                : <span style={{ width:22, height:22, borderRadius:'50%', background:p.cor || 'var(--tq)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:900 }}>{fmt.initials(p.nome)}</span>}
              <span style={{ fontSize:12, fontWeight:800 }}>{(p.nome || '').split(' ').slice(0, 2).join(' ')}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>{p.disponibilidade[hojeK].inicio}–{p.disponibilidade[hojeK].fim}</span>
            </span>
          ))}
        </div>
      )}

      {/* 🗂️ TRÊS COLUNAS POR SETOR (pedido do master): Vacinas | Consultas |
          Terapias — cada profissional cadastrado e organizado na sua coluna,
          com dados e documentos no mesmo cartão. O "+ Novo" de cada coluna já
          abre o cadastro com o setor certo marcado. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:14, alignItems:'start' }}>
        {[['vacinas','💉 Vacinas','#7c5cbf'],['consultas','🩺 Consultas','#00B8C0'],['terapias','🧩 Terapias','#C4973B']].map(([sk, srot, scor]) => {
          const doSetor = lista.filter(p2 => (p2.setor || 'consultas') === sk);
          return (
        <div key={sk} style={{ borderRadius:16, background:'var(--bg2)', border:`1.5px solid ${scor}44`, padding:'10px 10px 12px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 4px' }}>
            <span style={{ fontSize:13.5, fontWeight:900, color:scor }}>{srot}</span>
            <span style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', background:'var(--card)', borderRadius:10, padding:'1px 8px' }}>{doSetor.length}</span>
            <span style={{ flex:1 }} />
            {ehGestao && (
              <button onClick={()=>{setErro('');setModal({ ...vazio, setor: sk, cor: scor });}} title={`Cadastrar profissional em ${srot}`}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:9, border:'none', cursor:'pointer', background:scor, color:'#fff', fontSize:11, fontWeight:900 }}>
                <Plus size={12}/> Novo
              </button>
            )}
          </div>
          {doSetor.length === 0 && (
            <div style={{ padding:'18px 10px', textAlign:'center', color:'var(--muted)', fontSize:12, border:'1.5px dashed var(--border)', borderRadius:12 }}>
              Nenhum profissional aqui ainda.{ehGestao ? ' Use o + Novo da coluna.' : ''}
            </div>
          )}
          {doSetor.map(p => (
            <div key={p.id} className="card" style={{ padding:'16px 18px', opacity:p.ativo?1:.55 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                {p.foto
                  ? <img src={p.foto} alt={p.nome} style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`2px solid ${p.cor||'var(--tq)'}` }} />
                  : <div style={{ width:42, height:42, borderRadius:'50%', background:p.cor||'var(--tq)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>{fmt.initials(p.nome)}</div>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:15 }}>{p.nome}{!p.ativo && <span style={{ fontSize:10, color:'var(--err)', fontWeight:800, marginLeft:6 }}>INATIVO</span>}</div>
                  <div style={{ fontSize:12.5, color:'var(--muted)' }}>{p.especialidade || '—'}</div>
                </div>
                {ehGestao && (
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={()=>{setErro('');setModal({ ...vazio, ...p, disponibilidade:p.disponibilidade||{} });}} title="Editar" style={{ padding:5, background:'var(--tq3)', color:'var(--tq)', borderRadius:6 }}><Pencil size={12}/></button>
                    <button onClick={()=>excluir(p)} title="Remover" style={{ padding:5, background:'var(--err2)', color:'var(--err)', borderRadius:6 }}><Trash2 size={12}/></button>
                  </div>
                )}
              </div>
              {p.telefone && <div style={{ fontSize:12, color:'var(--muted)', marginTop:10, display:'flex', alignItems:'center', gap:6 }}><Phone size={12}/> {fmt.phone(p.telefone)}</div>}
              {/* 🕐 CARGA HORÁRIA CONOSCO — painel semanal (pedido do master:
                  "como um painel", não uma linha de texto). Dia com atendimento
                  fica aceso na cor do profissional; hoje ganha contorno. */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:.5, textTransform:'uppercase', color:'var(--muted)', display:'flex', alignItems:'center', gap:5 }}>
                    <Clock size={11}/> Carga horária conosco
                  </span>
                  <span style={{ fontSize:11, fontWeight:900, color: horasSemana(p.disponibilidade) > 0 ? 'var(--tq2)' : 'var(--muted)' }}>
                    {horasSemana(p.disponibilidade) > 0 ? `${fmtH(horasSemana(p.disponibilidade))}/semana` : 'sem horário definido'}
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
                  {DIAS.map(([k, lbl]) => {
                    const d = p.disponibilidade?.[k];
                    const on = !!(d?.inicio && d?.fim);
                    const cor = p.cor || 'var(--tq)';
                    return (
                      <div key={k} title={on ? `${lbl}: ${d.inicio} às ${d.fim} (${fmtH(horasDia(d))})` : `${lbl}: não atende`}
                        style={{ borderRadius:8, padding:'5px 2px', textAlign:'center', lineHeight:1.25,
                          background: on ? `${cor}1c` : 'var(--bg2)',
                          border: k === hojeK ? `1.5px solid ${on ? cor : 'var(--border)'}` : '1.5px solid transparent' }}>
                        <div style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color: on ? cor : 'var(--muted)' }}>{lbl}</div>
                        <div style={{ fontSize:8.5, fontWeight:700, color: on ? 'var(--txt2)' : 'var(--border)' }}>
                          {on ? `${d.inicio}` : '—'}
                        </div>
                        <div style={{ fontSize:8.5, fontWeight:700, color: on ? 'var(--txt2)' : 'var(--border)' }}>
                          {on ? `${d.fim}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 📅 do painel direto pro horário — só dias/horas que ele atende */}
              {p.ativo && (
                <button onClick={() => abrirAgendar(p)}
                  style={{ width:'100%', marginTop:10, padding:'8px 0', borderRadius:10, cursor:'pointer',
                    border:'none', background:`linear-gradient(90deg, ${p.cor || 'var(--tq)'}, ${p.cor || 'var(--tq)'}cc)`,
                    color:'#fff', fontSize:12.5, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <CalendarPlus size={14}/> Agendar com {(p.nome || '').split(' ')[0]}
                </button>
              )}
              {Array.isArray(p.documentos) && p.documentos.length > 0 && (
                <div style={{ marginTop:9, paddingTop:9, borderTop:'1px solid var(--border)', display:'flex', flexWrap:'wrap', gap:6 }}>
                  {p.documentos.map((d, i) => (
                    <a key={i} href={d.arquivo} download={d.nome} title={d.nome}
                      style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'var(--tq2)', background:'var(--tq4)', border:'1px solid var(--tq3)', borderRadius:8, padding:'4px 8px', textDecoration:'none', maxWidth:160 }}>
                      <FileText size={12} style={{ flexShrink:0 }}/>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.nome}</span>
                      <Download size={11} style={{ flexShrink:0, opacity:.7 }}/>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
          );
        })}
      </div>

      {/* 📅 Modal: agendar dentro da disponibilidade do profissional */}
      {ag && (
        <div onClick={()=>setAg(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:470, maxWidth:'100%', maxHeight:'88vh', overflowY:'auto', padding:22 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <h3 style={{ fontSize:16, fontWeight:800 }}>📅 Agendar com {ag.prof.nome}</h3>
              <button onClick={()=>setAg(null)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}><X size={16}/></button>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:13 }}>
              Só aparecem os dias e horários em que {(ag.prof.nome || '').split(' ')[0]} atende conosco. Salvou, já está na Agenda.
            </div>

            <label style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase' }}>Dia</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'5px 0 13px' }}>
              {ag.datas.map(d => (
                <button key={d.iso} onClick={() => { setAg(m => ({ ...m, data:d, hora:'' })); carregarOcupados(ag.prof, d.iso); }}
                  style={{ padding:'6px 11px', borderRadius:10, fontSize:12, fontWeight:800, cursor:'pointer',
                    border:`1.5px solid ${ag.data.iso === d.iso ? (ag.prof.cor || 'var(--tq)') : 'var(--border)'}`,
                    background: ag.data.iso === d.iso ? `${ag.prof.cor || 'var(--tq)'}1c` : 'var(--card)',
                    color: ag.data.iso === d.iso ? 'var(--txt)' : 'var(--muted)', textTransform:'capitalize' }}>
                  {d.rotulo}
                </button>
              ))}
            </div>

            <label style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase' }}>
              Horário ({ag.prof.disponibilidade?.[ag.data.k]?.inicio}–{ag.prof.disponibilidade?.[ag.data.k]?.fim})
            </label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(64px,1fr))', gap:6, margin:'5px 0 13px' }}>
              {slotsDoDia(ag.prof.disponibilidade, ag.data.k).map(h => {
                const tomado = ocupados.includes(h);
                return (
                  <button key={h} disabled={tomado} onClick={() => setAg(m => ({ ...m, hora:h }))}
                    title={tomado ? 'Horário já agendado' : ''}
                    style={{ padding:'7px 0', borderRadius:9, fontSize:12.5, fontWeight:800,
                      cursor: tomado ? 'not-allowed' : 'pointer',
                      textDecoration: tomado ? 'line-through' : 'none', opacity: tomado ? .45 : 1,
                      border:`1.5px solid ${ag.hora === h ? (ag.prof.cor || 'var(--tq)') : 'var(--border)'}`,
                      background: ag.hora === h ? (ag.prof.cor || 'var(--tq)') : 'var(--card)',
                      color: ag.hora === h ? '#fff' : 'var(--txt2)' }}>
                    {h}
                  </button>
                );
              })}
            </div>

            <div className="field" style={{ margin:'0 0 10px' }}><label>Paciente *</label>
              <input value={ag.paciente} onChange={e=>setAg(m=>({ ...m, paciente:e.target.value }))} placeholder="Nome do paciente" autoFocus/></div>
            <div style={{ display:'flex', gap:10 }}>
              <div className="field" style={{ flex:1, margin:0 }}><label>Telefone</label>
                <input value={ag.telefone} onChange={e=>setAg(m=>({ ...m, telefone:e.target.value }))} placeholder="(98) 9…"/></div>
              <div className="field" style={{ flex:1, margin:0 }}><label>Serviço</label>
                <input value={ag.servico} onChange={e=>setAg(m=>({ ...m, servico:e.target.value }))} placeholder="Consulta"/></div>
            </div>

            {ag.erro && <div style={{ fontSize:12, color:'var(--err)', fontWeight:700, marginTop:10 }}>{ag.erro}</div>}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={salvarAgendamento} disabled={ag.salvando} className="btn btn-p" style={{ flex:1, gap:6 }}>
                <CalendarPlus size={14}/> {ag.salvando ? 'Agendando…' : ag.hora ? `Agendar ${ag.data.rotulo} às ${ag.hora}` : 'Agendar'}
              </button>
              <button onClick={()=>setAg(null)} className="btn">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div onClick={()=>setModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:480, maxWidth:'100%', maxHeight:'88vh', overflowY:'auto', padding:22 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h3 style={{ fontSize:16, fontWeight:800 }}>{modal.id ? 'Editar profissional' : 'Novo profissional'}</h3>
              <button onClick={()=>setModal(null)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {/* Foto do profissional */}
              <div className="field" style={{ margin:0 }}>
                <label>Foto do profissional</label>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {modal.foto
                    ? <img src={modal.foto} alt="" style={{ width:60, height:60, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--tq)' }} />
                    : <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}><Camera size={22}/></div>}
                  <input ref={fotoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={escolherFoto}/>
                  <button type="button" onClick={()=>fotoRef.current?.click()} className="btn btn-s btn-sm" style={{ gap:6 }}><Camera size={14}/> {modal.foto?'Trocar foto':'Anexar foto'}</button>
                  {modal.foto && <button type="button" onClick={()=>setModal({...modal,foto:null})} className="btn btn-sm" style={{ color:'var(--err)' }}>Remover</button>}
                </div>
              </div>
              <div className="field" style={{ margin:0 }}><label>Nome *</label><input value={modal.nome} onChange={e=>setModal({...modal,nome:e.target.value})} placeholder="Ex: Dra. Helena Brandão"/></div>
              <div className="field" style={{ margin:0 }}><label>Especialidade</label><input value={modal.especialidade} onChange={e=>setModal({...modal,especialidade:e.target.value})} placeholder="Ex: Neuropediatra"/></div>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Setor</label>
                  <select value={modal.setor} onChange={e=>setModal({...modal,setor:e.target.value})} style={{ width:'100%' }}>
                    {SETORES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex:1, margin:0 }}><label>Telefone</label><input value={modal.telefone} onChange={e=>setModal({...modal,telefone:e.target.value})} placeholder="(98) 9...."/></div>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Cor</label>
                <div style={{ display:'flex', gap:7 }}>
                  {CORES.map(c => <button key={c} onClick={()=>setModal({...modal,cor:c})} style={{ width:24, height:24, borderRadius:'50%', background:c, border:modal.cor===c?'3px solid var(--txt)':'2px solid #fff', cursor:'pointer', boxShadow:'0 0 0 1px var(--border)' }}/>)}
                </div>
              </div>

              <div className="field" style={{ margin:0 }}>
                <label>Disponibilidade (deixe vazio o dia que não atende)</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {DIAS.map(([k,lbl]) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:34, fontSize:12, fontWeight:700, color:'var(--muted)' }}>{lbl}</span>
                      <input type="time" value={modal.disponibilidade?.[k]?.inicio || ''} onChange={e=>setDispDia(k,'inicio',e.target.value)} style={{ flex:1 }}/>
                      <span style={{ color:'var(--muted)' }}>às</span>
                      <input type="time" value={modal.disponibilidade?.[k]?.fim || ''} onChange={e=>setDispDia(k,'fim',e.target.value)} style={{ flex:1 }}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Documentos complementares (diploma, registro, etc.) */}
              <div className="field" style={{ margin:0 }}>
                <label>Documentos complementares (diploma, registro…) — até {MAX_DOCS} anexos</label>
                <input ref={docRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" style={{ display:'none' }} onChange={anexarDocs}/>
                <button type="button" onClick={()=>docRef.current?.click()} className="btn btn-s btn-sm" style={{ gap:6 }}><Paperclip size={14}/> Anexar documento</button>
                <span style={{ marginLeft:8, fontSize:12, color:'var(--muted)' }}>{(modal.documentos || []).length}/{MAX_DOCS}</span>
                {(modal.documentos || []).length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
                    {(modal.documentos || []).map((d, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', borderRadius:8, padding:'6px 10px' }}>
                        <FileText size={14} style={{ flexShrink:0, color:'var(--tq2)' }}/>
                        <span style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.nome}</span>
                        <button type="button" onClick={()=>removerDoc(i)} title="Remover" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--err)' }}><X size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer' }}>
                <input type="checkbox" checked={modal.ativo} onChange={e=>setModal({...modal,ativo:e.target.checked})} style={{ width:15, height:15 }}/>
                <span style={{ fontSize:13 }}>Profissional ativo</span>
              </label>

              {erro && <div style={{ fontSize:12, color:'var(--err)', fontWeight:600 }}>{erro}</div>}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex:1, gap:5 }}><Check size={14}/> {salvando?'Salvando…':'Salvar'}</button>
                <button onClick={()=>setModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
