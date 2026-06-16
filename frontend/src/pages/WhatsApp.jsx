import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, WifiOff, Loader2, QrCode,
         LogOut, RotateCcw, ArrowRightLeft, Smartphone } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';

const WA_GREEN = '#25D366';

export default function WhatsApp() {
  const api = useApi();
  const [status, setStatus]     = useState('loading');
  const [qrcode, setQrcode]     = useState(null);
  const [phone, setPhone]       = useState(null);
  const [msg, setMsg]           = useState('');
  const [busy, setBusy]         = useState(false);
  const [step, setStep]         = useState(null); // null | 'phone-step' | 'qr-ready'
  const [clearConvs, setClearConvs] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => { clearInterval(pollRef.current); pollRef.current = null; };

  const checkStatus = async (autoSetup = false) => {
    try {
      const d = await api.get('/inbox/whatsapp/zapi/status');
      if (d.connected) {
        setStatus('connected'); setQrcode(null); stopPoll();
        setPhone(d.phone || null); setStep(null);
        if (autoSetup) {
          api.post('/inbox/whatsapp/zapi/setup-webhooks', {})
            .then(r => setMsg(`✅ Conectado! Webhooks configurados: ${r.webhookUrl}`))
            .catch(() => setMsg('✅ WhatsApp conectado'));
        }
      } else {
        setStatus('disconnected');
      }
    } catch { setStatus('error'); }
  };

  useEffect(() => { checkStatus(); return stopPoll; }, []);

  // Socket.io: recebe updates de status Z-API em tempo real via webhook
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const tk = localStorage.getItem('vh_token') || '';
    if (!tk) return;
    let socket = null;
    import('socket.io-client').then(({ io }) => {
      socket = io(BASE, { auth: { token: tk }, transports: ['websocket', 'polling'] });
      socket.on('zapi_status', ({ connected, phone }) => {
        if (connected) {
          setStatus('connected'); setPhone(phone || null); setStep(null); stopPoll();
          setMsg('✅ WhatsApp conectado! Configurando webhooks...');
          api.post('/inbox/whatsapp/zapi/setup-webhooks', {})
            .then(() => setMsg('✅ WhatsApp conectado e webhooks configurados. Importe o histórico para carregar as conversas.'))
            .catch(() => {});
        } else {
          setStatus('disconnected'); setPhone(null);
        }
      });
    }).catch(() => {});
    return () => socket?.disconnect();
  }, []);

  // Auto-verifica status a cada 5s quando desconectado
  // Detecta quando usuário conectou pelo painel Z-API diretamente
  useEffect(() => {
    if (status !== 'disconnected' && status !== 'error') return;
    const iv = setInterval(async () => {
      try {
        const d = await api.get('/inbox/whatsapp/zapi/status');
        if (d.connected) {
          setStatus('connected'); setPhone(d.phone || null); setStep(null);
          setMsg('✅ WhatsApp conectado! Configurando webhooks...');
          stopPoll();
          // Auto-configura webhooks
          api.post('/inbox/whatsapp/zapi/setup-webhooks', {})
            .then(() => setMsg('✅ WhatsApp conectado e webhooks configurados. Clique em "Importar histórico" para carregar as conversas.'))
            .catch(() => {});
        }
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [status]);

  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const d = await api.get('/inbox/whatsapp/zapi/status');
        if (d.connected) {
          setStatus('connected'); setQrcode(null); stopPoll();
          setPhone(d.phone || null); setStep(null);
          setMsg('✅ WhatsApp conectado! Configurando webhooks...');
          // Auto-configura webhooks após conectar
          api.post('/inbox/whatsapp/zapi/setup-webhooks', {})
            .then(r => setMsg(`✅ WhatsApp conectado e webhooks configurados`))
            .catch(() => setMsg('✅ WhatsApp conectado'));
        }
      } catch {}
    }, 3000);
  };

  // PASSO 1: Mostra instruções para desconectar do celular
  const startConnect = () => {
    setStep('phone-step');
    setMsg('');
  };

  // PASSO 2: Após confirmar que desconectou do celular, gera QR
  const generateQR = async () => {
    setBusy(true);
    setMsg('Reiniciando Z-API e gerando QR Code... aguarde até 30 segundos.');
    try {
      const d = await api.get('/inbox/whatsapp/zapi/qrcode');
      if (d.qrcode) {
        setQrcode(d.qrcode);
        setStatus('qrcode');
        setStep('qr-ready');
        setMsg('');
        startPoll();
      } else {
        setMsg('zapi-fallback');
      }
    } catch (e) { setMsg('zapi-fallback'); }
    setBusy(false);
  };

  const disconnect = async () => {
    const limpar = confirm(
      'Desconectar o WhatsApp?\n\nClique OK para desconectar E limpar todas as conversas.\nClique Cancelar para só desconectar sem limpar.'
    );
    // Se cancelou totalmente — usa um segundo confirm mais claro
    const only = !limpar ? confirm('Desconectar SEM limpar as conversas?') : false;
    if (!limpar && !only) return;

    setBusy(true);
    try {
      await api.post('/inbox/whatsapp/zapi/disconnect', {});
      if (limpar) {
        await api.post('/inbox/whatsapp/clear-all', {});
        setMsg('Desconectado e conversas removidas.');
      } else {
        setMsg('Desconectado. Conversas mantidas.');
      }
      setStatus('disconnected'); setQrcode(null); setPhone(null); stopPoll(); setStep(null);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const clearAll = async () => {
    if (!confirm('⚠️ Isso vai APAGAR TODAS as conversas e mensagens do sistema. Não tem como desfazer. Confirmar?')) return;
    setBusy(true);
    try {
      await api.post('/inbox/whatsapp/clear-all', {});
      setMsg('✅ Todas as conversas foram removidas.');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  // Trocar número: mesmas instruções mas limpa DB antes
  const switchStart = () => {
    setStep('switch-step');
    setMsg('');
  };

  const switchConfirm = async () => {
    setBusy(true);
    setMsg('Limpando dados e gerando QR Code...');
    try {
      await api.post('/inbox/whatsapp/switch-number', { clearConversations: clearConvs });
      await api.post('/inbox/whatsapp/zapi/disconnect', {}).catch(() => {});
      setPhone(null);
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
    setBusy(false);
    setStep('phone-step'); // vai para tela de instrução de desconectar do celular
  };

  const setupWebhooks = async () => {
    setBusy(true);
    try {
      const d = await api.post('/inbox/whatsapp/zapi/setup-webhooks', {});
      setMsg(`✅ Webhooks configurados: ${d.webhookUrl}`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const importHistory = async () => {
    setBusy(true);
    try {
      const d = await api.post('/inbox/whatsapp/import-history', {});
      setMsg(`✅ ${d.imported || 0} conversas importadas`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const mergeDuplicadas = async () => {
    setBusy(true);
    try {
      // 1) Simulação — só conta quantas seriam mescladas
      const dry = await api.post('/inbox/whatsapp/merge-duplicadas', {});
      if (!dry.gruposDuplicados) { setMsg('✅ Nenhuma conversa duplicada encontrada.'); setBusy(false); return; }
      if (!window.confirm(`Encontrei ${dry.gruposDuplicados} contato(s) com conversa DUPLICADA (mesmo número em 2 chats).\n\nMesclar agora? As mensagens vão pra conversa principal e a duplicada é removida.`)) {
        setMsg(`${dry.gruposDuplicados} duplicada(s) encontrada(s). Mesclagem cancelada.`); setBusy(false); return;
      }
      // 2) Aplica de verdade
      const r = await api.post('/inbox/whatsapp/merge-duplicadas', { apply: true });
      setMsg(`✅ ${r.conversasMescladas} conversa(s) duplicada(s) mesclada(s) — ${r.mensagensMovidas} mensagens reunidas na conversa principal.`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const ST = {
    connected:    { label:'Conectado',         color:WA_GREEN,  bg:'#dcfce7', Icon:CheckCircle },
    disconnected: { label:'Desconectado',       color:'#dc2626', bg:'#fee2e2', Icon:WifiOff },
    qrcode:       { label:'Aguardando leitura', color:'#b45309', bg:'#fef3c7', Icon:QrCode },
    loading:      { label:'Carregando...',      color:'var(--muted)', bg:'#f3f4f6', Icon:Loader2 },
    error:        { label:'Erro',               color:'#dc2626', bg:'#fee2e2', Icon:WifiOff },
  };
  const { label, color, bg, Icon } = ST[status] || ST.loading;

  return (
    <div style={{ padding:'32px', maxWidth:620, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>WhatsApp</h1>
      <p style={{ color:'var(--muted)', fontSize:13.5, marginBottom:24 }}>
        Gerencie a conexão com o WhatsApp da clínica via Z-API.
      </p>

      {/* Status card */}
      <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'20px', border:'1px solid var(--border)', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon size={20} color={color} style={status==='loading'?{animation:'spin 1s linear infinite'}:{}}/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14.5 }}>Instância Z-API</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:bg, color, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
                  <Icon size={9}/> {label}
                </span>
                {phone && <span style={{ fontSize:12, color:'var(--muted)' }}>+55 {phone}</span>}
              </div>
            </div>
          </div>
          <button onClick={() => checkStatus(true)} disabled={busy} className="btn btn-g btn-ico">
            <RefreshCw size={13}/>
          </button>
        </div>
        {msg === 'zapi-fallback' && (
          <div style={{ marginTop:12, padding:'14px', background:'#fef3c7', borderRadius:10, border:'1px solid #fde68a' }}>
            <div style={{ fontWeight:700, fontSize:13.5, marginBottom:6 }}>⚠️ Não foi possível gerar QR Code via API</div>
            <p style={{ fontSize:13, color:'#92400e', marginBottom:10, lineHeight:1.5 }}>
              O painel Z-API já está mostrando o QR Code. Acesse diretamente e escaneie de lá:
            </p>
            <a href="https://app.z-api.io" target="_blank" rel="noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', background:'#25D366', color:'#fff', borderRadius:8, fontWeight:700, fontSize:13, textDecoration:'none' }}>
              📱 Abrir painel Z-API e escanear QR
            </a>
            <button onClick={async () => {
              setBusy(true);
              try {
                await api.post('/inbox/whatsapp/zapi/mark-connected', {});
                await api.post('/inbox/whatsapp/zapi/setup-webhooks', {});
                setStatus('connected'); setStep(null);
                setMsg('✅ Marcado como conectado! Importe o histórico para carregar as conversas.');
              } catch (e) { setMsg(e.message); }
              setBusy(false);
            }} disabled={busy}
              style={{ display:'block', marginTop:10, padding:'9px 16px', background:'#0E8C96', color:'#fff', borderRadius:8, fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>
              ✅ Já escaneei — marcar como conectado
            </button>
            <p style={{ fontSize:12, color:'#92400e', marginTop:10 }}>
              Depois de escanear, volte aqui e clique no botão 🔄 para verificar a conexão.
            </p>
          </div>
        )}
        {msg && msg !== 'zapi-fallback' && (
          <div style={{ marginTop:12, padding:'9px 13px', background:'var(--bg)', borderRadius:8, fontSize:13 }}>{msg}</div>
        )}
      </div>

      {/* ── PASSO 1: Instruções para desconectar do celular ── */}
      {(step === 'phone-step' || step === 'switch-step') && (
        <div style={{ background:'#fff7ed', border:'1.5px solid #fed7aa', borderRadius:14, padding:'20px', marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:10, display:'flex', alignItems:'center', gap:7 }}>
            <Smartphone size={16} color="#c2410c"/> Passo 1 — Desconecte no celular
          </div>
          <p style={{ fontSize:13.5, color:'#7c2d12', lineHeight:1.7, marginBottom:16 }}>
            O Z-API guarda a sessão do WhatsApp no servidor. Para gerar um novo QR Code,
            primeiro você precisa <strong>desconectar o aparelho atual no celular</strong>:
          </p>
          <ol style={{ fontSize:13.5, color:'#7c2d12', lineHeight:2, paddingLeft:20, marginBottom:16 }}>
            <li>Abra o <strong>WhatsApp no celular da clínica</strong> (Samsung A15)</li>
            <li>Vá em <strong>⋮ → Aparelhos conectados</strong></li>
            <li>Toque no aparelho chamado <strong>"Z-API"</strong> ou semelhante</li>
            <li>Toque em <strong>"Desconectar"</strong></li>
          </ol>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={()=>setStep(null)} className="btn btn-g" style={{ padding:'10px 14px' }}>
              Cancelar
            </button>
            <button onClick={generateQR} disabled={busy}
              style={{ flex:1, padding:'10px', borderRadius:10, background:WA_GREEN, color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {busy?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<QrCode size={14}/>}
              {busy ? 'Gerando QR...' : 'Desconectei, gerar QR Code'}
            </button>
          </div>
        </div>
      )}

      {/* ── QR Code ── */}
      {status === 'qrcode' && qrcode && step === 'qr-ready' && (
        <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'22px', border:'1.5px solid var(--tq)', marginBottom:16, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:3 }}>Passo 2 — Escaneie o QR Code</div>
          <div style={{ fontSize:12.5, color:'var(--muted)', marginBottom:14 }}>
            No celular que vai usar: <strong>WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho</strong>
          </div>
          <img
            src={qrcode.startsWith('data:') || qrcode.startsWith('http') ? qrcode : `data:image/png;base64,${qrcode}`}
            alt="QR Code WhatsApp"
            style={{ width:200, height:200, borderRadius:10, border:'2px solid var(--border)' }}
          />
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:5, justifyContent:'center', fontSize:12, color:'var(--muted)' }}>
            <Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/> Aguardando leitura...
          </div>
        </div>
      )}

      {/* ── Botões ── */}
      {!step && (
        <div style={{ display:'grid', gap:10 }}>
          {/* Conectar */}
          {(status === 'disconnected' || status === 'error') && (
            <>
              <button onClick={startConnect} disabled={busy}
                style={{ padding:'14px', borderRadius:12, background:WA_GREEN, color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <QrCode size={16}/> Conectar WhatsApp
              </button>
              <button onClick={clearAll} disabled={busy}
                style={{ padding:'11px', borderRadius:11, background:'#fee2e2', border:'1.5px solid #fecaca', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'#dc2626' }}>
                🗑️ Limpar todas as conversas
              </button>
            </>
          )}

          {/* Conectado */}
          {status === 'connected' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={setupWebhooks} disabled={busy}
                style={{ padding:'11px', borderRadius:11, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<span>🔗</span>}
                Configurar webhooks
              </button>
              <button onClick={importHistory} disabled={busy}
                style={{ padding:'11px', borderRadius:11, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<RotateCcw size={13}/>}
                Importar histórico
              </button>
              <button onClick={mergeDuplicadas} disabled={busy}
                title="Junta conversas duplicadas do mesmo contato (mesmo número em 2 chats)"
                style={{ gridColumn:'1 / -1', padding:'11px', borderRadius:11, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<span>🧩</span>}
                Mesclar conversas duplicadas
              </button>
            </div>
          )}

          {/* Trocar número + Desconectar */}
          <div style={{ display:'grid', gridTemplateColumns: status==='connected' ? '1fr 1fr' : '1fr', gap:10 }}>
            {status === 'connected' && (
              <button onClick={disconnect} disabled={busy}
                style={{ padding:'11px', borderRadius:11, background:'#fee2e2', border:'1.5px solid #fecaca', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'#dc2626' }}>
                <LogOut size={13}/> Desconectar
              </button>
            )}
            <button onClick={switchStart} disabled={busy}
              style={{ padding:'11px', borderRadius:11, background:'var(--tq3)', border:'1.5px solid var(--tq)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--tq2)' }}>
              <ArrowRightLeft size={13}/> Trocar número
            </button>
          </div>
        </div>
      )}

      {/* Modal trocar número — opções antes de prosseguir */}
      {step === 'switch-step' && (
        <div style={{ background:'var(--card,#fff)', borderRadius:12, padding:'16px', border:'1px solid var(--border)', marginTop:12 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={clearConvs} onChange={e=>setClearConvs(e.target.checked)}/>
            Remover contatos sem nome ("Contato 1234") antes de trocar
          </label>
          <button onClick={switchConfirm} disabled={busy}
            style={{ marginTop:12, width:'100%', padding:'10px', borderRadius:10, background:'var(--tq)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13 }}>
            Limpar dados e continuar
          </button>
        </div>
      )}
    </div>
  );
}
