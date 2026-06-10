import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, WifiOff, Loader2, QrCode,
         LogOut, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';

const WA_GREEN = '#25D366';

export default function WhatsApp() {
  const api = useApi();
  const [status, setStatus]   = useState('loading'); // loading|connected|disconnected|qrcode|error
  const [qrcode, setQrcode]   = useState(null);
  const [phone, setPhone]     = useState(null);
  const [msg, setMsg]         = useState('');
  const [busy, setBusy]       = useState(false);
  const [modal, setModal]     = useState(false);
  const [clearConvs, setClearConvs] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => { clearInterval(pollRef.current); pollRef.current = null; };

  const checkStatus = async (quiet = false) => {
    try {
      const d = await api.get('/inbox/whatsapp/zapi/status');
      if (d.connected) {
        setStatus('connected'); setQrcode(null); stopPoll();
        setPhone(d.phone || null);
        if (!quiet) setMsg('');
      } else {
        setStatus('disconnected');
      }
    } catch { setStatus('error'); }
  };

  useEffect(() => { checkStatus(); return stopPoll; }, []);

  // Polling de status após gerar QR
  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const d = await api.get('/inbox/whatsapp/zapi/status');
        if (d.connected) {
          setStatus('connected'); setQrcode(null); stopPoll();
          setPhone(d.phone || null);
          setMsg('✅ WhatsApp conectado com sucesso!');
        }
      } catch {}
    }, 3000);
  };

  // Gera QR Code (backend faz restart + retry automático ~30s)
  const connectQR = async () => {
    setBusy(true);
    setMsg('Reiniciando conexão e gerando QR Code... aguarde até 30 segundos.');
    try {
      const d = await api.get('/inbox/whatsapp/zapi/qrcode');
      if (d.qrcode) {
        setQrcode(d.qrcode);
        setStatus('qrcode');
        setMsg('');
        startPoll();
      } else {
        setMsg(d.error || 'Não foi possível gerar QR Code. Tente novamente.');
      }
    } catch (e) { setMsg(e.message || 'Erro ao gerar QR Code.'); }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp?')) return;
    setBusy(true);
    try {
      await api.post('/inbox/whatsapp/zapi/disconnect', {});
      setStatus('disconnected'); setQrcode(null); setPhone(null); stopPoll();
      setMsg('Desconectado. Clique em "Conectar WhatsApp" para reconectar.');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  // Trocar número: limpa DB → aguarda 2s → gera QR
  const switchNumber = async () => {
    setModal(false);
    setBusy(true);
    setMsg('Preparando troca de número...');
    try {
      // 1. Desconecta Z-API
      await api.post('/inbox/whatsapp/zapi/disconnect', {}).catch(() => {});
      // 2. Limpa dados do DB
      await api.post('/inbox/whatsapp/switch-number', { clearConversations: clearConvs });
      setPhone(null);
      setStatus('disconnected');
      // 3. Aguarda 3s para Z-API estabilizar e gera QR
      setMsg('Aguardando Z-API reiniciar... (3s)');
      await new Promise(r => setTimeout(r, 3000));
      setMsg('');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
    // Abre QR automaticamente
    connectQR();
  };

  const importHistory = async () => {
    setBusy(true);
    try {
      const d = await api.post('/inbox/whatsapp/import-history', {});
      setMsg(`✅ ${d.imported || 0} conversas importadas`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const loadPhotos = async () => {
    setBusy(true);
    try {
      const d = await api.post('/inbox/conversations/load-photos', {});
      setMsg(`✅ ${d.updated} fotos atualizadas de ${d.total} contatos`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const ST = {
    connected:    { label:'Conectado',         color:WA_GREEN,  bg:'#dcfce7', Icon:CheckCircle },
    disconnected: { label:'Desconectado',       color:'#dc2626', bg:'#fee2e2', Icon:WifiOff },
    qrcode:       { label:'Aguardando leitura', color:'#b45309', bg:'#fef3c7', Icon:QrCode },
    loading:      { label:'Carregando...',      color:'#6b7280', bg:'#f3f4f6', Icon:Loader2 },
    error:        { label:'Erro',               color:'#dc2626', bg:'#fee2e2', Icon:WifiOff },
  };
  const { label, color, bg, Icon } = ST[status] || ST.loading;

  return (
    <div style={{ padding:'32px', maxWidth:620, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>WhatsApp</h1>
      <p style={{ color:'var(--muted)', fontSize:13.5, marginBottom:24 }}>
        Gerencie a conexão com o WhatsApp da clínica via Z-API.
      </p>

      {/* Card de status */}
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
          <button onClick={()=>checkStatus()} disabled={busy} className="btn btn-g btn-ico" title="Atualizar">
            <RefreshCw size={13}/>
          </button>
        </div>
        {msg && (
          <div style={{ marginTop:12, padding:'9px 13px', background:'var(--bg)', borderRadius:8, fontSize:13, color:'var(--txt)' }}>
            {msg}
          </div>
        )}
      </div>

      {/* QR Code */}
      {status === 'qrcode' && qrcode && (
        <div style={{ background:'var(--card,#fff)', borderRadius:14, padding:'22px', border:'1px solid var(--border)', marginBottom:16, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:3 }}>Escaneie o QR Code</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>
            No celular: WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
          </div>
          <img
            src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
            alt="QR Code WhatsApp"
            style={{ width:200, height:200, borderRadius:10, border:'2px solid var(--border)' }}
          />
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:5, justifyContent:'center', fontSize:12, color:'var(--muted)' }}>
            <Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/> Aguardando leitura...
          </div>
        </div>
      )}

      {/* Botões de ação */}
      <div style={{ display:'grid', gap:10, marginBottom:16 }}>

        {/* Conectar */}
        {(status === 'disconnected' || status === 'error') && (
          <button onClick={connectQR} disabled={busy}
            style={{ padding:'14px', borderRadius:12, background:WA_GREEN, color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {busy ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <QrCode size={16}/>}
            {busy ? 'Aguarde...' : 'Conectar WhatsApp'}
          </button>
        )}

        {/* Conectado: importar histórico + fotos */}
        {status === 'connected' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <button onClick={importHistory} disabled={busy}
              style={{ padding:'11px', borderRadius:11, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<RotateCcw size={13}/>}
              Importar histórico
            </button>
            <button onClick={loadPhotos} disabled={busy}
              style={{ padding:'11px', borderRadius:11, background:'var(--card,#fff)', border:'1.5px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<span>👤</span>}
              Carregar fotos
            </button>
          </div>
        )}

        {/* Linha inferior: Desconectar + Trocar número */}
        <div style={{ display:'grid', gridTemplateColumns: status==='connected' ? '1fr 1fr' : '1fr', gap:10 }}>
          {status === 'connected' && (
            <button onClick={disconnect} disabled={busy}
              style={{ padding:'11px', borderRadius:11, background:'#fee2e2', border:'1.5px solid #fecaca', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'#dc2626' }}>
              {busy?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<LogOut size={13}/>}
              Desconectar
            </button>
          )}
          <button onClick={()=>setModal(true)} disabled={busy}
            style={{ padding:'11px', borderRadius:11, background:'var(--tq3)', border:'1.5px solid var(--tq)', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--tq2)' }}>
            <ArrowRightLeft size={13}/> Trocar número
          </button>
        </div>
      </div>

      {/* Modal trocar número */}
      {modal && (
        <div onClick={e=>e.target===e.currentTarget&&setModal(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--card,#fff)', borderRadius:16, padding:'26px', maxWidth:400, width:'92%', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>🔄 Trocar número WhatsApp</div>
            <p style={{ fontSize:13.5, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>
              O sistema vai desconectar o número atual e abrir o QR Code para você escanear com o novo celular.
            </p>
            <div style={{ background:'#fef3c7', borderRadius:9, padding:'11px', marginBottom:16, fontSize:13, color:'#92400e' }}>
              ⚠️ As conversas existentes são mantidas. Apenas a sessão WhatsApp muda.
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginBottom:20, cursor:'pointer' }}>
              <input type="checkbox" checked={clearConvs} onChange={e=>setClearConvs(e.target.checked)}/>
              Remover contatos sem nome ("Contato 1234")
            </label>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setModal(false)} className="btn btn-g" style={{ flex:1, padding:'10px' }}>Cancelar</button>
              <button onClick={switchNumber}
                style={{ flex:1, padding:'10px', borderRadius:10, background:'var(--tq)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <ArrowRightLeft size={13}/> Trocar e gerar QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
