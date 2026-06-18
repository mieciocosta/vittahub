import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, LogIn, Fingerprint, ShieldCheck, MessageSquare, CalendarDays, Bot, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/* ─── Login VittaHub 2.0 — layout aprovado pela gestão ──────────────────────── */

const MENSAGENS_DIA = [
  'Cada família atendida hoje é uma oportunidade de fazer a diferença. 💙',
  'Seu cuidado no atendimento transforma clientes em famílias da Vittalis. ✨',
  'Por trás de cada conversa existe alguém buscando o melhor pra quem ama. 💙',
  'Atendimento humanizado é o que você faz naturalmente todos os dias. 💎',
  'Hoje alguém vai escolher a Vittalis por causa do SEU atendimento. 🏆',
  'Cada agendamento de hoje é uma família mais protegida amanhã. 💙',
  'Constância vence talento — e você tem os dois! ✨',
];
const VERSICULOS = [
  ['E tudo o que fizerem, façam de todo o coração, como para o Senhor.', 'Colossenses 3:23'],
  ['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.', 'Salmos 37:5'],
  ['Tudo posso naquele que me fortalece.', 'Filipenses 4:13'],
  ['O coração alegre é como o bom remédio.', 'Provérbios 17:22'],
  ['As misericórdias do Senhor se renovam a cada manhã.', 'Lamentações 3:22'],
  ['Este é o dia que o Senhor fez; regozijemo-nos nele.', 'Salmos 118:24'],
  ['Não temas, porque eu sou contigo.', 'Isaías 41:10'],
];

const WA_GESTAO = 'https://wa.me/5598984221002?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20meu%20acesso%20ao%20VittaHub%20%F0%9F%92%8E';

export default function Login() {
  const { login } = useAuth();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const dia = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const msgDia = MENSAGENS_DIA[dia % MENSAGENS_DIA.length];
  const [verso, ref] = VERSICULOS[dia % VERSICULOS.length];

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

  const doLogin = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setError(''); setInfo(''); setLoading(true);
    try { await login(cpf, senha); }
    catch (err) { setError(err.message); setLoading(false); }
  };

  const Feature = ({ Icon, titulo, texto }) => (
    <div style={{ flex: 1, minWidth: 130 }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon size={19} color="#fff" />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: '#aff3f6', marginBottom: 5 }}>{titulo}</div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.5 }}>{texto}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#fff' }}>
      <style>{`
        .vh-login-left { display:none; }
        @media (min-width: 940px) { .vh-login-left { display:flex; } }
        .vh-field { display:flex; align-items:center; gap:10px; border:1.5px solid #dfe7ea; border-radius:13px; padding:13px 15px; background:#fff; transition:border-color .15s, box-shadow .15s; }
        .vh-field:focus-within { border-color:#00B8C0; box-shadow:0 0 0 3px rgba(0,184,192,.13); }
        .vh-field input { border:none; outline:none; flex:1; font-size:14.5px; background:transparent; color:#0c2a30; min-width:0; }
        .vh-field input::placeholder { color:#9fb3ba; }
      `}</style>

      {/* ── Painel esquerdo — marca, mensagem do dia ── */}
      <div className="vh-login-left" style={{ flex: '1.15 1 0', position: 'relative', overflow: 'hidden', flexDirection: 'column', justifyContent: 'space-between', padding: '46px 52px',
        background: 'linear-gradient(150deg, #00B8C0 0%, #0E8C96 55%, #07555c 100%)', color: '#fff' }}>
        {/* brilhos + diamante watermark */}
        <div style={{ position: 'absolute', top: 60, right: 120, width: 10, height: 10, borderRadius: '50%', background: '#fff', opacity: .8, boxShadow: '0 0 26px 8px rgba(255,255,255,.55)' }} />
        <div style={{ position: 'absolute', top: 160, right: 50, width: 5, height: 5, borderRadius: '50%', background: '#fff', opacity: .6, boxShadow: '0 0 14px 5px rgba(255,255,255,.4)' }} />
        <img src="/logos/logo-icon-white.png" alt="" style={{ position: 'absolute', right: -110, top: '32%', width: 460, opacity: .10, pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          <img src="/logos/logo-v-white.png" alt="Vittalis Saúde" style={{ height: 92, marginBottom: 14 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 15px', borderRadius: 999, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.3)', fontSize: 12.5, fontWeight: 800, letterSpacing: .8 }}>
            💎 VITTAHUB 2.0
          </span>

          <h1 style={{ fontSize: 41, fontWeight: 800, lineHeight: 1.18, margin: '26px 0 6px', maxWidth: 480 }}>
            Cada agendamento é uma oportunidade de{' '}
            <span style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontWeight: 400, color: '#aff3f6' }}>
              você crescer. <Heart size={26} style={{ display: 'inline', verticalAlign: '-3px' }} />
            </span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.88)', lineHeight: 1.6, maxWidth: 470, marginTop: 14 }}>
            WhatsApp, agenda, vacinas, consultas e terapias organizados em uma única plataforma para{' '}
            <b style={{ color: '#aff3f6' }}>cuidar de cada família</b> com excelência.
          </p>
        </div>

        <div style={{ position: 'relative', display: 'flex', gap: 26, margin: '34px 0', flexWrap: 'wrap' }}>
          <Feature Icon={MessageSquare} titulo="Chat Inteligente" texto="Atendimento organizado em tempo real." />
          <Feature Icon={CalendarDays} titulo="Agenda Integrada" texto="Consultas, vacinas e terapias em um só lugar." />
          <Feature Icon={Bot} titulo="IA Assistente" texto="Respostas, orçamentos e sugestões inteligentes." />
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ borderRadius: 16, background: 'linear-gradient(135deg, rgba(196,151,59,.22), rgba(2,38,42,.35))', border: '1px solid rgba(196,151,59,.45)', padding: '14px 20px', marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, fontWeight: 800, color: '#fff' }}>
              Resultados fortes mostram um líder forte. Resultados fracos mostram um líder fraco.
            </div>
            <div style={{ fontSize: 13, color: '#C4973B', fontWeight: 800, marginTop: 5 }}>Decida fazer história de sucesso. 🏆</div>
          </div>
          <div style={{ display: 'flex', gap: 0, borderRadius: 16, background: 'rgba(2,38,42,.35)', border: '1px solid rgba(255,255,255,.18)', padding: '16px 20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1.2 1 240px', display: 'flex', gap: 12, alignItems: 'flex-start', paddingRight: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Heart size={16} color="#aff3f6" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .8, color: '#aff3f6', textTransform: 'uppercase', marginBottom: 4 }}>Mensagem do dia</div>
                <div style={{ fontSize: 13, lineHeight: 1.55 }}>{msgDia}</div>
              </div>
            </div>
            <div style={{ flex: '1 1 220px', borderLeft: '1px solid rgba(255,255,255,.18)', paddingLeft: 18, display: 'flex', gap: 9 }}>
              <span style={{ fontSize: 22, color: '#aff3f6', fontWeight: 900, lineHeight: 1 }}>“</span>
              <div>
                <div style={{ fontSize: 13, lineHeight: 1.55, fontStyle: 'italic' }}>{verso}</div>
                <div style={{ fontSize: 11.5, color: '#aff3f6', fontWeight: 700, marginTop: 4 }}>{ref}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,.75)' }}>
            <ShieldCheck size={14} /> Ambiente seguro e protegido com criptografia avançada.
          </div>
        </div>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '34px 22px' }}>
        <form onSubmit={doLogin} style={{ width: '100%', maxWidth: 396 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <img src="/logos/logo-v-color.png" alt="Vittalis Saúde" style={{ height: 96, marginBottom: 8 }} />
            <h2 style={{ fontSize: 27, fontWeight: 800, color: '#0c2a30' }}>Bem-vindo(a)</h2>
            <p style={{ fontSize: 13.5, color: '#6b7f86', marginTop: 5 }}>Acesse sua conta para iniciar<br />seus atendimentos.</p>
          </div>

          {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 11, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
          {info && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 11, background: '#e8f7f8', color: '#0E8C96', fontSize: 12.5, fontWeight: 600 }}>{info}</div>}

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: .7, color: '#46606a', marginBottom: 7 }}>CPF</label>
          <div className="vh-field" style={{ marginBottom: 16 }}>
            <User size={16} color="#9fb3ba" />
            <input inputMode="numeric" autoComplete="username" value={cpf} onChange={e => onCpfChange(e.target.value)} placeholder="000.000.000-00" />
          </div>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: .7, color: '#46606a', marginBottom: 7 }}>SENHA</label>
          <div className="vh-field">
            <Lock size={16} color="#9fb3ba" />
            <input type={showPwd ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Digite sua senha" />
            <button type="button" onClick={() => setShowPwd(p => !p)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9fb3ba', display: 'flex' }}>
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div style={{ textAlign: 'right', marginTop: 9 }}>
            <a href={WA_GESTAO} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#00B8C0', textDecoration: 'none' }}>Esqueceu sua senha?</a>
          </div>

          <button type="submit" disabled={!cpf || !senha || loading}
            style={{ width: '100%', marginTop: 18, padding: '14px 0', borderRadius: 13, border: 'none', cursor: (!cpf || !senha || loading) ? 'default' : 'pointer',
              background: 'linear-gradient(135deg,#00B8C0,#0aa6ae)', color: '#fff', fontSize: 15, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              boxShadow: '0 8px 22px rgba(0,184,192,.35)', opacity: (!cpf || !senha || loading) ? .6 : 1, transition: 'transform .12s' }}
            onMouseEnter={e => { if (cpf && senha && !loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <LogIn size={17} /> {loading ? 'Entrando…' : 'Acessar Plataforma'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e3ebee' }} />
            <span style={{ fontSize: 12, color: '#9fb3ba', fontWeight: 600 }}>ou</span>
            <div style={{ flex: 1, height: 1, background: '#e3ebee' }} />
          </div>

          <button type="button"
            onClick={() => setInfo('A biometria chega na próxima atualização — por enquanto, entre com CPF e senha. 💎')}
            style={{ width: '100%', padding: '13px 0', borderRadius: 13, border: '1.5px solid #c9e9eb', background: '#fff', color: '#00B8C0', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
            <Fingerprint size={17} /> Entrar com biometria
          </button>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7f86', marginTop: 22 }}>
            Problemas para acessar?{' '}
            <a href={WA_GESTAO} target="_blank" rel="noreferrer" style={{ color: '#C4973B', fontWeight: 700 }}>Fale com a gestão da Vittalis.</a>
          </p>
        </form>
      </div>
    </div>
  );
}
