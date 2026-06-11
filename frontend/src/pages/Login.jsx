import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Máscara de CPF enquanto digita (aceita e-mail também, sem máscara)
  const onCpfChange = (v) => {
    if (v.includes('@') || /[a-zA-Z]/.test(v)) { setCpf(v); return; }
    const d = v.replace(/\D/g, '').slice(0, 11);
    let out = d;
    if (d.length > 9) out = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    else if (d.length > 6) out = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    else if (d.length > 3) out = `${d.slice(0,3)}.${d.slice(3)}`;
    setCpf(out);
  };

  const doLogin = async () => {
    setError(''); setLoading(true);
    try { await login(cpf, senha); }
    catch(err) { setError(err.message); setLoading(false); }
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
          <img src="/logos/logo-icon-white.png" alt="" style={{ height:44, objectFit:'contain', display:'block' }} />
          <div style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:6, background:'rgba(0,184,192,0.18)', borderRadius:20, padding:'4px 12px' }}>
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
        <div style={{ width:'100%', maxWidth:380 }} className="anim">
          <img src="/logos/logo-v-color.png" alt="Vittalis Saúde" style={{ height:92, display:'block', margin:'0 auto 24px' }} />
          <h1 style={{ fontSize:28, fontWeight:800, marginBottom:4, color:'var(--txt)', textAlign:'center' }}>Bem-vindo</h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginBottom:28, textAlign:'center' }}>Acesse com seu CPF e senha</p>

          <form onSubmit={e=>{e.preventDefault();doLogin();}} style={{display:'flex',flexDirection:'column',gap:14}}>
            <div className="field">
              <label>CPF</label>
              <input inputMode="numeric" autoComplete="username" value={cpf} onChange={e=>onCpfChange(e.target.value)}
                placeholder="000.000.000-00" autoFocus
                style={{ fontSize:15, letterSpacing:.5 }} />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" autoComplete="current-password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••" />
            </div>
            {error && (
              <div style={{background:'var(--err2)',color:'var(--err)',padding:'10px 14px',borderRadius:8,fontSize:13,fontWeight:500,borderLeft:'3px solid var(--err)'}}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-p" disabled={!cpf||!senha||loading} style={{width:'100%',padding:'13px',fontSize:14.5}}>
              {loading?<span className="spin"/>:'Entrar'}
            </button>
          </form>

          <p style={{ marginTop:22, textAlign:'center', fontSize:12, color:'var(--light)', lineHeight:1.6 }}>
            Esqueceu a senha? Fale com a gestão da Vittalis.
          </p>
        </div>
      </div>
    </div>
  );
}
