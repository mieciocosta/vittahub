import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const DEMOS = [
  { label:'Miecio Costa',   sub:'Master · Acesso total', email:'miecio@vittalissaude.com.br',  role:'master' },
  { label:'Nágila Santos',  sub:'Atendente',              email:'nagila@vittalissaude.com.br',   role:'att' },
  { label:'Raquel Ferreira',sub:'Atendente',              email:'raquel@vittalissaude.com.br',   role:'att' },
  { label:'Thales Oliveira',sub:'Atendente',              email:'thales@vittalissaude.com.br',   role:'att' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');

  const doLogin = async (e, s) => {
    setError(''); setLoading(e);
    try { await login(e, s); }
    catch(err) { setError(err.message); setLoading(''); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex' }}>
      {/* Left — brand panel */}
      <div style={{
        flex:'0 0 46%', background:`linear-gradient(160deg, var(--pet3) 0%, var(--pet2) 40%, var(--pet) 80%, var(--tq) 120%)`,
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        padding:'48px 52px', position:'relative', overflow:'hidden'
      }}>
        {/* diamond bg watermark */}
        <svg style={{ position:'absolute', right:-80, bottom:-80, opacity:.07 }} width="420" height="420" viewBox="0 0 100 80">
          <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="none" stroke="white" strokeWidth="1.5"/>
          <polygon points="50,5 75,30 75,70 50,92 25,70 25,30" fill="none" stroke="white" strokeWidth="1"/>
          <line x1="10" y1="30" x2="90" y2="30" stroke="white" strokeWidth=".8"/>
          <line x1="25" y1="30" x2="50" y2="5" stroke="white" strokeWidth=".8"/>
          <line x1="75" y1="30" x2="50" y2="5" stroke="white" strokeWidth=".8"/>
          <line x1="10" y1="30" x2="50" y2="92" stroke="white" strokeWidth=".5"/>
          <line x1="90" y1="30" x2="50" y2="92" stroke="white" strokeWidth=".5"/>
          <line x1="50" y1="5" x2="50" y2="92" stroke="white" strokeWidth=".8"/>
        </svg>

        <div>
          <img src="/logos/logo-h-white.png" alt="Vittalis Saúde" style={{ height:38, objectFit:'contain' }} />
          <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6, background:'rgba(0,184,192,0.18)', borderRadius:20, padding:'4px 12px' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--tq)', display:'inline-block', boxShadow:'0 0 8px var(--tq)' }} />
            <span style={{ color:'rgba(255,255,255,0.75)', fontSize:11.5, fontWeight:600, letterSpacing:1.2 }}>VITTAHUB CRM</span>
          </div>
        </div>

        <div>
          <p style={{ fontFamily:'Fraunces', fontSize:38, fontWeight:300, color:'#fff', lineHeight:1.2, marginBottom:20 }}>
            Sua vida é<br/><em style={{ fontWeight:600, color:'var(--tq)' }}>preciosa.</em>
          </p>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13.5, lineHeight:1.7, maxWidth:340 }}>
            Plataforma comercial integrada para a equipe Vittalis Saúde. Gerencie leads, atendimentos e propostas em um só lugar.
          </p>
        </div>

        <div style={{ display:'flex', gap:28 }}>
          {[['Missão','Promover qualidade de vida e longevidade'],['Visão','Referência em atendimento humanizado'],['Propósito','Cuidar das pessoas para que vivam bem']].map(([t,d])=>(
            <div key={t}>
              <div style={{ color:'var(--tq)', fontSize:10.5, fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:3 }}>{t}</div>
              <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11.5, lineHeight:1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — login */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 48px', background:'#fafcfe' }}>
        <div style={{ width:'100%', maxWidth:400 }} className="anim">
          <h1 style={{ fontSize:32, fontWeight:600, marginBottom:4, color:'var(--txt)' }}>Entrar</h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginBottom:36 }}>Acesse o painel comercial</p>

          {/* Quick access */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.8, marginBottom:12 }}>Acesso rápido</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {DEMOS.map(d => (
                <button key={d.email} onClick={() => doLogin(d.email, 'vittalis123')} disabled={!!loading}
                  style={{
                    padding:'12px 14px', borderRadius:10, textAlign:'left', cursor:'pointer',
                    background: loading===d.email ? 'var(--tq)' : d.role==='master' ? 'var(--pet2)' : '#fff',
                    border: `1.5px solid ${d.role==='master' ? 'var(--pet2)' : 'var(--border)'}`,
                    transition:'all .15s', fontFamily:'DM Sans, sans-serif',
                    boxShadow: d.role==='master' ? '0 3px 10px rgba(13,61,82,.2)' : 'var(--s1)',
                  }}
                  onMouseEnter={e => { if(!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
                  {loading===d.email
                    ? <div style={{display:'flex',alignItems:'center',gap:7,color:d.role==='master'?'#fff':'var(--tq)'}}><span className="spin" style={{borderColor:d.role==='master'?'rgba(255,255,255,.3)':'var(--border)',borderTopColor:d.role==='master'?'#fff':'var(--tq)',width:13,height:13}}/><span style={{fontSize:12.5}}>Entrando…</span></div>
                    : <>
                        <div style={{ fontSize:13, fontWeight:700, color: d.role==='master'?'#fff':'var(--txt)', marginBottom:1 }}>{d.label}</div>
                        <div style={{ fontSize:11, color: d.role==='master'?'rgba(255,255,255,.5)':'var(--light)' }}>{d.sub}</div>
                      </>
                  }
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            <span style={{ fontSize:12, color:'var(--light)', fontWeight:500 }}>ou entre com e-mail</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
          </div>

          <form onSubmit={e=>{e.preventDefault();doLogin(email,senha);}} style={{display:'flex',flexDirection:'column',gap:14}}>
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••" />
            </div>
            {error && (
              <div style={{background:'var(--err2)',color:'var(--err)',padding:'10px 14px',borderRadius:8,fontSize:13,fontWeight:500,borderLeft:'3px solid var(--err)'}}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-p" disabled={!email||!senha||!!loading} style={{width:'100%',padding:'12px',fontSize:14}}>
              {loading==='form'?<span className="spin"/>:'Entrar'}
            </button>
          </form>

          <p style={{ marginTop:20, textAlign:'center', fontSize:12, color:'var(--light)' }}>
            Senha padrão demo: <code style={{fontFamily:'DM Mono',background:'var(--bg2)',padding:'2px 7px',borderRadius:5}}>vittalis123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
