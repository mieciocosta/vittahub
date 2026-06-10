import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle,
         Loader2, QrCode, LogOut, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';

const WA_GREEN = '#25D366';

export default function WhatsApp() {
  const api = useApi();
  const [status, setStatus] = useState('loading');
  const [qrcode, setQrcode] = useState(null);
  const [phone, setPhone] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState('');
  const [switchModal, setSwitchModal] = useState(false);
  const [clearConvs, setClearConvs] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };

  const checkStatus = useCallback(async () => {
    try {
      const data = await api.get('/inbox/whatsapp/zapi/status');
      if (data.connected) {
        setStatus('connected'); setQrcode(null); stopPoll();
        setPhone(data.phone || data.connectedPhone || null);
      } else {
        setStatus('disconnected');
      }
    } catch { setStatus('error'); }
  }, [api]);

  useEffect(() => { checkStatus(); return stopPoll; }, []);

  const startQrPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get('/inbox/whatsapp/zapi/status');
        if (data.connected) {
          setStatus('connected'); setQrcode(null); stopPoll();
          setPhone(data.phone || null);
          setMessage('✅ WhatsApp conectado com sucesso!');
        }
      } catch {}
    }, 3000);
  };

  const getQrCode = async () => {
    setLoading('qr');
    try {
      const data = await api.get('/inbox/whatsapp/zapi/qrcode');
      if (data.qrcode) {
        setQrcode(data.qrcode);
        setStatus('qrcode');
        setMessage('');
        startQrPoll();
      } else {
        setMessage('Não foi possível gerar QR Code. Aguarde alguns segundos e tente novamente.');
      }
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  // Desconectar: chama disconnect E depois restart para limpar sessão
  // Z-API reconecta automaticamente, então o jeito é gerar novo QR imediatamente
  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? O bot ficará offline até reconectar.')) return;
    setLoading('disconnect');
    try {
      await api.post('/inbox/whatsapp/zapi/disconnect', {});
      setStatus('disconnected'); setQrcode(null); setPhone(null); stopPoll();
      setMessage('WhatsApp desconectado. Clique em "Conectar WhatsApp" para reconectar.');
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  // Trocar número: desconecta e já abre QR para novo número
  const switchNumber = async () => {
    setLoading('switch');
    setSwitchModal(false);
    try {
      // Limpa dados conflitantes no backend
      await api.post('/inbox/whatsapp/switch-number', { clearConversations: clearConvs });
      // Desconecta Z-API
      await api.post('/inbox/whatsapp/zapi/disconnect', {}).catch(() => {});
      setStatus('disconnected'); setPhone(null);
      setMessage('Pronto! Agora clique em "Conectar WhatsApp" e escaneie com o novo número.');
      // Automaticamente gera QR após 1s
      setTimeout(getQrCode, 1000);
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const importHistory = async () => {
    setLoading('import');
    try {
      const data = await api.post('/inbox/whatsapp/import-history', {});
      setMessage(`✅ ${data.imported || 0} conversas importadas`);
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const loadPhotos = async () => {
    setLoading('photos');
    try {
      const data = await api.post('/inbox/conversations/load-photos', {});
      setMessage(`✅ ${data.updated} fotos atualizadas de ${data.total} contatos`);
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const ST = {
    connected:    { label:'Conectado',         color:WA_GREEN,  bg:'#dcfce7', icon:CheckCircle },
    disconnected: { label:'Desconectado',       color:'#dc2626', bg:'#fee2e2', icon:WifiOff },
    qrcode:       { label:'Aguardando leitura', color:'#b45309', bg:'#fef3c7', icon:QrCode },
    loading:      { label:'Verificando...',     color:'#6b7280', bg:'#f3f4f6', icon:Loader2 },
    error:        { label:'Erro de conexão',    color:'#dc2626', bg:'#fee2e2', icon:AlertCircle },
  };
  const st = ST[status] || ST.loading;
  const Icon = st.icon;

  return (
    <div style={{ padding:'32px', maxWidth:640, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>WhatsApp</h1>
      <p style={{ color:'var(--muted)', fontSize:13.5, marginBottom:28 }}>
        Gerencie a conexão com o WhatsApp da clínica via Z-API.
      </p>

      {/* Status card */}
      <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'22px', border:'1px solid var(--border)', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:st.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={22} color={st.color} style={status==='loading'?{animation:'spin 1s linear infinite'}:{}}/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Instância Z-API</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:st.bg, color:st.color, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
                  <Icon size={10}/> {st.label}
                </span>
                {phone && <span style={{ fontSize:12, color:'var(--muted)' }}>+55 {phone}</span>}
              </div>
            </div>
          </div>
          <button onClick={checkStatus} className="btn btn-g btn-ico" title="Atualizar status">
            <RefreshCw size={14}/>
          </button>
        </div>
        {message && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'var(--bg)', borderRadius:8, fontSize:13, color:'var(--txt)' }}>
            {message}
          </div>
        )}
      </div>

      {/* QR Code */}
      {status === 'qrcode' && qrcode && (
        <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'24px', border:'1px solid var(--border)', marginBottom:20, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Escaneie com o WhatsApp do celular</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
            WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
          </div>
          <img
            src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
            alt="QR Code"
            style={{ width:220, height:220, borderRadius:12, border:'3px solid var(--border)' }}
          />
          <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:6, justifyContent:'center', color:'var(--muted)', fontSize:12 }}>
            <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/> Aguardando leitura do QR Code...
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        {(status === 'disconnected' || status === 'error') && (
          <button onClick={getQrCode} disabled={loading==='qr'}
            style={{ gridColumn:'1/-1', padding:'14px', borderRadius:12, background:WA_GREEN, color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading==='qr'?<Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/>:<QrCode size={16}/>}
            Conectar WhatsApp
          </button>
        )}

        {status === 'connected' && (
          <>
            <button onClick={importHistory} disabled={!!loading}
              style={{ padding:'12px', borderRadius:12, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--txt)' }}>
              {loading==='import'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<RotateCcw size={14}/>}
              Importar histórico
            </button>
            <button onClick={loadPhotos} disabled={!!loading}
              style={{ padding:'12px', borderRadius:12, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--txt)' }}>
              {loading==='photos'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<span>👤</span>}
              Carregar fotos
            </button>
            <button onClick={disconnect} disabled={!!loading}
              style={{ padding:'12px', borderRadius:12, background:'#fee2e2', border:'1.5px solid #fecaca', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'#dc2626' }}>
              {loading==='disconnect'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<LogOut size={14}/>}
              Desconectar
            </button>
          </>
        )}

        <button onClick={()=>setSwitchModal(true)} disabled={!!loading}
          style={{ padding:'12px', borderRadius:12, background:'var(--tq3)', border:'1.5px solid var(--tq)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--tq2)' }}>
          <ArrowRightLeft size={14}/> Trocar número
        </button>
      </div>

      {/* Aviso Z-API */}
      {status === 'disconnected' && (
        <div style={{ background:'#fef3c7', borderRadius:12, padding:'14px', border:'1px solid #fde68a', fontSize:13, color:'#92400e', marginBottom:20 }}>
          <strong>ℹ️ Sobre a Z-API:</strong> A Z-API mantém a sessão ativa no servidor. Para trocar de número, clique em "Trocar número" — isso gera um novo QR Code para você escanear com o novo celular, substituindo a sessão anterior.
        </div>
      )}

      {/* Modal Trocar Número */}
      {switchModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--card,#fff)', borderRadius:16, padding:'28px', maxWidth:420, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>🔄 Trocar número WhatsApp</div>
            <p style={{ fontSize:13.5, color:'var(--muted)', lineHeight:1.6, marginBottom:16 }}>
              Após confirmar, o sistema vai gerar um QR Code automaticamente. Escaneie com o <strong>novo número</strong> para substituir a sessão atual.
            </p>
            <div style={{ background:'#fef3c7', borderRadius:10, padding:'12px 14px', marginBottom:18, fontSize:13, color:'#92400e' }}>
              <strong>⚠️</strong> As conversas existentes são mantidas. Apenas a conexão do WhatsApp muda.
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginBottom:22, cursor:'pointer' }}>
              <input type="checkbox" checked={clearConvs} onChange={e=>setClearConvs(e.target.checked)}/>
              <span>Remover contatos sem nome ("Contato 1234")</span>
            </label>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setSwitchModal(false)} className="btn btn-g" style={{ flex:1, padding:'10px' }}>
                Cancelar
              </button>
              <button onClick={switchNumber} disabled={loading==='switch'}
                style={{ flex:1, padding:'10px', borderRadius:10, background:'var(--tq)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {loading==='switch'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<ArrowRightLeft size={14}/>}
                Trocar e gerar QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WA_GREEN = '#25D366';

export default function WhatsApp() {
  const api = useApi();
  const [status, setStatus] = useState('loading');
  const [qrcode, setQrcode] = useState(null);
  const [phone, setPhone] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState('');
  const [switchModal, setSwitchModal] = useState(false);
  const [clearConvs, setClearConvs] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };

  const checkStatus = useCallback(async (useZapi = false) => {
    try {
      const endpoint = useZapi ? '/inbox/whatsapp/zapi/status' : '/inbox/whatsapp/status';
      const data = await api.get(endpoint);
      if (data.connected) {
        setStatus('connected'); setQrcode(null); stopPoll();
        setPhone(data.phone || data.connectedPhone || null);
      } else if (data.status === 'not_configured') {
        setStatus('not_configured'); setMessage(data.message || '');
      } else {
        setStatus('disconnected');
      }
    } catch { setStatus('error'); }
  }, [api]);

  useEffect(() => { checkStatus(); return stopPoll; }, []);

  // Polling para detectar quando QR foi escaneado
  const startQrPoll = () => {
    stopPoll();
    pollRef.current = setInterval(() => checkStatus(true), 3000);
  };

  const getQrCode = async () => {
    setLoading('qr');
    try {
      const data = await api.get('/inbox/whatsapp/zapi/qrcode');
      if (data.qrcode) { setQrcode(data.qrcode); setStatus('qrcode'); startQrPoll(); }
      else setMessage('Não foi possível gerar QR Code. Tente novamente.');
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? O bot e envio de mensagens ficarão indisponíveis.')) return;
    setLoading('disconnect');
    try {
      await api.post('/inbox/whatsapp/zapi/disconnect', {});
      setStatus('disconnected'); setQrcode(null); setPhone(null); stopPoll();
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const switchNumber = async () => {
    setLoading('switch');
    try {
      // 1. Desconecta número atual
      await api.post('/inbox/whatsapp/zapi/disconnect', {}).catch(() => {});
      // 2. Limpa dados conflitantes
      await api.post('/inbox/whatsapp/switch-number', { clearConversations: clearConvs });
      setStatus('disconnected'); setQrcode(null); setPhone(null); stopPoll();
      setSwitchModal(false);
      setMessage('Número desconectado. Clique em "Conectar WhatsApp" para escanear o novo QR Code.');
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const importHistory = async () => {
    setLoading('import');
    try {
      const data = await api.post('/inbox/whatsapp/import-history', {});
      setMessage(`✅ ${data.imported || 0} conversas importadas`);
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const loadPhotos = async () => {
    setLoading('photos');
    try {
      const data = await api.post('/inbox/conversations/load-photos', {});
      setMessage(`✅ ${data.updated} fotos atualizadas de ${data.total} contatos`);
    } catch (e) { setMessage(e.message); }
    setLoading('');
  };

  const ST = {
    connected:      { label:'Conectado',          color:WA_GREEN,  bg:'#dcfce7', icon:CheckCircle },
    disconnected:   { label:'Desconectado',        color:'#dc2626', bg:'#fee2e2', icon:WifiOff },
    qrcode:         { label:'Aguardando leitura',  color:'#b45309', bg:'#fef3c7', icon:QrCode },
    loading:        { label:'Verificando...',      color:'#6b7280', bg:'#f3f4f6', icon:Loader2 },
    error:          { label:'Erro de conexão',     color:'#dc2626', bg:'#fee2e2', icon:AlertCircle },
    not_configured: { label:'Não configurado',     color:'#6b7280', bg:'#f3f4f6', icon:AlertCircle },
  };
  const st = ST[status] || ST.loading;
  const Icon = st.icon;

  return (
    <div style={{ padding:'32px', maxWidth:640, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>WhatsApp</h1>
      <p style={{ color:'var(--muted)', fontSize:13.5, marginBottom:28 }}>
        Gerencie a conexão com o WhatsApp da clínica via Z-API.
      </p>

      {/* Status card */}
      <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'22px', border:'1px solid var(--border)', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:st.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={22} color={st.color} style={status==='loading'?{animation:'spin 1s linear infinite'}:{}}/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Instância Z-API</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:st.bg, color:st.color, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
                  <Icon size={10}/> {st.label}
                </span>
                {phone && <span style={{ fontSize:12, color:'var(--muted)' }}>+55 {phone}</span>}
              </div>
            </div>
          </div>
          <button onClick={()=>checkStatus(true)} className="btn btn-g btn-ico" title="Atualizar status">
            <RefreshCw size={14}/>
          </button>
        </div>

        {message && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'var(--bg)', borderRadius:8, fontSize:13, color:'var(--txt)' }}>
            {message}
          </div>
        )}
      </div>

      {/* QR Code */}
      {status === 'qrcode' && qrcode && (
        <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'24px', border:'1px solid var(--border)', marginBottom:20, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Escaneie o QR Code no WhatsApp do celular da clínica</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
            WhatsApp → Aparelhos conectados → Conectar aparelho
          </div>
          <img src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
            alt="QR Code" style={{ width:220, height:220, borderRadius:12, border:'3px solid var(--border)' }}
            onError={()=>setMessage('Erro ao exibir QR Code')}/>
          <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:6, justifyContent:'center', color:'var(--muted)', fontSize:12 }}>
            <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/> Aguardando leitura...
          </div>
        </div>
      )}

      {/* Ações principais */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        {(status === 'disconnected' || status === 'error' || status === 'not_configured') && (
          <button onClick={getQrCode} disabled={loading==='qr'}
            style={{ gridColumn:'1/-1', padding:'14px', borderRadius:12, background:WA_GREEN, color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading==='qr' ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <QrCode size={16}/>}
            Conectar WhatsApp
          </button>
        )}

        {status === 'connected' && (
          <>
            <button onClick={importHistory} disabled={!!loading}
              style={{ padding:'12px', borderRadius:12, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--txt)' }}>
              {loading==='import'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<RotateCcw size={14}/>}
              Importar histórico
            </button>
            <button onClick={loadPhotos} disabled={!!loading}
              style={{ padding:'12px', borderRadius:12, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--txt)' }}>
              {loading==='photos'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<span>👤</span>}
              Carregar fotos
            </button>
          </>
        )}

        {(status === 'connected' || status === 'qrcode') && (
          <button onClick={disconnect} disabled={!!loading}
            style={{ padding:'12px', borderRadius:12, background:'#fee2e2', border:'1.5px solid #fecaca', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'#dc2626' }}>
            {loading==='disconnect'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<LogOut size={14}/>}
            Desconectar
          </button>
        )}

        {/* Trocar número — disponível sempre */}
        <button onClick={()=>setSwitchModal(true)} disabled={!!loading}
          style={{ padding:'12px', borderRadius:12, background:'var(--tq3)', border:'1.5px solid var(--tq)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--tq2)' }}>
          <ArrowRightLeft size={14}/> Trocar número
        </button>
      </div>

      {/* Informações */}
      <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'18px', border:'1px solid var(--border)' }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Configuração Z-API</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            ['Instância', process.env.REACT_APP_ZAPI_INSTANCE || '3F462B22...'],
            ['Status', st.label],
            ['Webhook', '/api/inbox/webhook/zapi'],
            ['Bot IA', process.env.REACT_APP_HAS_AI ? 'Claude Haiku ✅' : 'Configurar ANTHROPIC_API_KEY'],
          ].map(([k,v])=>(
            <div key={k} style={{ background:'var(--bg)', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginBottom:2 }}>{k}</div>
              <div style={{ fontSize:12.5, fontWeight:600 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Trocar número */}
      {switchModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--card,#fff)', borderRadius:16, padding:'28px', maxWidth:420, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>🔄 Trocar número WhatsApp</div>
            <p style={{ fontSize:13.5, color:'var(--muted)', lineHeight:1.6, marginBottom:20 }}>
              Isso vai desconectar o número atual da Z-API. Depois você poderá escanear o QR Code do novo número.
            </p>

            <div style={{ background:'#fef3c7', borderRadius:10, padding:'12px 14px', marginBottom:18, fontSize:13 }}>
              <strong>⚠️ Atenção:</strong> O bot e o envio de mensagens ficarão offline durante a troca. As conversas existentes são mantidas.
            </div>

            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginBottom:20, cursor:'pointer' }}>
              <input type="checkbox" checked={clearConvs} onChange={e=>setClearConvs(e.target.checked)}/>
              <span>Limpar contatos sem nome (criados automaticamente como "Contato XXXX")</span>
            </label>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setSwitchModal(false)} className="btn btn-g" style={{ flex:1, padding:'10px' }}>
                Cancelar
              </button>
              <button onClick={switchNumber} disabled={loading==='switch'}
                style={{ flex:1, padding:'10px', borderRadius:10, background:'var(--tq)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {loading==='switch'?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<ArrowRightLeft size={14}/>}
                Trocar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
