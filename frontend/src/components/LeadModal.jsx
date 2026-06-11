import React, { useState, useEffect } from 'react';
import { X, UserPlus } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { mask } from '../hooks/utils.js';

const ORIGENS = ['Instagram','Google','WhatsApp','Indicação','Facebook','Tráfego Pago','Orgânico','Outro'];
const INTERESSES = ['Vacina','Plano Vacinal','Consulta','Terapia','Plano Infantil','Gestante','Outro'];
const MOTIVOS = ['Preço','Concorrência','Sem interesse','Sem retorno','Adiou','Outro'];
const TAGS = ['urgente','quente','plano','vip','infantil','retorno','casal','gestante','indicação','frio'];

export default function LeadModal({ lead, onClose, onSave, prefill = {} }) {
  const isEdit = !!lead?.id;
  const { isMaster } = useAuth();
  const api = useApi();
  const [users, setUsers] = useState([]);
  const [statusList, setStatusList] = useState(['Novo lead','Em atendimento','Orçamento enviado','Aguardando retorno','Fechado','Perdido']);
  const [saving, setSaving] = useState(false);
  // O backend devolve snake_case — hidrata os campos camelCase do formulário
  // (antes disso, responsável/valor/retorno/motivo apareciam vazios na edição)
  const hidratar = (l) => !l ? {} : {
    ...l,
    telefone: mask.phone(l.telefone || ''),
    responsavelId: l.responsavelId ?? l.responsavel_id ?? '',
    valorProposta: (l.valorProposta ?? l.valor_proposta) ? mask.moneyBR(String(Math.round(parseFloat(l.valorProposta ?? l.valor_proposta) * 100))) : '',
    dataRetorno:   (l.dataRetorno ?? l.data_retorno ?? '') ? String(l.dataRetorno ?? l.data_retorno).slice(0,10) : '',
    motivoPerda:   l.motivoPerda ?? l.motivo_perda ?? '',
    tags: l.tags || [],
  };
  const [f, setF] = useState({ nome:'', telefone:'', email:'', origem:'Instagram', interesse:'Vacina', status:'Novo lead', responsavelId:'', valorProposta:'', servico:'', dataRetorno:'', observacoes:'', motivoPerda:'', tags:[], ...hidratar(lead), ...prefill });

  useEffect(() => { api.get('/leads/meta').then(m => { setUsers(m.users); if (m.statusList?.length) setStatusList(m.statusList); }); }, []);
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const toggleTag = t => set('tags', f.tags.includes(t)?f.tags.filter(x=>x!==t):[...f.tags,t]);

  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.nome.trim()) return setErr('Informe o nome do lead.');
    const tel = mask.digits(f.telefone);
    if (tel.length < 10) return setErr('Telefone incompleto — informe DDD + número.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setErr('E-mail inválido.');
    setSaving(true);
    try {
      await onSave({ ...f, nome: f.nome.trim(), telefone: tel, valorProposta: mask.moneyToNumber(f.valorProposta) });
      onClose();
    } catch (e2) { setErr(e2.message); }
    finally { setSaving(false); }
  };

  const ChipGroup = ({ label, options, field, color='var(--tq)', colorActive='var(--tq)' }) => (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {options.map(o => {
          const active = f[field] === o;
          return (
            <button key={o} type="button" onClick={()=>set(field,o)} style={{ padding:'5px 13px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all .1s', background:active?colorActive:'#fff', color:active?'#fff':'var(--muted)', borderColor:active?colorActive:'var(--border)' }}>{o}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:'fixed', inset:0, background:'rgba(7,30,44,0.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)' }}>
      <div className="anim" style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:600, maxHeight:'92vh', overflowY:'auto', boxShadow:'var(--sh4)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'22px 24px 16px', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center' }}><UserPlus size={17} color="var(--tq)" /></div>
            <div>
              <h2 style={{ fontSize:17, fontWeight:800 }}>{isEdit?'Editar Lead':'Novo Lead'}</h2>
              <p style={{ color:'var(--muted)', fontSize:12 }}>{isEdit?lead.nome:'Cadastro rápido · clique nos chips'}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-g btn-ico"><X size={17} /></button>
        </div>

        <form onSubmit={save} style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:18 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field" style={{ gridColumn:'1/-1' }}>
              <label>Nome completo *</label>
              <input value={f.nome} maxLength={80} onChange={e=>set('nome',e.target.value)} placeholder="Ex: Ana Beatriz Sousa" required />
            </div>
            <div className="field">
              <label>WhatsApp *</label>
              <input value={f.telefone} inputMode="numeric" maxLength={16} onChange={e=>set('telefone', mask.phone(e.target.value))} placeholder="(98) 99999-9999" required />
            </div>
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={f.email||''} maxLength={120} onChange={e=>set('email',e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>

          <ChipGroup label="Canal de origem" field="origem" options={ORIGENS} colorActive="var(--pet)" />
          <ChipGroup label="Interesse" field="interesse" options={INTERESSES} colorActive="var(--tq)" />

          {isEdit && (
            <>
              <ChipGroup label="Status" field="status" options={statusList} colorActive="var(--pet2)" />
              {f.status==='Perdido' && (
                <div className="field">
                  <label>Motivo da perda</label>
                  <select value={f.motivoPerda||''} onChange={e=>set('motivoPerda',e.target.value)}>
                    <option value="">— Selecione —</option>
                    {MOTIVOS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Tags */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:8 }}>Tags</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {TAGS.map(t => (
                <button key={t} type="button" onClick={()=>toggleTag(t)} style={{ padding:'4px 11px', borderRadius:20, fontSize:11.5, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all .1s', background:f.tags.includes(t)?'var(--gold2)':'#fff', color:f.tags.includes(t)?'var(--gold)':'var(--light)', borderColor:f.tags.includes(t)?'var(--gold)':'var(--border)' }}>#{t}</button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Responsável</label>
              <select value={f.responsavelId||''} onChange={e=>set('responsavelId',e.target.value)}>
                <option value="">— Auto-atribuir —</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Data de retorno</label>
              <input type="date" min={new Date().toISOString().slice(0,10)} value={f.dataRetorno||''} onChange={e=>set('dataRetorno',e.target.value)} />
            </div>
            {isMaster && (
              <div className="field">
                <label>Valor proposta (R$)</label>
                <input inputMode="numeric" value={f.valorProposta||''} onChange={e=>set('valorProposta', mask.moneyBR(e.target.value))} placeholder="R$ 0,00" />
              </div>
            )}
            <div className="field" style={!isMaster?{gridColumn:'1/-1'}:{}}>
              <label>Serviço / Produto</label>
              <input value={f.servico||''} maxLength={80} onChange={e=>set('servico',e.target.value)} placeholder="Ex: Plano Vacinal Adulto" />
            </div>
            <div className="field" style={{ gridColumn:'1/-1' }}>
              <label>Observações</label>
              <textarea value={f.observacoes||''} maxLength={600} onChange={e=>set('observacoes',e.target.value)} rows={2} placeholder="Anotações sobre o lead..." style={{ resize:'vertical' }} />
              <div style={{ fontSize:10.5, color:'var(--light)', textAlign:'right', marginTop:2 }}>{(f.observacoes||'').length}/600</div>
            </div>
          </div>

          {err && <div style={{ padding:'8px 13px', borderRadius:9, background:'var(--err2)', color:'var(--err)', fontSize:12.5, fontWeight:600 }}>{err}</div>}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-s">Cancelar</button>
            <button type="submit" className="btn btn-p" disabled={saving}>
              {saving?<span className="spin" style={{width:15,height:15}} />:isEdit?'Salvar':'Cadastrar lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
